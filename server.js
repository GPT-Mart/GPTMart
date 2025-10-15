// server.js
// Tiny JSON "DB" with safe, serialized writes + minimal admin auth.

const fs = require("fs").promises;
const fssync = require("fs");
const path = require("path");
const express = require("express");
const { v4: uuidv4 } = require("uuid"); // uuid@^13 works like this  ✅
const app = express();

app.use(express.json());

// ---------- Paths & Bootstrapping ----------
const DB_PATH = path.join(__dirname, "db.json");
const TMP_PATH = DB_PATH + ".tmp";

// In-memory state is the source of truth during runtime.
// All handlers must read/update THIS object, then persist via writeDB().
let DB = {
  settings: { title: "GPTMart" },
  items: []
};

// If db.json is missing or unreadable, we’ll create it from defaults.
// NOTE: This mirrors your current behavior — keep backups of db.json to avoid data loss on fresh regen.
async function loadDB() {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    DB = JSON.parse(raw);
    if (!DB || typeof DB !== "object") throw new Error("Invalid DB format");
    DB.items ||= [];
    DB.settings ||= { title: "GPTMart" };
  } catch (err) {
    // Create a brand-new file with defaults
    await atomicWrite(DB_PATH, JSON.stringify(DB, null, 2));
  }
}

// ---------- Write Queue / Mutex ----------
// We serialize writes by queueing "writer functions" that operate on the current in-memory DB.
// This avoids the stale-snapshot problem (each op runs after the previous one finishes).
let writing = false;
const queue = [];

/**
 * Enqueue a mutation function that receives (DB) and may modify it,
 * then persists to disk exactly once after the mutation succeeds.
 * Usage: enqueueWrite(db => { ... mutate db ... })
 */
function enqueueWrite(mutator) {
  return new Promise((resolve, reject) => {
    queue.push({ mutator, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (writing) return;
  writing = true;

  while (queue.length) {
    const { mutator, resolve, reject } = queue.shift();
    try {
      // 1) Run mutation against the latest in-memory DB
      await Promise.resolve(mutator(DB));

      // 2) Persist (atomic write)
      await atomicWrite(DB_PATH, JSON.stringify(DB, null, 2));

      resolve();
    } catch (err) {
      reject(err);
    }
  }

  writing = false;
}

/**
 * Write file atomically by writing to a temp file and then renaming.
 * This minimizes risk of partial/corrupt writes on crash.
 */
async function atomicWrite(finalPath, data) {
  const tmp = TMP_PATH;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, finalPath);
}

// ---------- Auth (very simple) ----------
const OWNER_PIN = process.env.OWNER_PIN || "0000"; // set ENV in production
const activeTokens = new Set();

function requireAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token || !activeTokens.has(token)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.post("/api/login", async (req, res) => {
  const { pin } = req.body || {};
  if (String(pin) === String(OWNER_PIN)) {
    const token = uuidv4();
    activeTokens.add(token);
    // NOTE: Sessions are in-memory. Restarting the server clears sessions (expected).
    return res.json({ token });
  }
  return res.status(401).json({ error: "Invalid PIN" });
});

// ---------- Validation Helpers ----------
function coerceItemPayload(body = {}) {
  const item = {
    title: String(body.title || "").trim(),
    url: String(body.url || "").trim(),
    icon: String(body.icon || "").trim(),
    desc: String(body.desc || "").trim(),
    categories: Array.isArray(body.categories)
      ? body.categories.map(String).map(s => s.trim()).filter(Boolean)
      : String(body.categories || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean),
    tags: Array.isArray(body.tags)
      ? body.tags.map(String).map(s => s.trim()).filter(Boolean)
      : String(body.tags || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean),
    featured: Boolean(body.featured),
    status: (body.status === "hidden" ? "hidden" : "live")
  };
  if (!item.title || !item.url) {
    const err = new Error("title and url are required");
    err.status = 400;
    throw err;
  }
  return item;
}

// ---------- Public Endpoints ----------
app.get("/api/gpts/public", async (req, res) => {
  // Matches index.html’s fetch of /api/gpts/public
  // Returns only live items.
  const live = DB.items.filter(x => x.status === "live");
  res.json({ settings: DB.settings, items: live });
});

// ---------- Admin Endpoints (auth) ----------
app.get("/api/gpts/all", requireAuth, async (req, res) => {
  res.json({ settings: DB.settings, items: DB.items });
});

app.post("/api/gpts/create", requireAuth, async (req, res) => {
  try {
    const payload = coerceItemPayload(req.body);
    const item = {
      id: uuidv4(),
      createdAt: Date.now(),
      ...payload
    };
    await enqueueWrite(db => {
      db.items.push(item);
    });
    res.status(201).json({ ok: true, item });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to create item" });
  }
});

app.put("/api/gpts/update/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const payload = coerceItemPayload(req.body);
    await enqueueWrite(db => {
      const i = db.items.findIndex(x => x.id === id);
      if (i === -1) {
        const e = new Error("Item not found");
        e.status = 404;
        throw e;
      }
      db.items[i] = { ...db.items[i], ...payload };
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to update item" });
  }
});

app.delete("/api/gpts/delete/:id", requireAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    await enqueueWrite(db => {
      const before = db.items.length;
      db.items = db.items.filter(x => x.id !== id);
      if (db.items.length === before) {
        const e = new Error("Item not found");
        e.status = 404;
        throw e;
      }
    });
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || "Failed to delete item" });
  }
});

// Optional: update settings (e.g., title shown in index/footer)
app.put("/api/settings", requireAuth, async (req, res) => {
  const nextTitle = String((req.body && req.body.title) || "").trim();
  if (!nextTitle) return res.status(400).json({ error: "title is required" });
  await enqueueWrite(db => {
    db.settings.title = nextTitle;
  });
  res.json({ ok: true });
});

// ---------- Static (if you serve files from same server) ----------
app.use(express.static(path.join(__dirname)));

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
loadDB().then(() => {
  app.listen(PORT, () => console.log(`GPTMart server running on http://localhost:${PORT}`));
});
