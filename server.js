const http = require('http');
const fs = require('fs').promises;
const path = require('path');

// --- ASYNCHRONOUS INITIALIZATION ---
// We wrap the server startup in an async function to handle the dynamic import.
async function startServer() {
    // FIX: Dynamically import the ES Module 'uuid'
    const { v4: uuidv4 } = await import('uuid');

    // --- CONFIGURATION ---
    const PORT = process.env.PORT || 3000;
    const ADMIN_PIN = '4545'; // IMPORTANT: Change this PIN!
    const DB_PATH = path.join(__dirname, 'db.json');

    // --- DATABASE HELPERS ---
    async function readDB() {
        try {
            const data = await fs.readFile(DB_PATH, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // If DB doesn't exist, create it with default data
            const defaultData = {
                settings: { title: "GPTMart" },
                items: [
                    { id: uuidv4(), title:"jQuery Tutor", desc:"Learn and master jQuery", icon:"https://www.vectorlogo.zone/logos/jquery/jquery-icon.svg", categories:["Frontend","Tools"], url:"#", status: 'live', featured: true, createdAt: Date.now() - 10000 },
                    { id: uuidv4(), title:"AI Mentor", desc:"ML, DL, NLP, CV, RL, and Generative AI.", icon:"https://upload.wikimedia.org/wikipedia/commons/b/b9/AI_logo_by_United_Blasters.png", categories:["AI & Automation","Data"], url:"#", status: 'live', featured: true, createdAt: Date.now() - 20000 },
                    { id: uuidv4(), title:"Cybersecurity Mentor", desc:"Network security, encryption, ethical hacking basics.", icon:"https://cdn-icons-png.flaticon.com/512/3063/3063468.png", categories:["Security"], url:"#", status: 'hidden', featured: false, createdAt: Date.now() - 30000 }
                ]
            };
            await writeDB(defaultData);
            return defaultData;
        }
    }

    async function writeDB(data) {
        await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
    }

    // --- AUTH MOCK (replace with real JWT in production) ---
    const sessions = {};
    function createToken(data) {
        const token = uuidv4();
        sessions[token] = { user: data, expires: Date.now() + 3600 * 1000 }; // 1 hour expiry
        return token;
    }
    function verifyToken(token) {
        const session = sessions[token];
        if (session && session.expires > Date.now()) {
            return session.user;
        }
        delete sessions[token];
        return null;
    }

    // --- REQUEST HANDLER ---
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const method = req.method;

        // --- API ROUTES ---
        if (url.pathname.startsWith('/api/')) {
            res.setHeader('Content-Type', 'application/json');
            
            if (url.pathname === '/api/login' && method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', () => {
                    const { pin } = JSON.parse(body);
                    if (pin === ADMIN_PIN) {
                        const token = createToken({ user: 'admin' });
                        res.writeHead(200).end(JSON.stringify({ success: true, token }));
                    } else {
                        res.writeHead(401).end(JSON.stringify({ error: 'Invalid PIN' }));
                    }
                });
                return;
            }
            
            if (url.pathname === '/api/gpts' && method === 'GET') {
                const db = await readDB();
                const publicItems = db.items.filter(item => item.status === 'live');
                res.writeHead(200).end(JSON.stringify({ settings: db.settings, items: publicItems }));
                return;
            }

            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (!verifyToken(token)) {
                res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            const db = await readDB();
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', async () => {
                if (url.pathname === '/api/gpts/all' && method === 'GET') {
                    res.writeHead(200).end(JSON.stringify(db));
                } else if (url.pathname === '/api/gpts' && method === 'POST') {
                    const newItem = JSON.parse(body);
                    newItem.id = uuidv4();
                    newItem.createdAt = Date.now();
                    db.items.unshift(newItem);
                    await writeDB(db);
                    res.writeHead(201).end(JSON.stringify(newItem));
                } else if (url.pathname.startsWith('/api/gpts/') && method === 'PUT') {
                    const id = url.pathname.split('/')[3];
                    const updatedItemData = JSON.parse(body);
                    const itemIndex = db.items.findIndex(i => i.id === id);
                    if (itemIndex > -1) {
                        db.items[itemIndex] = { ...db.items[itemIndex], ...updatedItemData };
                        await writeDB(db);
                        res.writeHead(200).end(JSON.stringify(db.items[itemIndex]));
                    } else {
                        res.writeHead(404).end(JSON.stringify({ error: 'Item not found' }));
                    }
                } else if (url.pathname.startsWith('/api/gpts/') && method === 'DELETE') {
                    const id = url.pathname.split('/')[3];
                    const itemIndex = db.items.findIndex(i => i.id === id);
                    if (itemIndex > -1) {
                        db.items.splice(itemIndex, 1);
                        await writeDB(db);
                        res.writeHead(204).end();
                    } else {
                        res.writeHead(404).end(JSON.stringify({ error: 'Item not found' }));
                    }
                } else {
                    res.writeHead(404).end(JSON.stringify({ error: 'API route not found' }));
                }
            });
            return;
        }

        // --- STATIC FILE SERVING ---
        let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
        try {
            const data = await fs.readFile(filePath);
            let contentType = 'text/html';
            if (filePath.endsWith('.js')) contentType = 'application/javascript';
            res.setHeader('Content-Type', contentType).writeHead(200).end(data);
        } catch (error) {
            res.writeHead(404).end('<h1>404 Not Found</h1>');
        }
    });

    server.listen(PORT, () => {
        console.log(`✅ Server running at http://localhost:${PORT}/`);
    });
}

// Start the server
startServer().catch(err => console.error('Failed to start server:', err));

