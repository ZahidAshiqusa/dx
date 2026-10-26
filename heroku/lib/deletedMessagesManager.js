const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');

const DATA_FILE = path.join(__dirname, '..', 'data', 'deleted_messages.json');
const MEDIA_DIR = path.join(__dirname, '..', 'data', 'deleted_media');
const MAX_LOGS = 250;
const BUFFER_LIMIT = 800;

function formatTime(dateObj = new Date()) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  try {
    return new Intl.DateTimeFormat('en-PK', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d) + ' PKT';
  } catch (_) {
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const pktDate = new Date(utc + (3600000 * 5));
    let hours = pktDate.getHours();
    const minutes = String(pktDate.getMinutes()).padStart(2, '0');
    const seconds = String(pktDate.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm} PKT`;
  }
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

class DeletedMessagesManager {
  constructor() {
    this.messageBuffer = new Map(); // msgId -> buffered message
    this.bufferOrder = []; // array of msgIds to enforce LRU limit
    this.ensureStorage();
  }

  ensureStorage() {
    try {
      fs.ensureDirSync(MEDIA_DIR);
      if (!fs.existsSync(DATA_FILE)) {
        fs.ensureDirSync(path.dirname(DATA_FILE));
        fs.writeFileSync(DATA_FILE, JSON.stringify({ logs: [] }, null, 2));
      }
    } catch (e) {
      console.warn('[DeletedMessages] Storage init warning:', e.message);
    }
  }

  loadLogs() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const data = JSON.parse(raw);
        return Array.isArray(data.logs) ? data.logs : [];
      }
    } catch (err) {
      console.warn('[DeletedMessages] Read logs error:', err.message);
    }
    return [];
  }

  saveLogs(logs) {
    try {
      fs.ensureDirSync(path.dirname(DATA_FILE));
      fs.writeFileSync(DATA_FILE, JSON.stringify({ logs }, null, 2));
    } catch (err) {
      console.error('[DeletedMessages] Save logs error:', err.message);
    }
  }

  async bufferIncomingMessage(m, sock) {
    if (!m || !m.key || !m.message) return;
    const remoteJid = m.key.remoteJid || '';

    // Direct private chats only (exclude group chats and status broadcasts)
    if (remoteJid.endsWith('@g.us') || remoteJid.includes('status@broadcast')) {
      return;
    }

    const msgId = m.key.id;
    if (!msgId) return;

    // Do not buffer our own sent messages for anti-delete
    if (m.key.fromMe) return;

    const participant = m.key.participant || remoteJid;
    const senderDigits = participant.replace(/[^0-9]/g, '');
    const now = Date.now();

    const msg = m.message;
    let type = 'text';
    let text = msg.conversation || msg.extendedTextMessage?.text || '';
    let mediaFilename = null;
    let mime = null;
    let isPttVoice = false;
    let isPtvVideo = false;

    // Check media types
    if (msg.imageMessage) {
      type = 'photo';
      text = msg.imageMessage.caption || text || '';
      mime = msg.imageMessage.mimetype || 'image/jpeg';
      mediaFilename = `${msgId}.jpg`;
    } else if (msg.videoMessage) {
      type = 'video';
      text = msg.videoMessage.caption || text || '';
      mime = msg.videoMessage.mimetype || 'video/mp4';
      isPtvVideo = !!msg.videoMessage.ptv;
      mediaFilename = `${msgId}.mp4`;
    } else if (msg.audioMessage) {
      type = 'voice';
      mime = msg.audioMessage.mimetype || 'audio/ogg; codecs=opus';
      isPttVoice = !!msg.audioMessage.ptt;
      mediaFilename = `${msgId}.ogg`;
    }

    const item = {
      messageId: msgId,
      sender: senderDigits,
      senderJid: participant,
      type, // 'text' | 'photo' | 'video' | 'voice'
      text,
      mediaFilename,
      mime,
      isPttVoice,
      isPtvVideo,
      sentAt: now,
      sentTimeFormatted: formatTime(now),
      mediaDownloaded: false
    };

    // Pre-download media buffer to local disk in the background
    if (mediaFilename && sock) {
      const destPath = path.join(MEDIA_DIR, mediaFilename);
      downloadMediaMessage(
        m,
        'buffer',
        {},
        { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
      ).then(async (buffer) => {
        try {
          await fs.writeFile(destPath, buffer);
          item.mediaDownloaded = true;
          item.mediaSize = buffer.length;
        } catch (writeErr) {
          console.warn('[DeletedMessages] Media write error:', writeErr.message);
        }
      }).catch(dlErr => {
        console.warn(`[DeletedMessages] Pre-download failed for ${msgId}:`, dlErr.message);
      });
    }

    // Maintain LRU ring buffer
    if (this.messageBuffer.has(msgId)) {
      this.bufferOrder = this.bufferOrder.filter(id => id !== msgId);
    }
    this.messageBuffer.set(msgId, item);
    this.bufferOrder.push(msgId);

    if (this.bufferOrder.length > BUFFER_LIMIT) {
      const oldestId = this.bufferOrder.shift();
      const oldestItem = this.messageBuffer.get(oldestId);
      if (oldestItem && oldestItem.mediaFilename) {
        // If message was never deleted, prune downloaded file to save disk space
        const p = path.join(MEDIA_DIR, oldestItem.mediaFilename);
        fs.unlink(p).catch(() => {});
      }
      this.messageBuffer.delete(oldestId);
    }
  }

  async handleRevocation(revokedMsgId, revocationMessage, io, cloudinaryManager) {
    if (!revokedMsgId) return null;

    const original = this.messageBuffer.get(revokedMsgId);
    if (!original) {
      return null;
    }

    const now = Date.now();
    const durationMs = now - original.sentAt;
    const durationActive = formatDuration(durationMs);
    const deletedTimeFormatted = formatTime(now);

    const deletedRecord = {
      id: `del_${revokedMsgId}_${now}`,
      messageId: revokedMsgId,
      sender: original.sender,
      senderJid: original.senderJid,
      type: original.type,
      text: original.text,
      mediaFilename: original.mediaFilename,
      mediaUrl: original.mediaFilename ? `/api/deleted-media/${original.mediaFilename}` : null,
      mime: original.mime,
      isPttVoice: original.isPttVoice,
      isPtvVideo: original.isPtvVideo,
      sentAt: original.sentAt,
      sentTimeFormatted: original.sentTimeFormatted,
      deletedAt: now,
      deletedTimeFormatted,
      durationActive,
      cloudinaryUrl: null
    };

    // Check if Cloudinary is configured to host the deleted media
    if (original.mediaFilename && cloudinaryManager && cloudinaryManager.isConfigured()) {
      const filePath = path.join(MEDIA_DIR, original.mediaFilename);
      if (fs.existsSync(filePath)) {
        try {
          const fileBuf = await fs.readFile(filePath);
          let resourceType = 'auto';
          if (original.type === 'photo') resourceType = 'image';
          else if (original.type === 'video' || original.type === 'voice') resourceType = 'video';

          const cRes = await cloudinaryManager.upload(fileBuf, {
            folder: 'zaid-bot-deleted-media',
            resourceType,
            filename: original.mediaFilename
          });
          if (cRes && cRes.secure_url) {
            deletedRecord.cloudinaryUrl = cRes.secure_url;
          }
        } catch (cErr) {
          console.warn('[DeletedMessages] Cloudinary backup upload warning:', cErr.message);
        }
      }
    }

    // Persist to data/deleted_messages.json
    const logs = this.loadLogs();
    logs.unshift(deletedRecord);
    if (logs.length > MAX_LOGS) {
      logs.splice(MAX_LOGS);
    }
    this.saveLogs(logs);

    // Keep the file permanently in deleted_media so it doesn't get cleared by LRU
    this.messageBuffer.delete(revokedMsgId);
    this.bufferOrder = this.bufferOrder.filter(id => id !== revokedMsgId);

    console.log(`[ANTI-DELETE] Captured deleted ${original.type} message from +${original.sender} (Sent: ${original.sentTimeFormatted}, Deleted: ${deletedTimeFormatted})`);

    // Emit live Socket.io event
    if (io) {
      io.emit('deleted_message_captured', deletedRecord);
    }

    return deletedRecord;
  }

  getLogs(filterNumber = null, filterType = null) {
    let logs = this.loadLogs();

    if (filterNumber) {
      const digits = String(filterNumber).replace(/[^0-9]/g, '');
      if (digits) {
        logs = logs.filter(l => l.sender.includes(digits));
      }
    }

    if (filterType && filterType !== 'all') {
      logs = logs.filter(l => l.type === filterType);
    }

    return logs;
  }

  clearLogs() {
    this.saveLogs([]);
    return true;
  }

  getMediaFilePath(filename) {
    if (!filename) return null;
    const safeName = path.basename(filename);
    const fullPath = path.join(MEDIA_DIR, safeName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }
}

module.exports = new DeletedMessagesManager();
