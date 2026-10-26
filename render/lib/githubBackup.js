const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const BACKUP_META_FILE = path.join(__dirname, '..', 'data', 'github_backup.json');

class GitHubBackupManager {
  constructor() {
    this.token = process.env.GITHUB_TOKEN || null;
    this.gistId = process.env.GITHUB_GIST_ID || null;
    this.loadLocalMeta();
  }

  loadLocalMeta() {
    try {
      if (fs.existsSync(BACKUP_META_FILE)) {
        const meta = JSON.parse(fs.readFileSync(BACKUP_META_FILE, 'utf8'));
        if (meta.gistId && !this.gistId) {
          this.gistId = meta.gistId;
        }
        this.lastBackup = meta.lastBackup || null;
        this.htmlUrl = meta.htmlUrl || null;
      }
    } catch (_) {}
  }

  saveLocalMeta(data) {
    try {
      fs.ensureDirSync(path.dirname(BACKUP_META_FILE));
      fs.writeFileSync(BACKUP_META_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.warn('[GitHubBackup] Failed to save local meta:', e.message);
    }
  }

  isConfigured() {
    return !!(process.env.GITHUB_TOKEN || this.token);
  }

  getStatus() {
    this.token = process.env.GITHUB_TOKEN || this.token;
    this.gistId = process.env.GITHUB_GIST_ID || this.gistId;
    this.loadLocalMeta();

    return {
      configured: this.isConfigured(),
      gistId: this.gistId || null,
      htmlUrl: this.htmlUrl || null,
      lastBackup: this.lastBackup || null,
      provider: 'GitHub Secret Gist'
    };
  }

  async backupSession(sessionDir, extraData = {}) {
    this.token = process.env.GITHUB_TOKEN || this.token;
    if (!this.token) {
      throw new Error('GITHUB_TOKEN environment variable is not configured.');
    }

    const credsFile = path.join(sessionDir, 'creds.json');
    let credsContent = '';
    if (fs.existsSync(credsFile)) {
      credsContent = fs.readFileSync(credsFile, 'utf8');
    }

    const accountSessionsFile = path.join(__dirname, '..', 'data', 'account_sessions.json');
    let accountSessionsContent = '';
    if (fs.existsSync(accountSessionsFile)) {
      accountSessionsContent = fs.readFileSync(accountSessionsFile, 'utf8');
    }

    const onlineTracerFile = path.join(__dirname, '..', 'data', 'online_tracer.json');
    let onlineTracerContent = '';
    if (fs.existsSync(onlineTracerFile)) {
      onlineTracerContent = fs.readFileSync(onlineTracerFile, 'utf8');
    }

    const deletedMessagesFile = path.join(__dirname, '..', 'data', 'deleted_messages.json');
    let deletedMessagesContent = '';
    if (fs.existsSync(deletedMessagesFile)) {
      deletedMessagesContent = fs.readFileSync(deletedMessagesFile, 'utf8');
    }

    const files = {
      'backup_metadata.json': {
        content: JSON.stringify({
          app: 'ZAID ASHIQ STUDIO',
          version: '3.0.0',
          backupTimestamp: Date.now(),
          backupDate: new Date().toISOString(),
          ...extraData
        }, null, 2)
      }
    };

    if (credsContent) {
      files['creds.json'] = { content: credsContent };
    }
    if (accountSessionsContent) {
      files['account_sessions.json'] = { content: accountSessionsContent };
    }
    if (onlineTracerContent) {
      files['online_tracer.json'] = { content: onlineTracerContent };
    }
    if (deletedMessagesContent) {
      files['deleted_messages.json'] = { content: deletedMessagesContent };
    }

    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ZAID-ASHIQ-STUDIO-Backup-Agent'
    };

    const targetGistId = this.gistId || process.env.GITHUB_GIST_ID;

    if (targetGistId) {
      // Update existing Gist
      try {
        const response = await axios.patch(`https://api.github.com/gists/${targetGistId}`, {
          description: `ZAID ASHIQ STUDIO - Session Backup (${new Date().toISOString()})`,
          files
        }, { headers, timeout: 20000 });

        const now = Date.now();
        this.lastBackup = now;
        this.htmlUrl = response.data.html_url;
        this.saveLocalMeta({
          gistId: targetGistId,
          lastBackup: now,
          htmlUrl: response.data.html_url
        });

        return {
          success: true,
          action: 'updated',
          gistId: targetGistId,
          htmlUrl: response.data.html_url,
          lastBackup: now
        };
      } catch (patchErr) {
        // If 404, fallback to creating new gist
        if (patchErr.response?.status !== 404) {
          throw new Error(`GitHub Gist update error: ${patchErr.response?.data?.message || patchErr.message}`);
        }
      }
    }

    // Create new secret Gist
    const createRes = await axios.post('https://api.github.com/gists', {
      description: `ZAID ASHIQ STUDIO - Session Backup (${new Date().toISOString()})`,
      public: false,
      files
    }, { headers, timeout: 20000 });

    const newGistId = createRes.data.id;
    const now = Date.now();
    this.gistId = newGistId;
    this.lastBackup = now;
    this.htmlUrl = createRes.data.html_url;

    this.saveLocalMeta({
      gistId: newGistId,
      lastBackup: now,
      htmlUrl: createRes.data.html_url
    });

    return {
      success: true,
      action: 'created',
      gistId: newGistId,
      htmlUrl: createRes.data.html_url,
      lastBackup: now
    };
  }

  async autoRestoreSession(sessionDir) {
    this.token = process.env.GITHUB_TOKEN || this.token;
    this.gistId = process.env.GITHUB_GIST_ID || this.gistId;
    this.loadLocalMeta();

    if (!this.token || !this.gistId) return false;

    const credsFile = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsFile)) {
      // Credentials already present on disk
      return false;
    }

    try {
      console.log(`[GitHubBackup] Attempting to auto-restore session from Gist ${this.gistId}...`);
      const response = await axios.get(`https://api.github.com/gists/${this.gistId}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ZAID-ASHIQ-STUDIO-Backup-Agent'
        },
        timeout: 15000
      });

      const files = response.data.files || {};
      if (files['creds.json']?.content) {
        fs.ensureDirSync(sessionDir);
        fs.writeFileSync(credsFile, files['creds.json'].content);
        console.log('[GitHubBackup] Successfully restored creds.json from GitHub Gist!');
      }

      if (files['account_sessions.json']?.content) {
        const accPath = path.join(__dirname, '..', 'data', 'account_sessions.json');
        if (!fs.existsSync(accPath)) {
          fs.ensureDirSync(path.dirname(accPath));
          fs.writeFileSync(accPath, files['account_sessions.json'].content);
        }
      }

      if (files['online_tracer.json']?.content) {
        const tracerPath = path.join(__dirname, '..', 'data', 'online_tracer.json');
        if (!fs.existsSync(tracerPath)) {
          fs.ensureDirSync(path.dirname(tracerPath));
          fs.writeFileSync(tracerPath, files['online_tracer.json'].content);
        }
      }

      return true;
    } catch (err) {
      console.warn('[GitHubBackup] Session restore skipped or failed:', err.message);
      return false;
    }
  }
}

module.exports = new GitHubBackupManager();
