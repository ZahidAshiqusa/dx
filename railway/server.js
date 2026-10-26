/**
 * ZAID ASHIQ STUDIO - Full-Stack WhatsApp Multi-Feature Bot & Control Panel
 * Backend Server with Express, Socket.io, Baileys, and Full Bot Commands
 */

// Guard against accidental Vercel Serverless Function invocations
if (process.env.VERCEL) {
  module.exports = (req, res) => {
    if (res && typeof res.status === 'function') {
      res.status(200).json({
        success: true,
        message: 'This is the persistent WhatsApp Bot server. Deploy the frontend from /frontend.',
        platform: 'Vercel Lambda Guard'
      });
    }
  };
  return;
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const qrcode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  proto,
  generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

// Image processing libraries (sharp + jimp fallback)
let sharp = null;
try {
  sharp = require('sharp');
} catch (_) {}

let Jimp = null;
try {
  const jModule = require('jimp');
  Jimp = jModule.Jimp || jModule;
} catch (_) {}

// Cloud & Extended Tool Modules
const onlineTracer = require('./lib/onlineTracer');
const cloudinaryManager = require('./lib/cloudinary');
const githubBackup = require('./lib/githubBackup');
const deletedMessagesManager = require('./lib/deletedMessagesManager');

const app = express();
const server = http.createServer(app);

// Enable CORS for Vercel frontends, Railway, and localhost
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Generous body limit for high-resolution uncropped DP uploads and sessions
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const SESSION_DIR = path.resolve(__dirname, 'auth_info');

// Serve static frontend files if available (vercel, local, or sibling)
const potentialFrontendDirs = [
  path.join(__dirname, 'vercel'),
  path.join(__dirname, 'frontend'),
  path.join(__dirname, '..', 'vercel'),
  path.join(__dirname, '..', 'frontend'),
  path.join(__dirname, 'public')
];
for (const dir of potentialFrontendDirs) {
  if (fs.existsSync(dir)) {
    app.use(express.static(dir));
    break;
  }
}

// In-Memory Storage
let connectionStatus = 'disconnected'; // "disconnected" | "awaiting_scan" | "connected"
let botJid = null;
let lastQrDataUrl = null;
let pairingCodeCache = null;
const viewOnceItems = [];
const statusItems = [];

// ─── Runtime Directories Initialization ─────────────────────────────────────
const runtimeDirs = [
  path.join(__dirname, 'session'),
  path.join(__dirname, 'auth_info'),
  path.join(__dirname, 'temp_media'),
  path.join(__dirname, 'database')
];
for (const dir of runtimeDirs) {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
}

// ─── Bot Commands Dynamic Loader ─────────────────────────────────────────────
const commands = new Map();
const commandsDir = path.join(__dirname, 'commands');

function loadBotCommands() {
  if (!fs.existsSync(commandsDir)) return;
  try {
    const files = fs.readdirSync(commandsDir);
    let count = 0;
    for (const file of files) {
      if (file.endsWith('.js')) {
        const cmdName = file.slice(0, -3).toLowerCase();
        try {
          const mod = require(path.join(commandsDir, file));
          commands.set(cmdName, mod);
          count++;
        } catch (loadErr) {
          console.warn(`[COMMANDS] Failed loading ${file}:`, loadErr.message);
        }
      }
    }
    console.log(`[COMMANDS] Loaded ${count} bot commands from commands/`);
  } catch (err) {
    console.warn('[COMMANDS] Directory scan error:', err.message);
  }
}
loadBotCommands();

// ─── Session Restoration Engine ──────────────────────────────────────────────
function restoreSession(sessionId, sessionDir = SESSION_DIR) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  try {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    const credsFile = path.join(sessionDir, 'creds.json');
    let cleanSession = sessionId.trim();
    if (cleanSession.includes('~')) {
      cleanSession = cleanSession.split('~').slice(1).join('~');
    }

    // Attempt 1: Decode as ZIP archive (contains complete session folder)
    try {
      const buffer = Buffer.from(cleanSession, 'base64');
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      if (entries.length > 0) {
        zip.extractAllTo(sessionDir, true);
        console.log(`[SESSION] Successfully extracted ${entries.length} files from ZIP archive`);
        return true;
      }
    } catch (_) {}

    // Attempt 2: Decode as Base64 JSON creds
    try {
      const buffer = Buffer.from(cleanSession, 'base64');
      const jsonStr = buffer.toString('utf8');
      const json = JSON.parse(jsonStr);
      if (json.creds || json.me || json.account || json.noiseKey) {
        fs.writeFileSync(credsFile, JSON.stringify(json, null, 2), 'utf8');
        console.log('[SESSION] Restored creds from Base64 JSON');
        return true;
      }
    } catch (_) {}

    // Attempt 3: Direct JSON string
    try {
      const json = JSON.parse(cleanSession);
      if (json.creds || json.me || json.account || json.noiseKey) {
        fs.writeFileSync(credsFile, JSON.stringify(json, null, 2), 'utf8');
        console.log('[SESSION] Restored creds from raw JSON');
        return true;
      }
    } catch (_) {}

    // Attempt 4: Base64 raw text write
    try {
      const buffer = Buffer.from(cleanSession, 'base64');
      if (buffer.length > 30) {
        fs.writeFileSync(credsFile, buffer.toString('utf8'), 'utf8');
        console.log('[SESSION] Restored raw Base64 payload into creds.json');
        return true;
      }
    } catch (_) {}

    return false;
  } catch (err) {
    console.error('[SESSION] Restore failure:', err.message);
    return false;
  }
}

// ─── Uncropped HD Profile Picture Builder ─────────────────────────────────────
async function buildUncroppedHDProfilePic(buffer, bgColor = '#0f172a') {
  if (sharp) {
    try {
      const image = sharp(buffer);
      const metadata = await image.metadata();
      const origW = metadata.width || 640;
      const origH = metadata.height || 640;
      const maxSide = Math.min(Math.max(origW, origH), 1280);
      const background = (bgColor === 'blur' || !bgColor) ? '#0f172a' : bgColor;

      return await image
        .resize(maxSide, maxSide, {
          fit: 'contain',
          background: background
        })
        .jpeg({ quality: 95 })
        .toBuffer();
    } catch (sharpErr) {
      console.warn('[DP-BUILDER] Sharp processing failed, trying Jimp fallback:', sharpErr.message);
    }
  }

  if (Jimp) {
    const image = await Jimp.read(buffer);
    const w = image.getWidth ? image.getWidth() : image.bitmap.width;
    const h = image.getHeight ? image.getHeight() : image.bitmap.height;
    const maxSide = Math.min(Math.max(w, h), 1280);

    if (image.scaleToFit) {
      image.scaleToFit(maxSide, maxSide);
    } else if (image.resize) {
      image.resize({ w: maxSide, h: maxSide });
    }

    const newW = image.getWidth ? image.getWidth() : image.bitmap.width;
    const newH = image.getHeight ? image.getHeight() : image.bitmap.height;

    const canvas = new Jimp({ width: maxSide, height: maxSide, color: 0x0f172aff });
    const xOffset = Math.floor((maxSide - newW) / 2);
    const yOffset = Math.floor((maxSide - newH) / 2);

    if (canvas.composite) canvas.composite(image, xOffset, yOffset);

    if (canvas.getBuffer) {
      return await canvas.getBuffer('image/jpeg');
    } else if (canvas.getBufferAsync) {
      return await canvas.quality(95).getBufferAsync(Jimp.MIME_JPEG);
    }
  }

  return buffer;
}

// ─── Baileys WhatsApp Socket Lifecycle ───────────────────────────────────────
let sock = null;
let isStarting = false;

async function startWhatsApp() {
  if (isStarting) return;
  isStarting = true;

  try {
    // If GitHub token is provided and creds are missing, attempt auto-restore from GitHub
    await githubBackup.autoRestoreSession(SESSION_DIR).catch(() => {});

    // If SESSION_ID environment variable is provided, restore it first
    if (process.env.SESSION_ID && !fs.existsSync(path.join(SESSION_DIR, 'creds.json'))) {
      console.log('[STARTUP] SESSION_ID env found, restoring...');
      restoreSession(process.env.SESSION_ID, SESSION_DIR);
    }

    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['ZAID ASHIQ STUDIO', 'Chrome', '1.0.0'],
      generateHighQualityLinkPreview: true,
      syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    // Connection Events
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        connectionStatus = 'awaiting_scan';
        try {
          lastQrDataUrl = await qrcode.toDataURL(qr, {
            errorCorrectionLevel: 'M',
            margin: 2,
            scale: 8,
            color: {
              dark: '#0284c7',
              light: '#ffffff'
            }
          });
          io.emit('qr', lastQrDataUrl);
          io.emit('status', {
            status: connectionStatus,
            botJid,
            uptime: Math.floor(process.uptime())
          });
        } catch (qrErr) {
          console.error('[QR] Render error:', qrErr.message);
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        lastQrDataUrl = null;
        pairingCodeCache = null;
        botJid = sock.user ? sock.user.id : 'unknown';
        console.log('═══════════════════════════════════════════════');
        console.log('  ZAID ASHIQ STUDIO: WhatsApp Bot CONNECTED');
        console.log('  Account JID: ' + botJid);
        console.log('═══════════════════════════════════════════════');

        io.emit('status', {
          status: 'connected',
          botJid,
          uptime: Math.floor(process.uptime())
        });
        io.emit('connection_success', { botJid });

        // Subscribe to all Online Tracer targets
        onlineTracer.subscribeAll(sock).catch(err => {
          console.warn('[OnlineTracer] Auto-subscribe warning:', err.message);
        });

        // Trigger automatic GitHub backup if configured
        if (githubBackup.isConfigured()) {
          githubBackup.backupSession(SESSION_DIR, { event: 'auto_connect_backup', botJid }).catch(err => {
            console.warn('[GitHubBackup] Initial auto-backup note:', err.message);
          });
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[CONN] Socket closed (status code: ${statusCode}). Reconnecting: ${shouldReconnect}`);

        connectionStatus = 'disconnected';
        botJid = null;
        io.emit('status', {
          status: 'disconnected',
          botJid: null,
          uptime: Math.floor(process.uptime())
        });

        isStarting = false;
        if (shouldReconnect) {
          setTimeout(() => startWhatsApp(), 3000);
        }
      }
    });

    // ─── Online Tracer Presence Listener ─────────────────────────────────────
    sock.ev.on('presence.update', async (update) => {
      try {
        const { id, presences } = update;
        if (!presences) return;

        for (const [targetJid, presenceData] of Object.entries(presences)) {
          const effectiveJid = (targetJid && targetJid.includes('@')) ? targetJid : id;
          const result = onlineTracer.recordPresenceUpdate(effectiveJid, presenceData);
          if (result) {
            io.emit('online_tracer_event', result.logEntry);
            io.emit('online_tracer_target_updated', result.target);
            console.log(`[OnlineTracer] ${result.logEntry.summary}`);
          }
        }
      } catch (err) {
        console.warn('[OnlineTracer] Presence update handler error:', err.message);
      }
    });

    // ─── Message Upsert Listener (ViewOnce + Status + Bot Commands) ──────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (!messages || !Array.isArray(messages)) return;

      for (const m of messages) {
        if (!m.message) continue;

        const remoteJid = m.key.remoteJid || '';
        const participant = m.key.participant || remoteJid;
        const senderDigits = participant.replace(/[^0-9]/g, '');

        // 0. Check for Message Revocation (Anti-Delete Vault)
        if (m.message.protocolMessage && m.message.protocolMessage.type === 0) {
          const revokedId = m.message.protocolMessage.key?.id;
          if (revokedId) {
            await deletedMessagesManager.handleRevocation(revokedId, m, io, cloudinaryManager);
          }
          continue;
        }

        // Buffer direct private message for potential revocation recovery
        deletedMessagesManager.bufferIncomingMessage(m, sock);

        // 1. Process Bot Commands from commands/
        const rawText = m.message.conversation ||
                        m.message.extendedTextMessage?.text ||
                        m.message.imageMessage?.caption ||
                        m.message.videoMessage?.caption || '';

        if (rawText.startsWith('.') || rawText.startsWith('!') || rawText.startsWith('/')) {
          const parts = rawText.slice(1).trim().split(/\s+/);
          const commandName = parts[0].toLowerCase();
          const args = parts.slice(1);

          if (commands.has(commandName)) {
            try {
              const handler = commands.get(commandName);
              if (typeof handler === 'function') {
                console.log(`[BOT CMD] Executing .${commandName} from ${participant}`);
                await handler(sock, remoteJid, m, args);
              }
            } catch (cmdErr) {
              console.error(`[BOT CMD ERROR] .${commandName}:`, cmdErr.message);
            }
          }
        }

        // 2. Feature 1: ViewOnce Interceptor & 1-Click Downloader
        const msg = m.message;
        let viewOnceContent = null;
        let detectedType = null;
        let detectedMime = null;

        if (msg.viewOnceMessage && msg.viewOnceMessage.message) {
          viewOnceContent = msg.viewOnceMessage.message;
        } else if (msg.viewOnceMessageV2 && msg.viewOnceMessageV2.message) {
          viewOnceContent = msg.viewOnceMessageV2.message;
        } else if (msg.viewOnceMessageV2Extension && msg.viewOnceMessageV2Extension.message) {
          viewOnceContent = msg.viewOnceMessageV2Extension.message;
        } else if (msg.imageMessage && msg.imageMessage.viewOnce) {
          viewOnceContent = { imageMessage: msg.imageMessage };
        } else if (msg.videoMessage && msg.videoMessage.viewOnce) {
          viewOnceContent = { videoMessage: msg.videoMessage };
        } else if (msg.audioMessage && msg.audioMessage.viewOnce) {
          viewOnceContent = { audioMessage: msg.audioMessage };
        }

        if (viewOnceContent) {
          if (viewOnceContent.imageMessage) {
            detectedType = 'picture';
            detectedMime = viewOnceContent.imageMessage.mimetype || 'image/jpeg';
          } else if (viewOnceContent.audioMessage) {
            detectedType = 'voice';
            detectedMime = viewOnceContent.audioMessage.mimetype || 'audio/ogg; codecs=opus';
          } else if (viewOnceContent.videoMessage) {
            detectedType = 'video';
            detectedMime = viewOnceContent.videoMessage.mimetype || 'video/mp4';
          }

          if (detectedType) {
            const formattedTitle = `${senderDigits} 1view ${detectedType}`;
            console.log(`[VIEW-ONCE] Intercepted: ${formattedTitle}`);

            try {
              const buffer = await downloadMediaMessage(
                { key: m.key, message: viewOnceContent },
                'buffer',
                {},
                { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
              );

              const dataUrl = `data:${detectedMime};base64,${buffer.toString('base64')}`;
              const item = {
                id: m.key.id || String(Date.now()),
                sender: senderDigits,
                title: formattedTitle,
                mediaType: detectedType,
                mime: detectedMime,
                dataUrl,
                timestamp: new Date().toISOString()
              };

              viewOnceItems.unshift(item);
              if (viewOnceItems.length > 50) viewOnceItems.pop();

              io.emit('new_viewonce', item);
            } catch (dlErr) {
              console.error(`[VIEW-ONCE] Decryption failed for ${formattedTitle}:`, dlErr.message);
            }
          }
        }

        // 3. Feature 3: 1-Click WhatsApp Status Grabber
        if (remoteJid === 'status@broadcast') {
          try {
            let statusMediaType = null;
            let statusMime = null;
            let statusCaption = '';

            if (msg.imageMessage) {
              statusMediaType = 'picture';
              statusMime = msg.imageMessage.mimetype || 'image/jpeg';
              statusCaption = msg.imageMessage.caption || '';
            } else if (msg.videoMessage) {
              statusMediaType = 'video';
              statusMime = msg.videoMessage.mimetype || 'video/mp4';
              statusCaption = msg.videoMessage.caption || '';
            } else if (msg.audioMessage) {
              statusMediaType = 'voice';
              statusMime = msg.audioMessage.mimetype || 'audio/ogg';
            } else if (msg.conversation || msg.extendedTextMessage) {
              statusMediaType = 'text';
              statusCaption = msg.conversation || msg.extendedTextMessage?.text || '';
            }

            if (statusMediaType && statusMediaType !== 'text') {
              console.log(`[STATUS-GRABBER] Intercepted status from +${senderDigits} (${statusMediaType})`);
              const buffer = await downloadMediaMessage(
                m,
                'buffer',
                {},
                { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
              );

              const dataUrl = `data:${statusMime};base64,${buffer.toString('base64')}`;
              const statusItem = {
                id: m.key.id || String(Date.now()),
                sender: senderDigits || 'Contact',
                mediaType: statusMediaType,
                mime: statusMime,
                caption: statusCaption,
                dataUrl,
                timestamp: new Date().toISOString()
              };

              statusItems.unshift(statusItem);
              if (statusItems.length > 50) statusItems.pop();

              io.emit('new_status', statusItem);
            }
          } catch (statusErr) {
            console.error('[STATUS-GRABBER] Error grabbing status:', statusErr.message);
          }
        }
      }
    });

    // ─── Messages Update Listener (Additional Revocation Interceptor) ────────
    sock.ev.on('messages.update', async (updates) => {
      if (!updates || !Array.isArray(updates)) return;
      for (const u of updates) {
        const protoMsg = u.update?.message?.protocolMessage || u.update?.protocolMessage;
        if (protoMsg && protoMsg.type === 0) {
          const revokedId = protoMsg.key?.id;
          if (revokedId) {
            await deletedMessagesManager.handleRevocation(revokedId, u, io, cloudinaryManager);
          }
        }
      }
    });

  } catch (err) {
    console.error('[BOT] Start error:', err.message);
  } finally {
    isStarting = false;
  }
}

// ─── Socket.io Connection Handler ───────────────────────────────────────────
io.on('connection', (clientSocket) => {
  clientSocket.emit('status', {
    status: connectionStatus,
    botJid,
    uptime: Math.floor(process.uptime())
  });

  if (lastQrDataUrl && connectionStatus === 'awaiting_scan') {
    clientSocket.emit('qr', lastQrDataUrl);
  }

  if (pairingCodeCache) {
    clientSocket.emit('pairing_code', { code: pairingCodeCache });
  }

  clientSocket.emit('initial_state', {
    viewOnceItems,
    statusItems,
    botJid,
    status: connectionStatus
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────

// System Health & State (Render Zero-Downtime Health Check, Railway & Heroku compatible)
app.get('/api/health', (req, res) => {
  const platform = (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) 
    ? 'Render' 
    : (process.env.RAILWAY_ENVIRONMENT ? 'Railway' : (process.env.DYNO ? 'Heroku' : 'Node.js'));

  res.status(200).json({
    status: 'ok',
    name: 'ZAID ASHIQ STUDIO WhatsApp Bot & Control Panel',
    platform,
    connectionStatus,
    botJid,
    uptime: Math.floor(process.uptime()) + 's',
    viewOnceCount: viewOnceItems.length,
    statusCount: statusItems.length,
    commandsCount: commands.size
  });
});

app.get('/api/state', (req, res) => {
  res.json({
    status: connectionStatus,
    botJid,
    qr: lastQrDataUrl,
    pairingCode: pairingCodeCache,
    viewOnceItems,
    statusItems,
    commandsCount: commands.size,
    uptime: Math.floor(process.uptime())
  });
});

// ─── Environment Provider (Supports Vercel, Render, Railway & Heroku Parity) ──
app.get('/api/env', (req, res) => {
  const renderUrl = (process.env.RENDER_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || process.env.VITE_RENDER_BACKEND_URL || '').trim().replace(/\/+$/, '');
  const railwayUrl = (process.env.RAILWAY_BACKEND_URL || process.env.VITE_RAILWAY_BACKEND_URL || '').trim().replace(/\/+$/, '');
  const herokuUrl = (process.env.HEROKU_BACKEND_URL || process.env.VITE_HEROKU_BACKEND_URL || (process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : '') || '').trim().replace(/\/+$/, '');
  const genericUrl = (process.env.BACKEND_URL || process.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

  const provider = (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) 
    ? 'render' 
    : (process.env.RAILWAY_ENVIRONMENT ? 'railway' : (process.env.DYNO ? 'heroku' : 'custom'));

  res.json({
    success: true,
    backends: {
      render: renderUrl,
      railway: railwayUrl,
      heroku: herokuUrl,
      custom: genericUrl
    },
    backendUrl: renderUrl || railwayUrl || herokuUrl || genericUrl || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '',
    cloudinaryConfigured: cloudinaryManager.isConfigured(),
    githubBackupConfigured: githubBackup.isConfigured(),
    provider,
    source: 'express_backend_environment'
  });
});

// ─── Client Gmail Session Manager (Multi-User Per-Gmail Session ID Binding) ────────
const ACCOUNT_SESSIONS_FILE = path.join(__dirname, 'data', 'account_sessions.json');
let activeUserEmail = null;

function loadAccountSessions() {
  try {
    if (fs.existsSync(ACCOUNT_SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(ACCOUNT_SESSIONS_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('[ACCOUNT-SESSIONS] Read error:', err.message);
  }
  return {};
}

function saveAccountSessions(data) {
  try {
    const dir = path.dirname(ACCOUNT_SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ACCOUNT_SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[ACCOUNT-SESSIONS] Save error:', err.message);
  }
}

// Get all registered client accounts and currently running session
app.get('/api/account-sessions', (req, res) => {
  const store = loadAccountSessions();
  const accounts = Object.values(store).map(acc => ({
    email: acc.email,
    name: acc.name || acc.email,
    boundAt: acc.boundAt,
    isActive: acc.email === activeUserEmail || (!activeUserEmail && connectionStatus === 'connected'),
    hasSession: !!acc.sessionId
  }));
  res.json({
    success: true,
    activeUserEmail,
    accounts,
    githubBackupConfigured: githubBackup.isConfigured()
  });
});

// Check single account status
app.get('/api/account-session-status', (req, res) => {
  const accountKey = req.query.sub || req.query.email;
  if (!accountKey) {
    return res.status(400).json({ success: false, error: 'Client email is required' });
  }
  const store = loadAccountSessions();
  const binding = store[accountKey.toLowerCase()] || null;
  res.json({
    success: true,
    isBound: !!binding,
    binding: binding ? {
      email: binding.email,
      name: binding.name,
      boundAt: binding.boundAt
    } : null
  });
});

// Register, bind and run a client's WhatsApp Session ID via Gmail with GitHub logging
app.post('/api/session', async (req, res) => {
  try {
    const { sessionId, email, name, googleUser } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID string is required (e.g. ZAID~... or Base64 creds)' });
    }

    const clientEmail = (email || googleUser?.email || 'client@zaidashiq.studio').trim().toLowerCase();
    const clientName = (name || googleUser?.name || clientEmail.split('@')[0]).trim();

    console.log(`[SESSION] Applying & running custom Session ID for client: ${clientEmail}...`);

    if (sock) {
      try { sock.end(); } catch (_) {}
    }

    const restored = restoreSession(sessionId, SESSION_DIR);
    if (!restored) {
      return res.status(400).json({
        success: false,
        error: 'Unable to decode Session ID. Please check format (e.g. ZAID~... or Base64 creds).'
      });
    }

    // Save in client accounts store
    const store = loadAccountSessions();
    store[clientEmail] = {
      email: clientEmail,
      name: clientName,
      sessionId,
      boundAt: store[clientEmail]?.boundAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveAccountSessions(store);
    activeUserEmail = clientEmail;

    // Automated logging to GitHub Secret Gist if configured
    let githubResult = null;
    if (githubBackup.isConfigured()) {
      try {
        githubResult = await githubBackup.backupSession(SESSION_DIR, {
          userEmail: clientEmail,
          userName: clientName,
          triggeredBy: 'client_frontend_session_submission'
        });
        console.log(`[GitHubBackup] Successfully logged session to GitHub: ${githubResult.htmlUrl || githubResult.gistId}`);
      } catch (ghErr) {
        console.warn('[GitHubBackup] Session logging warning:', ghErr.message);
      }
    }

    connectionStatus = 'awaiting_scan';
    lastQrDataUrl = null;
    pairingCodeCache = null;

    io.emit('status', { status: 'awaiting_scan', botJid: null });
    io.emit('session_applied', { email: clientEmail, name: clientName });

    setTimeout(() => {
      startWhatsApp();
    }, 1200);

    res.json({
      success: true,
      message: `Session ID applied for ${clientEmail}! WhatsApp socket is running.`,
      email: clientEmail,
      name: clientName,
      githubLog: githubResult ? {
        gistId: githubResult.gistId,
        url: githubResult.htmlUrl,
        action: githubResult.action
      } : null
    });
  } catch (err) {
    console.error('[SESSION] Error applying session ID:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Switch active running session to a previously saved client's session
app.post('/api/account-sessions/switch', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Client email is required' });

    const cleanEmail = email.trim().toLowerCase();
    const store = loadAccountSessions();
    const client = store[cleanEmail];

    if (!client || !client.sessionId) {
      return res.status(404).json({ success: false, error: `No stored session found for ${cleanEmail}` });
    }

    console.log(`[SESSION] Switching active WhatsApp socket to client: ${cleanEmail}...`);
    if (sock) {
      try { sock.end(); } catch (_) {}
    }

    const restored = restoreSession(client.sessionId, SESSION_DIR);
    if (!restored) {
      return res.status(400).json({ success: false, error: 'Failed to restore session credentials.' });
    }

    activeUserEmail = cleanEmail;
    connectionStatus = 'awaiting_scan';
    io.emit('status', { status: 'awaiting_scan', botJid: null });
    io.emit('session_applied', { email: cleanEmail, name: client.name });

    setTimeout(() => {
      startWhatsApp();
    }, 1200);

    res.json({
      success: true,
      message: `Active WhatsApp socket switched to ${cleanEmail}`,
      activeUserEmail: cleanEmail
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Current Session ID (for user to copy to Railway environment variables)
app.get('/api/session', (req, res) => {
  try {
    const credsFile = path.join(SESSION_DIR, 'creds.json');
    if (!fs.existsSync(credsFile)) {
      return res.status(404).json({ success: false, error: 'No active session credentials found' });
    }
    const credsRaw = fs.readFileSync(credsFile, 'utf8');
    const base64 = Buffer.from(credsRaw, 'utf8').toString('base64');
    const exportSessionId = 'ZAID~' + base64;
    res.json({
      success: true,
      sessionId: exportSessionId
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Dual WhatsApp Linking: Pairing Code Endpoint ───────────────────────────
app.post('/api/pair', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number is required' });
    }

    if (!sock) {
      return res.status(503).json({ success: false, error: 'WhatsApp service is initializing. Please retry in a moment.' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 8) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format. Include country code (e.g. 9232999931199).' });
    }

    console.log(`[PAIRING] Requesting pairing code for +${cleanPhone}...`);
    const code = await sock.requestPairingCode(cleanPhone);
    pairingCodeCache = code;

    io.emit('pairing_code', { code, phone: cleanPhone });

    res.json({
      success: true,
      phone: cleanPhone,
      pairingCode: code,
      message: 'Pairing code generated successfully'
    });
  } catch (err) {
    console.error('[PAIRING] Failed to get pairing code:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Reset Session / Logout Endpoint ────────────────────────────────────────
app.post('/api/logout', async (req, res) => {
  try {
    console.log('[SESSION] Clearing session and resetting WhatsApp connection...');

    if (sock) {
      try { await sock.logout(); } catch (_) {}
      try { sock.end(); } catch (_) {}
    }

    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }

    connectionStatus = 'disconnected';
    botJid = null;
    lastQrDataUrl = null;
    pairingCodeCache = null;

    io.emit('status', { status: 'disconnected', botJid: null });
    io.emit('session_cleared');

    setTimeout(() => {
      startWhatsApp();
    }, 1500);

    res.json({ success: true, message: 'Session cleared and socket restarting.' });
  } catch (err) {
    console.error('[SESSION] Reset error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Feature 2: Customized Interactive Button Message Sender ─────────────────
async function handleSendButtons(req, res) {
  try {
    const { to, headerTitle, body, footer, buttons, limit } = req.body;

    if (!sock || connectionStatus !== 'connected') {
      return res.status(400).json({ success: false, error: 'WhatsApp is not connected. Link via QR, Pairing code, or Session ID first.' });
    }

    if (!to || !body) {
      return res.status(400).json({ success: false, error: 'Recipient phone number and message body are required.' });
    }

    const cleanTo = to.replace(/[^0-9]/g, '');
    const targetJid = `${cleanTo}@s.whatsapp.net`;

    const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 5);
    const buttonList = Array.isArray(buttons) && buttons.length > 0 ? buttons : ['Confirm', 'Cancel'];
    const formattedButtons = buttonList.slice(0, maxLimit).map((btn, idx) => {
      const displayText = typeof btn === 'object' && btn.text ? String(btn.text).trim() : String(btn).trim();
      const buttonId = typeof btn === 'object' && btn.id ? String(btn.id).trim() : `btn_${idx + 1}_${Date.now()}`;
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: displayText,
          id: buttonId
        })
      };
    });

    const interactiveMessage = proto.Message.InteractiveMessage.create({
      header: proto.Message.InteractiveMessage.Header.create({
        title: headerTitle || 'ZAID ASHIQ STUDIO',
        hasMediaAttachment: false
      }),
      body: proto.Message.InteractiveMessage.Body.create({
        text: body
      }),
      footer: proto.Message.InteractiveMessage.Footer.create({
        text: footer || 'ZAID ASHIQ STUDIO'
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: formattedButtons
      })
    });

    const waMsg = generateWAMessageFromContent(
      targetJid,
      proto.Message.create({
        viewOnceMessage: {
          message: proto.Message.create({
            interactiveMessage
          })
        }
      }),
      { userJid: sock.user.id }
    );

    await sock.relayMessage(targetJid, waMsg.message, { messageId: waMsg.key.id });

    console.log(`[BUTTONS] Sent ${formattedButtons.length} interactive buttons to +${cleanTo}`);
    res.json({
      success: true,
      message: `Interactive message transmitted to +${cleanTo}`,
      buttonCount: formattedButtons.length,
      buttons: formattedButtons.map(b => JSON.parse(b.buttonParamsJson).display_text),
      messageId: waMsg.key.id
    });
  } catch (err) {
    console.error('[BUTTONS] Transmission error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
app.post('/api/send-buttons', handleSendButtons);
app.post('/api/send/button', handleSendButtons);

// ─── Feature 4: Full-Resolution Uncropped Profile Picture (DP) Updater ────────
app.post('/api/update-dp', async (req, res) => {
  try {
    const { imageBase64, bgColor } = req.body;

    if (!sock || connectionStatus !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp is not connected' });
    }
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const inputBuffer = Buffer.from(rawBase64, 'base64');

    const hdBuffer = await buildUncroppedHDProfilePic(inputBuffer, bgColor || '#0f172a');
    const botJidRaw = sock.user.id.split(':')[0] + '@s.whatsapp.net';

    await sock.query({
      tag: 'iq',
      attrs: {
        to: 's.whatsapp.net',
        type: 'set',
        xmlns: 'w:profile:picture'
      },
      content: [
        {
          tag: 'picture',
          attrs: { type: 'image' },
          content: hdBuffer
        }
      ]
    });

    console.log(`[DP-UPDATER] Successfully updated full-resolution intact DP for ${botJidRaw}`);

    res.json({
      success: true,
      jid: botJidRaw,
      message: 'Full-resolution uncropped profile picture updated!'
    });
  } catch (err) {
    console.error('[DP-UPDATER] Update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Feature 5: Send Voice Note (PTT) ─────────────────────────────────────────
async function handleSendVoiceNote(req, res) {
  try {
    const { to, audioBase64, mime } = req.body;

    if (!sock || connectionStatus !== 'connected') {
      return res.status(400).json({ success: false, error: 'WhatsApp is not connected. Link device first.' });
    }
    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }
    if (!audioBase64) {
      return res.status(400).json({ success: false, error: 'Audio data is required.' });
    }

    const cleanTo = to.replace(/[^0-9]/g, '');
    const targetJid = `${cleanTo}@s.whatsapp.net`;
    const rawBase64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
    const audioBuffer = Buffer.from(rawBase64, 'base64');

    let targetMime = mime || 'audio/ogg; codecs=opus';
    if (!targetMime.includes('opus') && targetMime.includes('ogg')) {
      targetMime = 'audio/ogg; codecs=opus';
    }

    // Optional Cloudinary Media Hosting
    let cloudinaryUrl = null;
    if ((req.body.useCloudinary || cloudinaryManager.isConfigured()) && cloudinaryManager.isConfigured()) {
      try {
        const cRes = await cloudinaryManager.upload(audioBuffer, {
          resourceType: 'video',
          folder: 'zaid-bot-voice-notes',
          filename: `voice_${cleanTo}_${Date.now()}.ogg`
        });
        cloudinaryUrl = cRes.secure_url;
      } catch (cErr) {
        console.warn('[Cloudinary] Voice note upload warning:', cErr.message);
      }
    }

    const sentMsg = await sock.sendMessage(targetJid, {
      audio: audioBuffer,
      mimetype: targetMime,
      ptt: true
    });

    console.log(`[VOICE-NOTE] Successfully dispatched voice note (PTT) to +${cleanTo}`);
    res.json({
      success: true,
      message: `Voice note delivered to +${cleanTo}`,
      messageId: sentMsg?.key?.id,
      cloudinaryUrl
    });
  } catch (err) {
    console.error('[VOICE-NOTE] Transmission error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
app.post('/api/send-voice-note', handleSendVoiceNote);
app.post('/api/send/ptt', handleSendVoiceNote);

// ─── Feature 6: Send Video Note (PTV) ─────────────────────────────────────────
async function handleSendVideoNote(req, res) {
  try {
    const { to, videoBase64, mime } = req.body;

    if (!sock || connectionStatus !== 'connected') {
      return res.status(400).json({ success: false, error: 'WhatsApp is not connected. Link device first.' });
    }
    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient phone number is required.' });
    }
    if (!videoBase64) {
      return res.status(400).json({ success: false, error: 'Video data is required.' });
    }

    const cleanTo = to.replace(/[^0-9]/g, '');
    const targetJid = `${cleanTo}@s.whatsapp.net`;
    const rawBase64 = videoBase64.replace(/^data:[^;]+;base64,/, '');
    const videoBuffer = Buffer.from(rawBase64, 'base64');

    const targetMime = mime || 'video/mp4';

    // Optional Cloudinary Media Hosting
    let cloudinaryUrl = null;
    if ((req.body.useCloudinary || cloudinaryManager.isConfigured()) && cloudinaryManager.isConfigured()) {
      try {
        const cRes = await cloudinaryManager.upload(videoBuffer, {
          resourceType: 'video',
          folder: 'zaid-bot-video-notes',
          filename: `video_note_${cleanTo}_${Date.now()}.mp4`
        });
        cloudinaryUrl = cRes.secure_url;
      } catch (cErr) {
        console.warn('[Cloudinary] Video note upload warning:', cErr.message);
      }
    }

    const sentMsg = await sock.sendMessage(targetJid, {
      video: videoBuffer,
      mimetype: targetMime,
      ptv: true
    });

    console.log(`[VIDEO-NOTE] Successfully dispatched circular video note (PTV) to +${cleanTo}`);
    res.json({
      success: true,
      message: `Video note (PTV) delivered to +${cleanTo}`,
      messageId: sentMsg?.key?.id,
      cloudinaryUrl
    });
  } catch (err) {
    console.error('[VIDEO-NOTE] Transmission error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}
app.post('/api/send-video-note', handleSendVideoNote);
app.post('/api/send/ptv', handleSendVideoNote);

// ─── Status Stories List & Saver ──────────────────────────────────────────────
app.get('/api/status/list', (req, res) => {
  res.json({
    success: true,
    statuses: statusItems,
    count: statusItems.length
  });
});
app.get('/api/status-saver', (req, res) => {
  res.json({
    success: true,
    statuses: statusItems,
    count: statusItems.length
  });
});

// ─── Feature 7: Online Tracer API ────────────────────────────────────────────
app.get('/api/online-tracer', (req, res) => {
  try {
    const targets = onlineTracer.getTargets();
    const logs = onlineTracer.getLogs(req.query.number || null, parseInt(req.query.limit, 10) || 150);
    res.json({
      success: true,
      targets,
      logs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/online-tracer/track', async (req, res) => {
  try {
    const { number, name } = req.body;
    if (!number) {
      return res.status(400).json({ success: false, error: 'Target phone number is required.' });
    }

    const target = onlineTracer.addTarget(number, name);

    // If WhatsApp socket is connected, immediately subscribe to presence
    if (sock && connectionStatus === 'connected') {
      try {
        await sock.presenceSubscribe(target.jid);
        console.log(`[OnlineTracer] Subscribed to presence for ${target.jid}`);
      } catch (subErr) {
        console.warn(`[OnlineTracer] Presence subscribe warning for ${target.jid}:`, subErr.message);
      }
    }

    io.emit('online_tracer_target_added', target);
    res.json({
      success: true,
      message: `Started tracking presence for +${target.number}`,
      target
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/online-tracer/target/:idOrNumber', (req, res) => {
  try {
    const { idOrNumber } = req.params;
    const removed = onlineTracer.removeTarget(idOrNumber);
    if (removed) {
      io.emit('online_tracer_target_removed', { idOrNumber });
    }
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/online-tracer/clear-logs', (req, res) => {
  try {
    const { number } = req.body;
    onlineTracer.clearLogs(number || null);
    io.emit('online_tracer_logs_cleared', { number: number || null });
    res.json({ success: true, message: 'Presence logs cleared successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Cloud & Production Status ────────────────────────────────────────────────
app.get('/api/cloud-status', (req, res) => {
  const backendUrl = process.env.RENDER_BACKEND_URL || 
                     process.env.RENDER_EXTERNAL_URL || 
                     process.env.RAILWAY_BACKEND_URL || 
                     process.env.BACKEND_URL || '';
  const provider = (process.env.RENDER || process.env.RENDER_EXTERNAL_URL) ? 'Render' : 
                   (process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'Node.js Cloud Service');

  res.json({
    success: true,
    backend: {
      provider,
      backendUrl,
      connected: connectionStatus === 'connected',
      botJid: botJid || null,
      uptime: Math.floor(process.uptime())
    },
    render: {
      backendUrl,
      connected: connectionStatus === 'connected',
      botJid: botJid || null,
      uptime: Math.floor(process.uptime())
    },
    railway: {
      backendUrl,
      connected: connectionStatus === 'connected',
      botJid: botJid || null,
      uptime: Math.floor(process.uptime())
    },
    google: {
      clientIdConfigured: !!process.env.GOOGLE_CLIENT_ID
    },
    cloudinary: cloudinaryManager.getStatus(),
    github: githubBackup.getStatus()
  });
});

// ─── Trigger GitHub Session Backup ───────────────────────────────────────────
app.post('/api/backup/github', async (req, res) => {
  try {
    if (!githubBackup.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'GITHUB_TOKEN environment variable is not configured on Railway / server.'
      });
    }
    const result = await githubBackup.backupSession(SESSION_DIR, {
      triggeredBy: req.body.triggeredBy || 'web_panel_operator',
      botJid: botJid || null
    });
    res.json(result);
  } catch (err) {
    console.error('[GitHubBackup] Backup trigger error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Feature 8: Anti-Delete / Deleted Messages Endpoints ──────────────────────
app.get('/api/deleted-messages', (req, res) => {
  try {
    const filterNumber = req.query.number || null;
    const filterType = req.query.type || null;
    const logs = deletedMessagesManager.getLogs(filterNumber, filterType);

    const allLogs = deletedMessagesManager.getLogs();
    const counts = {
      total: allLogs.length,
      photos: allLogs.filter(l => l.type === 'photo').length,
      videos: allLogs.filter(l => l.type === 'video').length,
      voices: allLogs.filter(l => l.type === 'voice').length,
      texts: allLogs.filter(l => l.type === 'text').length
    };

    res.json({
      success: true,
      logs,
      counts
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/deleted-media/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = deletedMessagesManager.getMediaFilePath(filename);
    if (!filePath) {
      return res.status(404).send('Media file not found or expired');
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.ogg': 'audio/ogg; codecs=opus',
      '.opus': 'audio/ogg; codecs=opus',
      '.mp3': 'audio/mpeg'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).send('Error streaming media file');
  }
});

app.post('/api/deleted-messages/clear', (req, res) => {
  try {
    deletedMessagesManager.clearLogs();
    io.emit('deleted_messages_cleared');
    res.json({ success: true, message: 'Deleted messages vault cleared successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Catch-all SPA Fallback ──────────────────────────────────────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  for (const dir of potentialFrontendDirs) {
    const indexPath = path.join(dir, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  next();
});

// ─── Server Startup ──────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════════════════');
  console.log('  ZAID ASHIQ STUDIO - Bot & Web Control Panel');
  console.log(`  Server listening on http://0.0.0.0:${PORT}`);
  console.log('═══════════════════════════════════════════════');
  startWhatsApp();
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});
