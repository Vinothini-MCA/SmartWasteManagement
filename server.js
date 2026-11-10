// Smart Waste Monitoring System - Backend Server
// Pure Node.js (no external packages needed) + a JSON file as the database.
// Run with: node server.js   (Node.js v14+ is enough, nothing to npm install)

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const ADMIN_USER = { username: 'vinu', password: 'vinu@123' };
const AUTH_TOKEN = 'smartwaste-demo-token'; // simple fixed demo token

// ---------- tiny JSON "database" helpers ----------
function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
function nextId(arr) {
  return arr.length ? Math.max(...arr.map((x) => x.id)) + 1 : 1;
}

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  });
  res.end(contentType === 'application/json' ? JSON.stringify(body) : body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  return req.headers['x-auth-token'] === AUTH_TOKEN;
}

// ---------- static file serving for the frontend ----------
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  // prevent path traversal outside the public folder
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return send(res, 404, '<h1>404 Not Found</h1>', 'text/html');
    }
    const ext = path.extname(filePath);
    send(res, 200, data, MIME[ext] || 'application/octet-stream');
  });
}

// ---------- live vehicle tracking simulation ----------
// Interpolates the collection vehicle's position between a fixed depot and
// the bin tied to a complaint. Swap this for real GPS coordinates sent by
// the driver's phone/app when you have actual hardware in the field.
const DEPOT = { lat: 10.9, lng: 78.9 }; // central Tamil Nadu depot (demo)
const TRIP_DURATION_MS = 60 * 1000;
const tripStart = {};

// ---------- request router ----------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain');

  try {
    // ---- AUTH ----
    if (pathname === '/api/login' && req.method === 'POST') {
      const { username, password } = await readJsonBody(req);
      if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
        return send(res, 200, { token: AUTH_TOKEN, username });
      }
      return send(res, 401, { error: 'Invalid username or password' });
    }

    // ---- DUSTBINS ----
    if (pathname === '/api/dustbins' && req.method === 'GET') {
      return send(res, 200, readDB().dustbins);
    }

    const binMatch = pathname.match(/^\/api\/dustbins\/(\d+)$/);
    if (binMatch && req.method === 'GET') {
      const bin = readDB().dustbins.find((b) => b.id === Number(binMatch[1]));
      if (!bin) return send(res, 404, { error: 'Dustbin not found' });
      return send(res, 200, bin);
    }

    const fillMatch = pathname.match(/^\/api\/dustbins\/(\d+)\/fill$/);
    if (fillMatch && req.method === 'POST') {
      const db = readDB();
      const bin = db.dustbins.find((b) => b.id === Number(fillMatch[1]));
      if (!bin) return send(res, 404, { error: 'Dustbin not found' });
      const body = await readJsonBody(req);
      const level = Math.max(0, Math.min(100, Number(body.fillLevel)));
      bin.fillLevel = level;
      bin.status = level >= 85 ? 'overflow' : level >= 60 ? 'warning' : 'normal';
      bin.lastUpdated = new Date().toISOString();
      writeDB(db);
      return send(res, 200, bin);
    }

    if (pathname === '/api/dustbins' && req.method === 'POST') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
      const db = readDB();
      const { name, area, lat, lng } = await readJsonBody(req);
      const bin = {
        id: nextId(db.dustbins),
        name,
        area,
        lat,
        lng,
        fillLevel: 0,
        status: 'normal',
        lastUpdated: new Date().toISOString(),
      };
      db.dustbins.push(bin);
      writeDB(db);
      return send(res, 201, bin);
    }

    // ---- COMPLAINTS ----
    if (pathname === '/api/complaints' && req.method === 'POST') {
      const db = readDB();
      const { dustbinId, name, phone, description } = await readJsonBody(req);
      const bin = db.dustbins.find((b) => b.id === Number(dustbinId));
      if (!bin) return send(res, 404, { error: 'Dustbin not found' });

      const complaint = {
        id: nextId(db.complaints),
        dustbinId: bin.id,
        dustbinName: bin.name,
        area: bin.area,
        lat: bin.lat,
        lng: bin.lng,
        name,
        phone,
        description,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      db.complaints.push(complaint);
      writeDB(db);
      return send(res, 201, { message: 'Complaint submitted', complaint });
    }

    if (pathname === '/api/complaints' && req.method === 'GET') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
      return send(res, 200, readDB().complaints.slice().reverse());
    }

    const statusMatch = pathname.match(/^\/api\/complaints\/(\d+)\/status$/);
    if (statusMatch && req.method === 'PUT') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin login required' });
      const db = readDB();
      const complaint = db.complaints.find((c) => c.id === Number(statusMatch[1]));
      if (!complaint) return send(res, 404, { error: 'Complaint not found' });
      const body = await readJsonBody(req);
      complaint.status = body.status;

      if (body.status === 'resolved') {
        const bin = db.dustbins.find((b) => b.id === complaint.dustbinId);
        if (bin) {
          bin.fillLevel = 0;
          bin.status = 'normal';
          bin.lastUpdated = new Date().toISOString();
        }
      }
      writeDB(db);
      return send(res, 200, complaint);
    }

    // ---- LIVE TRACKING ----
    const trackMatch = pathname.match(/^\/api\/tracking\/(\d+)$/);
    if (trackMatch && req.method === 'GET') {
      const db = readDB();
      const complaint = db.complaints.find((c) => c.id === Number(trackMatch[1]));
      if (!complaint) return send(res, 404, { error: 'Complaint not found' });

      if (!tripStart[complaint.id]) tripStart[complaint.id] = Date.now();
      const elapsed = Date.now() - tripStart[complaint.id];
      const progress = Math.min(1, elapsed / TRIP_DURATION_MS);

      const lat = DEPOT.lat + (complaint.lat - DEPOT.lat) * progress;
      const lng = DEPOT.lng + (complaint.lng - DEPOT.lng) * progress;

      return send(res, 200, {
        complaintId: complaint.id,
        vehicle: { lat, lng },
        destination: { lat: complaint.lat, lng: complaint.lng },
        depot: DEPOT,
        progress,
        arrived: progress >= 1,
      });
    }

    // ---- fallback to static frontend files ----
    if (req.method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Smart Waste Monitoring System running at http://localhost:${PORT}`);
});
