
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const BACKUPS_DIR = path.join(__dirname, 'backups');
const WAUTH_DIR = path.join(__dirname, 'wauth'); // Folder to store WhatsApp session

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR);
if (!fs.existsSync(WAUTH_DIR)) fs.mkdirSync(WAUTH_DIR);

app.use(cors());
app.use(express.json({ limit: '200mb' })); 

// --- SECURITY: Force HTTPS & Trust Proxy ---
app.enable('trust proxy');
app.use((req, res, next) => {
    const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.hostname.startsWith('192.168.') || req.hostname.startsWith('10.');
    if (isLocal) return next();
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        next();
    } else {
        res.redirect(`https://${req.headers.host}${req.url}`);
    }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(UPLOADS_DIR));

const getDb = () => {
    let db;
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            settings: {
                currentTrackingNumber: 1602,
                companyNames: [],
                companies: [], // New structure
                defaultCompany: '',
                bankNames: [],
                commodityGroups: [],
                rolePermissions: {},
                telegramBotToken: '',
                telegramAdminId: '',
                smsApiKey: '',
                smsSenderNumber: '',
                whatsappNumber: ''
            },
            orders: [],
            users: [
                { id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم', role: 'admin', canManageTrade: true }
            ],
            messages: [],
            groups: [],
            tasks: [],
            tradeRecords: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    } else {
        db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
    return db;
};

const saveDb = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// --- WHATSAPP CLIENT SETUP (SERVER SIDE) ---
console.log('Initializing WhatsApp Client...');
const whatsappClient = new Client({
    authStrategy: new LocalAuth({ dataPath: WAUTH_DIR }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for some VPS environments
    }
});

let isWhatsAppReady = false;

whatsappClient.on('qr', (qr) => {
    console.log('\n=============================================================');
    console.log('>>> لطفاً کد QR زیر را با واتساپ گوشی خود اسکن کنید <<<');
    console.log('=============================================================\n');
    qrcode.generate(qr, { small: true });
});

whatsappClient.on('ready', () => {
    console.log('\n>>> WhatsApp Client is READY! <<<\n');
    isWhatsAppReady = true;
});

whatsappClient.on('auth_failure', msg => {
    console.error('WhatsApp Authentication Failure:', msg);
});

whatsappClient.on('disconnected', (reason) => {
    console.log('WhatsApp Client was disconnected:', reason);
    isWhatsAppReady = false;
    // Optional: whatsappClient.initialize();
});

// Initialize WhatsApp (Non-blocking)
try {
    whatsappClient.initialize();
} catch (e) {
    console.error("Failed to initialize WhatsApp:", e);
}

// --- HELPER FUNCTIONS ---
const toShamsi = (isoDate) => {
    if (!isoDate) return '-';
    try {
        return new Date(isoDate).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) { return isoDate; }
};

const formatCurrency = (amount) => new Intl.NumberFormat('fa-IR').format(amount);

const generateUUID = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const findNextAvailableTrackingNumber = (db) => {
    const baseNum = (db.settings.currentTrackingNumber || 1602);
    const startNum = baseNum + 1;
    const existingNumbers = db.orders.map(o => o.trackingNumber).sort((a, b) => a - b);
    let nextNum = startNum;
    for (const num of existingNumbers) { if (num < nextNum) continue; if (num === nextNum) { nextNum++; } else if (num > nextNum) { return nextNum; } }
    return nextNum;
};

// --- DATE HELPERS FOR CRON ---
const parsePersianDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return null;
    // Simple conversion not needed for just comparison, but keeping structure
    return new Date(y, m - 1, d); // Treat as Gregorian for simple diff calc if input is consistent
};

// --- API ROUTES ---

app.post('/api/send-whatsapp', async (req, res) => {
    if (!isWhatsAppReady) {
        return res.status(503).json({ success: false, message: 'ربات واتساپ سرور هنوز آماده نیست یا اسکن نشده است. لطفا کنسول سرور را چک کنید.' });
    }
    
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'Missing number or message' });

    try {
        // Normalize Number: remove + and 00, ensure it starts with country code (98 for Iran)
        let cleanNumber = number.toString().replace(/\D/g, ''); // Remove non-digits
        
        // Simple heuristic for Iranian numbers (e.g. 0912... -> 98912...)
        if (cleanNumber.startsWith('09')) {
            cleanNumber = '98' + cleanNumber.substring(1);
        } else if (cleanNumber.startsWith('9') && cleanNumber.length === 10) {
            cleanNumber = '98' + cleanNumber;
        }
        
        // Append WhatsApp suffix
        const chatId = `${cleanNumber}@c.us`;
        
        await whatsappClient.sendMessage(chatId, message);
        res.json({ success: true });
    } catch (e) {
        console.error("WhatsApp Send Error:", e);
        res.status(500).json({ success: false, message: 'خطا در ارسال پیام واتساپ: ' + e.message });
    }
});

// ... (Rest of existing API routes remain unchanged) ...

app.get('/api/manifest', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const db = getDb();
    const settings = db.settings || {};
    const iconBase = settings.pwaIcon || "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-keep.png";
    const iconSrc = iconBase.includes('?') ? iconBase : `${iconBase}?v=${Date.now()}`;
    const manifest = { "name": "Payment Order System", "short_name": "PaymentSys", "start_url": "/", "display": "standalone", "background_color": "#f3f4f6", "theme_color": "#2563eb", "orientation": "portrait-primary", "icons": [ { "src": iconSrc, "sizes": "192x192", "type": "image/png" }, { "src": iconSrc, "sizes": "512x512", "type": "image/png" } ] };
    res.json(manifest);
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = getDb();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (user) res.json(user);
    else res.status(401).json({ message: 'Invalid credentials' });
});

app.get('/api/users', (req, res) => { res.json(getDb().users); });
app.post('/api/users', (req, res) => { const db = getDb(); db.users.push(req.body); saveDb(db); res.json(db.users); });
app.put('/api/users/:id', (req, res) => { const db = getDb(); const idx = db.users.findIndex(u => u.id === req.params.id); if (idx !== -1) { db.users[idx] = { ...db.users[idx], ...req.body }; saveDb(db); res.json(db.users); } else res.status(404).json({ message: 'User not found' }); });
app.delete('/api/users/:id', (req, res) => { const db = getDb(); db.users = db.users.filter(u => u.id !== req.params.id); saveDb(db); res.json(db.users); });

app.get('/api/settings', (req, res) => { res.json(getDb().settings); });
app.post('/api/settings', (req, res) => { const db = getDb(); db.settings = req.body; saveDb(db); res.json(db.settings); });

app.get('/api/chat', (req, res) => { res.json(getDb().messages); });
app.post('/api/chat', (req, res) => {
    const db = getDb();
    const newMsg = req.body;
    if (db.messages.length > 500) db.messages = db.messages.slice(-500);
    db.messages.push(newMsg);
    saveDb(db);
    res.json(db.messages);
});
app.put('/api/chat/:id', (req, res) => { const db = getDb(); const idx = db.messages.findIndex(m => m.id === req.params.id); if (idx !== -1) { db.messages[idx] = { ...db.messages[idx], ...req.body }; saveDb(db); res.json(db.messages); } else res.status(404).json({ message: 'Message not found' }); });
app.delete('/api/chat/:id', (req, res) => { const db = getDb(); db.messages = db.messages.filter(m => m.id !== req.params.id); saveDb(db); res.json(db.messages); });

app.get('/api/groups', (req, res) => { res.json(getDb().groups); });
app.post('/api/groups', (req, res) => { const db = getDb(); db.groups.push(req.body); saveDb(db); res.json(db.groups); });
app.put('/api/groups/:id', (req, res) => { const db = getDb(); const idx = db.groups.findIndex(g => g.id === req.params.id); if (idx !== -1) { db.groups[idx] = { ...db.groups[idx], ...req.body }; saveDb(db); res.json(db.groups); } else res.status(404).json({ message: 'Group not found' }); });
app.delete('/api/groups/:id', (req, res) => { const db = getDb(); db.groups = db.groups.filter(g => g.id !== req.params.id); saveDb(db); res.json(db.groups); });

app.get('/api/tasks', (req, res) => { res.json(getDb().tasks); });
app.post('/api/tasks', (req, res) => { const db = getDb(); db.tasks.push(req.body); saveDb(db); res.json(db.tasks); });
app.put('/api/tasks/:id', (req, res) => { const db = getDb(); const idx = db.tasks.findIndex(t => t.id === req.params.id); if (idx !== -1) { db.tasks[idx] = req.body; saveDb(db); res.json(db.tasks); } else res.status(404).json({error: 'Task not found'}); });
app.delete('/api/tasks/:id', (req, res) => { const db = getDb(); db.tasks = db.tasks.filter(t => t.id !== req.params.id); saveDb(db); res.json(db.tasks); });

app.get('/api/trade', (req, res) => { res.json(getDb().tradeRecords || []); });
app.post('/api/trade', (req, res) => { const db = getDb(); db.tradeRecords = db.tradeRecords || []; db.tradeRecords.push(req.body); saveDb(db); res.json(db.tradeRecords); });
app.put('/api/trade/:id', (req, res) => { const db = getDb(); db.tradeRecords = db.tradeRecords || []; const idx = db.tradeRecords.findIndex(t => t.id === req.params.id); if (idx !== -1) { db.tradeRecords[idx] = req.body; saveDb(db); res.json(db.tradeRecords); } else res.status(404).json({error: 'Trade record not found'}); });
app.delete('/api/trade/:id', (req, res) => { const db = getDb(); db.tradeRecords = (db.tradeRecords || []).filter(t => t.id !== req.params.id); saveDb(db); res.json(db.tradeRecords); });

app.post('/api/upload', (req, res) => {
    try {
        const { fileName, fileData } = req.body;
        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).send('Invalid base64');
        const buffer = Buffer.from(matches[2], 'base64');
        const uniqueName = Date.now() + '_' + fileName;
        const filePath = path.join(UPLOADS_DIR, uniqueName);
        fs.writeFileSync(filePath, buffer);
        res.json({ url: `/uploads/${uniqueName}`, fileName: uniqueName });
    } catch (e) { res.status(500).send('Upload failed'); }
});

app.get('/api/next-tracking-number', (req, res) => { res.json({ nextTrackingNumber: findNextAvailableTrackingNumber(getDb()) }); });
app.get('/api/orders', (req, res) => { res.json(getDb().orders); });

app.post('/api/orders', (req, res) => {
    const db = getDb();
    const newOrder = req.body;
    newOrder.updatedAt = Date.now();
    let assignedTrackingNumber = newOrder.trackingNumber;
    const isTaken = db.orders.some(o => o.trackingNumber === assignedTrackingNumber);
    if (isTaken) { assignedTrackingNumber = findNextAvailableTrackingNumber(db); newOrder.trackingNumber = assignedTrackingNumber; }
    db.orders.unshift(newOrder);
    saveDb(db);
    res.json(db.orders);
});

app.put('/api/orders/:id', (req, res) => {
    const db = getDb();
    const updatedOrder = req.body;
    updatedOrder.updatedAt = Date.now();
    const index = db.orders.findIndex(o => o.id === req.params.id);
    if (index !== -1) {
        db.orders[index] = updatedOrder;
        saveDb(db);
        res.json(db.orders);
    } else res.status(404).json({ message: 'Order not found' });
});

app.delete('/api/orders/:id', (req, res) => { const db = getDb(); db.orders = db.orders.filter(o => o.id !== req.params.id); saveDb(db); res.json(db.orders); });
app.get('/api/backup', (req, res) => { const db = getDb(); res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename=database_backup.json'); res.json(db); });
app.post('/api/restore', (req, res) => { const newData = req.body; if (!newData || !Array.isArray(newData.orders) || !Array.isArray(newData.users)) { return res.status(400).json({ message: 'Invalid backup' }); } saveDb(newData); res.json({ success: true }); });
app.get('*', (req, res) => { const indexPath = path.join(__dirname, 'dist', 'index.html'); if (fs.existsSync(indexPath)) { res.sendFile(indexPath); } else { res.send('React App needs to be built. Run "npm run build" first.'); } });
app.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
