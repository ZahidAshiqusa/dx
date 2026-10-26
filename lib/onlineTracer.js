const fs = require('fs-extra');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'online_tracer.json');
const MAX_LOGS_TOTAL = 400;
const MAX_LOGS_PER_TARGET = 80;

function ensureStore() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      targets: [],
      logs: []
    };
    try {
      fs.ensureDirSync(path.dirname(DATA_FILE));
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
      return initial;
    } catch (_) {
      return initial;
    }
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.targets)) parsed.targets = [];
    if (!Array.isArray(parsed.logs)) parsed.logs = [];
    return parsed;
  } catch (_) {
    return { targets: [], logs: [] };
  }
}

function saveStore(data) {
  try {
    fs.ensureDirSync(path.dirname(DATA_FILE));
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[OnlineTracer] Error saving data store:', err.message);
  }
}

function normalizeNumber(num) {
  if (!num) return '';
  return String(num).replace(/[^0-9]/g, '');
}

function formatTime(dateObj = new Date()) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const hoursStr = String(hours).padStart(2, '0');
  return `${hoursStr}:${minutes} ${ampm}`;
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

class OnlineTracerManager {
  constructor() {
    this.memoryState = new Map(); // jid -> { lastStatus, onlineSince, lastSeen }
  }

  getTargets() {
    const store = ensureStore();
    return store.targets.map(t => {
      const live = this.memoryState.get(t.jid) || {};
      return {
        ...t,
        currentStatus: live.lastStatus || t.lastStatus || 'unavailable',
        lastSeenFormatted: t.lastSeen ? formatTime(t.lastSeen) : 'Never',
        onlineSince: live.onlineSince || null
      };
    });
  }

  addTarget(rawNumber, customName = '') {
    const digits = normalizeNumber(rawNumber);
    if (!digits || digits.length < 8) {
      throw new Error('Please provide a valid phone number with country code (e.g. 9232999931199).');
    }

    const jid = `${digits}@s.whatsapp.net`;
    const store = ensureStore();

    const existingIndex = store.targets.findIndex(t => t.jid === jid || t.number === digits);
    const now = Date.now();

    if (existingIndex >= 0) {
      store.targets[existingIndex].name = customName || store.targets[existingIndex].name || `Target ${digits}`;
      store.targets[existingIndex].updatedAt = now;
      saveStore(store);
      return store.targets[existingIndex];
    }

    const newTarget = {
      id: `target_${digits}_${now}`,
      number: digits,
      jid,
      name: customName || `+${digits}`,
      addedAt: now,
      lastStatus: 'unavailable',
      lastSeen: null,
      lastDuration: null
    };

    store.targets.push(newTarget);
    saveStore(store);
    return newTarget;
  }

  removeTarget(targetIdOrNumber) {
    const digits = normalizeNumber(targetIdOrNumber);
    const store = ensureStore();

    const beforeLen = store.targets.length;
    store.targets = store.targets.filter(t => t.id !== targetIdOrNumber && t.jid !== targetIdOrNumber && t.number !== digits);
    const removed = store.targets.length < beforeLen;

    if (removed) {
      saveStore(store);
      const jid = digits ? `${digits}@s.whatsapp.net` : targetIdOrNumber;
      this.memoryState.delete(jid);
    }
    return removed;
  }

  recordPresenceUpdate(jid, presenceUpdate) {
    if (!jid) return null;
    const cleanJid = jid.split(':')[0] + (jid.includes('@') ? '' : '@s.whatsapp.net');
    const digits = normalizeNumber(cleanJid);

    const store = ensureStore();
    const target = store.targets.find(t => t.jid === cleanJid || t.number === digits);
    if (!target) {
      // Contact is not in active watch list
      return null;
    }

    // Baileys presence: { lastKnownPresence: 'available'|'unavailable'|'composing'|'recording'|'paused', lastSeen: number }
    const rawPresence = presenceUpdate.lastKnownPresence || presenceUpdate.presence || 'unavailable';
    const now = Date.now();

    // Map Baileys presence to canonical label
    let statusLabel = 'offline';
    if (rawPresence === 'available') {
      statusLabel = 'online';
    } else if (rawPresence === 'composing') {
      statusLabel = 'typing';
    } else if (rawPresence === 'recording') {
      statusLabel = 'recording';
    } else if (rawPresence === 'unavailable' || rawPresence === 'paused') {
      statusLabel = 'offline';
    }

    const live = this.memoryState.get(target.jid) || {
      lastStatus: target.lastStatus || 'unavailable',
      onlineSince: null,
      lastSeen: target.lastSeen || null
    };

    const prevStatus = live.lastStatus;
    // Avoid spamming duplicate status changes if state hasn't changed
    if (prevStatus === rawPresence && statusLabel !== 'online') {
      return null;
    }

    let durationMs = null;
    let durationFormatted = null;

    if (rawPresence === 'available' || rawPresence === 'composing' || rawPresence === 'recording') {
      if (!live.onlineSince) {
        live.onlineSince = now;
      }
      live.lastSeen = now;
    } else if (rawPresence === 'unavailable') {
      if (live.onlineSince) {
        durationMs = now - live.onlineSince;
        durationFormatted = formatDuration(durationMs);
        live.onlineSince = null;
      }
      live.lastSeen = now;
    }

    live.lastStatus = rawPresence;
    this.memoryState.set(target.jid, live);

    // Update target state in database
    target.lastStatus = rawPresence;
    target.lastSeen = now;
    if (durationFormatted) {
      target.lastDuration = durationFormatted;
    }

    // Create log record
    const timeFormatted = formatTime(now);
    const logEntry = {
      id: `log_${digits}_${now}_${Math.random().toString(36).substring(2, 7)}`,
      number: digits,
      jid: target.jid,
      name: target.name,
      rawPresence,
      statusLabel, // 'online' | 'offline' | 'typing' | 'recording'
      timestamp: now,
      timeFormatted,
      durationMs,
      durationFormatted,
      summary: durationFormatted 
        ? `${digits} ${statusLabel} at ${timeFormatted} (Active: ${durationFormatted})`
        : `${digits} ${statusLabel} at ${timeFormatted}`
    };

    store.logs.unshift(logEntry);

    // Auto-rotate logs
    if (store.logs.length > MAX_LOGS_TOTAL) {
      store.logs = store.logs.slice(0, MAX_LOGS_TOTAL);
    }

    saveStore(store);
    return { target, logEntry };
  }

  getLogs(filterNumber = null, limit = 150) {
    const store = ensureStore();
    let logs = store.logs;
    if (filterNumber) {
      const digits = normalizeNumber(filterNumber);
      logs = logs.filter(l => l.number === digits);
    }
    return logs.slice(0, limit);
  }

  clearLogs(filterNumber = null) {
    const store = ensureStore();
    if (filterNumber) {
      const digits = normalizeNumber(filterNumber);
      store.logs = store.logs.filter(l => l.number !== digits);
    } else {
      store.logs = [];
    }
    saveStore(store);
    return true;
  }

  async subscribeAll(sock) {
    if (!sock || !sock.presenceSubscribe) return;
    const store = ensureStore();
    console.log(`[OnlineTracer] Subscribing to presence for ${store.targets.length} target(s)...`);
    for (const t of store.targets) {
      try {
        await sock.presenceSubscribe(t.jid);
      } catch (err) {
        console.warn(`[OnlineTracer] Failed to subscribe to ${t.jid}:`, err.message);
      }
    }
  }
}

module.exports = new OnlineTracerManager();
