// A simple Express.js server to provide a secure backend for GPTMart.
// To run this:
// 1. Install Node.js on your machine.
// 2. In your terminal, in this project's directory, run: npm install express uuid jsonwebtoken
// 3. Then, run: node server.js
// 4. Open http://localhost:3000 in your browser.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// --- CONFIGURATION ---
// IMPORTANT: Change these values for a real application!
const ADMIN_PIN = '4545'; // The secret PIN for admin login
const JWT_SECRET = 'your-super-secret-key-that-is-long-and-random'; // Secret for signing tokens
const TOKEN_EXPIRY = '1d'; // How long the login session lasts

// --- MIDDLEWARE ---
app.use(express.json()); // To parse JSON bodies
app.use(express.static(path.join(__dirname))); // Serve static files like HTML, CSS

// Middleware to protect admin routes
const requireAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

    if (!token) {
        return res.status(401).json({ message: 'Authentication token required.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token.' }); // Forbidden
        }
        req.user = user;
        next();
    });
};


// --- DATABASE HELPERS ---
const readDb = () => {
    try {
        if (!fs.existsSync(DB_PATH)) {
            // Create a default DB if it doesn't exist
            const starterData = require('./starter-gpts.js');
            const initialDb = {
                settings: { title: "GPTMart" },
                items: starterData.map(item => ({...item, id: uuidv4() })),
            };
            fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2));
            return initialDb;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading database:", error);
        return { settings: { title: "GPTMart" }, items: [] };
    }
};

const writeDb = (data) => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Error writing to database:", error);
    }
};

// --- AUTHENTICATION ROUTES ---

// Login Endpoint
app.post('/api/auth/login', (req, res) => {
    const { pin } = req.body;
    if (pin === ADMIN_PIN) {
        // Correct PIN: generate a JWT token
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
        res.json({ message: 'Login successful', token });
    } else {
        res.status(401).json({ message: 'Invalid PIN' });
    }
});

// Token Verification Endpoint
app.get('/api/auth/verify', requireAuth, (req, res) => {
    // If requireAuth middleware passes, the token is valid.
    res.json({ message: 'Token is valid.' });
});


// --- PUBLIC API ROUTES (No auth needed) ---

// Get all LIVE GPTs for the public explore page
app.get('/api/gpts', (req, res) => {
    const db = readDb();
    const liveItems = db.items.filter(item => item.status === 'live');
    res.json(liveItems);
});

// Get public settings
app.get('/api/settings', (req, res) => {
    const db = readDb();
    res.json(db.settings);
});


// --- ADMIN API ROUTES (Auth required) ---

// Get ALL GPTs (live and hidden) for the admin panel
app.get('/api/gpts/all', requireAuth, (req, res) => {
    const db = readDb();
    res.json(db.items);
});

// Add a new GPT
app.post('/api/gpts', requireAuth, (req, res) => {
    const db = readDb();
    const newItem = {
        id: uuidv4(),
        ...req.body,
        createdAt: Date.now(),
    };
    db.items.unshift(newItem);
    writeDb(db);
    res.status(201).json(newItem);
});

// Update an existing GPT
app.put('/api/gpts/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    const db = readDb();
    const itemIndex = db.items.findIndex(item => item.id === id);

    if (itemIndex === -1) {
        return res.status(404).json({ message: 'Item not found' });
    }

    // Preserve original createdAt and id
    const originalItem = db.items[itemIndex];
    db.items[itemIndex] = { ...originalItem, ...req.body, id: originalItem.id };
    
    writeDb(db);
    res.json(db.items[itemIndex]);
});

// Delete a GPT
app.delete('/api/gpts/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    let db = readDb();
    const initialLength = db.items.length;
    db.items = db.items.filter(item => item.id !== id);

    if (db.items.length === initialLength) {
        return res.status(404).json({ message: 'Item not found' });
    }

    writeDb(db);
    res.status(204).send(); // No Content
});

// Update settings
app.post('/api/settings', requireAuth, (req, res) => {
    const db = readDb();
    db.settings = { ...db.settings, ...req.body };
    writeDb(db);
    res.json(db.settings);
});

// Import data (overwrite everything)
app.post('/api/import', requireAuth, (req, res) => {
    const { items, settings } = req.body;
    if (!Array.isArray(items)) {
        return res.status(400).json({ message: 'Invalid data format.' });
    }
    const newDb = {
        settings: settings || { title: "GPTMart" },
        items: items.map(item => ({ ...item, id: item.id || uuidv4() })),
    };
    writeDb(newDb);
    res.json({ message: 'Import successful.' });
});


// --- SERVE FRONT-END FILES ---
// This serves your main public page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// This serves the admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Initialize DB on start
    readDb();
});

// We need a helper file for the initial data
fs.writeFileSync(path.join(__dirname, 'starter-gpts.js'), `
module.exports = [
    { title:"jQuery Tutor", desc:"Learn and master jQuery: selectors, events, animations, DOM, AJAX, plugins, debugging, and modern alternatives.", icon:"https://www.vectorlogo.zone/logos/jquery/jquery-icon.svg", categories:["Frontend","Tools"], url:"https://chatgpt.com/g/g-68b859c4f6f88191b05a4effe7d2140a-jquery-tutor", status: 'live', featured: true, createdAt: 1729000000000 },
    { title:"ASP Tutor", desc:"Classic ASP + modern ASP.NET (C#). Server-side scripting, examples, debugging, and web app best practices.", icon:"https://cdn.iconscout.com/icon/free/png-256/asp-net-3-1175185.png", categories:["Backend","Languages"], url:"https://chatgpt.com/g/g-68b6eaad79e48191b3b2c487f0e60071-asp-tutor?model=gpt-5", status: 'live', featured: true, createdAt: 1728900000000 },
    { title:"Artificial Intelligence Mentor", desc:"ML, DL, NLP, CV, RL, and Generative AI. Runnable code, projects, and ethics — beginner to advanced.", icon:"https://upload.wikimedia.org/wikipedia/commons/b/b9/AI_logo_by_United_Blasters.png", categories:["AI & Automation","Data"], url:"https://chatgpt.com/g/g-68b6e97f95ac81918b262e088c05f522-artificial-intelligence-mentor", status: 'live', featured: true, createdAt: 1728800000000 },
    { title:"Sass Tutor", desc:"Master Sass/SCSS: variables, mixins, nesting, partials, imports, architecture. Real-world patterns and debugging.", icon:"https://cdn.iconscout.com/icon/free/png-256/sass-226059.png", categories:["Frontend","Design"], url:"https://chatgpt.com/g/g-68b6e8bf3d7881919c484523463fa967-sass-tutor?model=gpt-5", status: 'live', featured: true, createdAt: 1728700000000 },
    { title:"Vue Tutor", desc:"Vue components, props, events, router, Pinia/Vuex, Composition API, API integration.", icon:"https://upload.wikimedia.org/wikipedia/commons/9/95/Vue.js_Logo_2.svg", categories:["Frontend","Frameworks"], url:"https://chatgpt.com/g/g-68b6e70822048191a981d4994078c447-vue-tutor", status: 'live', featured: false, createdAt: 1728600000000 },
    { title:"Cybersecurity Mentor", desc:"Network security, encryption, ethical hacking basics, malware, risk, and best practices. Lessons + simulations.", icon:"https://cdn-icons-png.flaticon.com/512/3063/3063468.png", categories:["Security"], url:"https://chatgpt.com/g/g-68b6e41946448191af4377ad84dafe24-cybersecurity-mentor", status: 'hidden', featured: false, createdAt: 1728500000000 }
];
`);
