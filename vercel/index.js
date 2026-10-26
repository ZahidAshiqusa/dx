/**
 * ZAID ASHIQ STUDIO - Vercel Entrypoint Handler
 * Serves the Dark Obsidian Frontend, PWA assets, and /api/env runtime configuration
 */
const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  const url = req.url || '/';
  const cleanPath = url.split('?')[0];

  // Route: /api/env
  if (cleanPath === '/api/env' || cleanPath === '/api/env.js') {
    try {
      const envHandler = require('./api/env.js');
      return envHandler(req, res);
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Route: Serve files in vercel directory if they exist (manifest.json, etc.)
  const targetFile = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
  const filePath = path.join(__dirname, targetFile);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    return fs.createReadStream(filePath).pipe(res);
  }

  // Fallback to index.html for Single Page Application routing
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return fs.createReadStream(indexPath).pipe(res);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<h1>ZAID ASHIQ STUDIO - Web Control Panel Active</h1>');
};
