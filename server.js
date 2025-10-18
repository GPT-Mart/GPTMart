// server.js
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const querystring = require('querystring');

async function startServer() {
  const { v4: uuidv4 } = await import('uuid');

  // ---------- CONFIG ----------
  const PORT = process.env.PORT || 3000;
  const ADMIN_PIN = (process.env.ADMIN_PIN || '4545').trim();
  const DATA_DIR = process.env.DATA_DIR || __dirname;
  const DB_PATH = path.join(DATA_DIR, 'db.json');      // GPT catalog
  const LEADS_PATH = path.join(DATA_DIR, 'leads.json'); // email + message

  // ---------- JSON helpers ----------
  async function readJSON(file, fallback) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch { await fs.writeFile(file, JSON.stringify(fallback, null, 2)); return fallback; }
  }
  async function writeJSON(file, data) {
    const tmp = file + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
  }

  // Ensure files exist
  await readJSON(DB_PATH, { settings: { title: 'GPTMart' }, items: [] });
  await readJSON(LEADS_PATH, []);

  // ---------- Auth (in-memory session) ----------
  const sessions = {}; // token -> { user, expires }
  function createToken(user) {
    const token = crypto.randomUUID();
    sessions[token] = { user, expires: Date.now() + 3600_000 };
    return token;
  }
  function verifyTokenValue(token) {
    const s = token && sessions[token];
    if (s && s.expires > Date.now()) return s.user;
    if (s) delete sessions[token];
    return null;
  }
  function checkPin(supplied) {
    const a = Buffer.from(ADMIN_PIN);
    const b = Buffer.from(String(supplied || '').trim());
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // ---------- body parsing ----------
  function parseBody(req, maxBytes = 2_500_000) {
    return new Promise((resolve, reject) => {
      let body = ''; let size = 0;
      req.on('data', ch => {
        size += ch.length;
        if (size > maxBytes) { reject(new Error('Payload too large')); req.destroy(); return; }
        body += ch.toString();
      });
      req.on('end', () => {
        const ct = (req.headers['content-type'] || '').toLowerCase();
        try {
          if (ct.includes('application/json')) resolve(JSON.parse(body || '{}'));
          else if (ct.includes('application/x-www-form-urlencoded')) resolve(querystring.parse(body));
          else { try { resolve(JSON.parse(body || '{}')); } catch { resolve({ raw: body }); } }
        } catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  // ---------- CORS ----------
  function setCORS(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // ---------- tiny rate-limit for public submit ----------
  const submitHits = new Map();
  function allowSubmit(ip) {
    const now = Date.now(), windowMs = 5 * 60 * 1000, maxHits = 5;
    const arr = (submitHits.get(ip) || []).filter(ts => now - ts < windowMs);
    if (arr.length >= maxHits) return false;
    arr.push(now); submitHits.set(ip, arr); return true;
  }

  // ---------- server ----------
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const method = req.method;

    setCORS(req, res);
    if (method === 'OPTIONS') { res.writeHead(204).end(); return; }

    // root + health
    if (url.pathname === '/' && method === 'GET') {
      const fp = path.join(__dirname, 'index.html');
      try {
        const data = await fs.readFile(fp);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(data);
      } catch {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
          .end('GPTMart connector is running. /index.html not found.');
      }
      return;
    }
    if (url.pathname === '/api/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true })); return;
    }

    // ---------- API ----------
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');

      // LOGIN (sets cookie + returns token json)
      if (url.pathname === '/api/login' && method === 'POST') {
        try {
          const body = await parseBody(req);
          const pin = body.pin ?? body.PIN ?? body.passcode ?? body.password ?? '';
          if (!checkPin(pin)) { res.writeHead(401).end(JSON.stringify({ error: 'Invalid PIN' })); return; }
          const token = createToken({ user: 'admin' });
          res.setHeader('Set-Cookie', [
            `session=${encodeURIComponent(token)}`,
            'HttpOnly','Path=/','SameSite=None','Secure','Max-Age=3600'
          ].join('; '));
          res.writeHead(200).end(JSON.stringify({ success: true, token }));
        } catch { res.writeHead(400).end(JSON.stringify({ error: 'Invalid request body' })); }
        return;
      }

      // PUBLIC: live items
      if (url.pathname === '/api/gpts/public' && method === 'GET') {
        const db = await readJSON(DB_PATH, { settings: { title: 'GPTMart' }, items: [] });
        res.writeHead(200).end(JSON.stringify({ settings: db.settings, items: (db.items||[]).filter(i => i.status === 'live') }));
        return;
      }

      // PUBLIC: user can submit GPT (goes pending)
      if (url.pathname === '/api/gpts/submit' && method === 'POST') {
        try {
          const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
          if (!allowSubmit(ip)) { res.writeHead(429).end(JSON.stringify({ error: 'Too many submissions. Try later.' })); return; }
          const body = await parseBody(req);
          const title = String(body.title || '').trim().slice(0,120);
          const urlStr = String(body.url || '').trim().slice(0,1000);
          const icon = String(body.icon || '').trim().slice(0,1500000);
          const desc = String(body.desc || '').trim().slice(0,800);
          const categories = Array.isArray(body.categories) ? body.categories.slice(0,10).map(s=>String(s).trim().slice(0,40)) : [];
          const tags = Array.isArray(body.tags) ? body.tags.slice(0,20).map(s=>String(s).trim().slice(0,32)) : [];
          if (!title) { res.writeHead(400).end(JSON.stringify({ error:'Title is required' })); return; }
          if (!/^https:\/\/chatgpt\.com\/g\//i.test(urlStr)) { res.writeHead(400).end(JSON.stringify({ error:'ChatGPT link must start with https://chatgpt.com/g/...' })); return; }
          const db = await readJSON(DB_PATH, { settings:{title:'GPTMart'}, items:[] });
          const item = { id: uuidv4(), title, url: urlStr, icon, desc, categories, tags, featured:false, status:'pending', createdAt: Date.now(), submittedBy: ip };
          db.items.push(item);
          await writeJSON(DB_PATH, db);
          res.writeHead(201).end(JSON.stringify({ success:true, id:item.id }));
        } catch { res.writeHead(500).end(JSON.stringify({ error: 'Server error' })); }
        return;
      }

      // PUBLIC: collect leads (email + message)
      if (url.pathname === '/api/leads' && method === 'POST') {
        try {
          const body = await parseBody(req);
          const email = String(body.email || '').trim();
          const message = String(body.message || '').trim();
          const name = String(body.name || '').trim();
          if (!email || !message) { res.writeHead(400).end(JSON.stringify({ error: 'Email and message required' })); return; }
          const leads = await readJSON(LEADS_PATH, []);
          leads.push({ id: uuidv4(), email, name, message, ua: body.ua || req.headers['user-agent'] || '', tz: body.tz || '', createdAt: Date.now() });
          await writeJSON(LEADS_PATH, leads);
          res.writeHead(201).end(JSON.stringify({ ok: true }));
        } catch { res.writeHead(500).end(JSON.stringify({ error: 'Server error' })); }
        return;
      }

      // ----- Admin auth gate (cookie or bearer) -----
      const authHeader = req.headers['authorization'];
      const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const cookieHeader = req.headers.cookie || '';
      const cookieTok = cookieHeader.split(';').map(s => s.trim()).map(kv => kv.split('='))
        .reduce((acc,[k,v]) => (k==='session' ? decodeURIComponent(v||'') : acc), null);
      const user = verifyTokenValue(bearer || cookieTok);
      if (!user) { res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' })); return; }

      // ----- Admin: read all, create, update, delete -----
      if (url.pathname === '/api/gpts/all' && method === 'GET') {
        const db = await readJSON(DB_PATH, { settings:{title:'GPTMart'}, items:[] });
        res.writeHead(200).end(JSON.stringify(db));
        return;
      }

      if (url.pathname === '/api/leads' && method === 'GET') {
        const leads = await readJSON(LEADS_PATH, []);
        res.writeHead(200).end(JSON.stringify({ items: leads }));
        return;
      }

      if (url.pathname === '/api/gpts/create' && method === 'POST') {
        try {
          const db = await readJSON(DB_PATH, { settings:{title:'GPTMart'}, items:[] });
          const body = await parseBody(req);
          body.id = uuidv4();
          body.createdAt = Date.now();
          db.items.unshift(body);
          await writeJSON(DB_PATH, db);
          res.writeHead(201).end(JSON.stringify(body));
        } catch { res.writeHead(500).end(JSON.stringify({ error:'Server error' })); }
        return;
      }

      if (url.pathname.startsWith('/api/gpts/update/') && method === 'PUT') {
        try {
          const id = path.basename(url.pathname);
          const body = await parseBody(req);
          const db = await readJSON(DB_PATH, { settings:{title:'GPTMart'}, items:[] });
          const idx = db.items.findIndex(i => i.id === id);
          if (idx < 0) { res.writeHead(404).end(JSON.stringify({ error:'Item not found' })); return; }
          db.items[idx] = { ...db.items[idx], ...body };
          await writeJSON(DB_PATH, db);
          res.writeHead(200).end(JSON.stringify(db.items[idx]));
        } catch { res.writeHead(500).end(JSON.stringify({ error:'Server error' })); }
        return;
      }

      if (url.pathname.startsWith('/api/gpts/delete/') && method === 'DELETE') {
        try {
          const id = path.basename(url.pathname);
          const db = await readJSON(DB_PATH, { settings:{title:'GPTMart'}, items:[] });
          const before = db.items.length;
          db.items = db.items.filter(i => i.id !== id);
          if (db.items.length === before) { res.writeHead(404).end(JSON.stringify({ error:'Item not found' })); return; }
          await writeJSON(DB_PATH, db);
          res.writeHead(204).end();
        } catch { res.writeHead(500).end(JSON.stringify({ error:'Server error' })); }
        return;
      }

      res.writeHead(404).end(JSON.stringify({ error: 'API route not found' }));
      return;
    }

    // ---------- static files ----------
    try {
      const filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
      const data = await fs.readFile(filePath);
      let contentType = 'text/html; charset=utf-8';
      if (filePath.endsWith('.js')) contentType = 'application/javascript; charset=utf-8';
      else if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
      else if (filePath.endsWith('.json')) contentType = 'application/json; charset=utf-8';
      else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
      else if (filePath.endsWith('.png')) contentType = 'image/png';
      else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.writeHead(200).end(data);
    } catch {
      res.writeHead(404).end('<h1>404 Not Found</h1>');
    }
  });

  server.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
}
startServer().catch(err => console.error('Failed to start server:', err));
