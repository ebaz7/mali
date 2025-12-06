
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// NOTE: Dynamic imports for WhatsApp are handled inside initWhatsApp() to prevent crashes if not installed.

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

// --- WHATSAPP CLIENT SETUP (Dynamic Import) ---
let whatsappClient = null;
let isWhatsAppReady = false;
let currentQR = null; // Store QR to send to frontend
let whatsappUser = null; // Store connected user info

const initWhatsApp = async () => {
    try {
        console.log('Attempting to load WhatsApp modules...');
        const wwebjs = await import('whatsapp-web.js');
        const { Client, LocalAuth } = wwebjs.default || wwebjs;
        const qrcodeModule = await import('qrcode-terminal');
        const qrcode = qrcodeModule.default || qrcodeModule;

        // Function to find Chrome or Edge on Windows
        const getBrowserPath = () => {
            const platform = process.platform;
            let paths = [];

            if (platform === 'win32') {
                paths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
                ];
            } else if (platform === 'linux') {
                paths = [
                    '/usr/bin/google-chrome',
                    '/usr/bin/google-chrome-stable',
                    '/usr/bin/chromium',
                    '/usr/bin/chromium-browser'
                ];
            } else if (platform === 'darwin') {
                paths = [
                    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
                ];
            }

            for (const p of paths) {
                if (fs.existsSync(p)) {
                    return p;
                }
            }
            return null;
        };

        const executablePath = getBrowserPath();
        if (executablePath) {
            console.log(`\n>>> Browser found at: ${executablePath} <<<\n`);
        } else {
            console.warn('\n>>> WARNING: Could not find Chrome/Edge. Puppeteer might fail if bundled Chromium is missing. <<<\n');
        }

        console.log('Initializing WhatsApp Client...');
        whatsappClient = new Client({
            authStrategy: new LocalAuth({ dataPath: WAUTH_DIR }),
            puppeteer: {
                headless: true,
                executablePath: executablePath,
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            }
        });

        whatsappClient.on('qr', (qr) => {
            console.log('\n=============================================================');
            console.log('>>> لطفاً کد QR زیر را با واتساپ گوشی خود اسکن کنید <<<');
            console.log('=============================================================\n');
            currentQR = qr; // Store for frontend
            isWhatsAppReady = false;
            qrcode.generate(qr, { small: true });
        });

        whatsappClient.on('ready', () => {
            console.log('\n>>> WhatsApp Client is READY! <<<\n');
            isWhatsAppReady = true;
            currentQR = null;
            whatsappUser = whatsappClient.info?.wid?.user;
        });

        whatsappClient.on('auth_failure', msg => {
            console.error('WhatsApp Authentication Failure:', msg);
            isWhatsAppReady = false;
        });

        whatsappClient.on('disconnected', (reason) => {
            console.log('WhatsApp Client was disconnected:', reason);
            isWhatsAppReady = false;
            whatsappUser = null;
            // Re-initialize to allow re-scanning
            whatsappClient.initialize();
        });

        // Use catch to prevent server crash if browser fails to launch
        whatsappClient.initialize().catch(err => {
            console.error("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
            console.error("CRITICAL WHATSAPP ERROR: Failed to launch browser.");
            console.error("Message:", err.message);
            console.error("Suggestion: Please install Google Chrome on the server.");
            console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n");
        });

    } catch (e) {
        console.warn('\n********************************************************************************');
        console.warn('هشدار: ماژول واتساپ (whatsapp-web.js) بارگذاری نشد.');
        console.warn('سرور بدون قابلیت ارسال خودکار واتساپ اجرا می‌شود.');
        console.warn('دلیل: ', e.code === 'ERR_MODULE_NOT_FOUND' ? 'پکیج نصب نیست' : e.message);
        console.warn('راه حل: دستور "npm run install-offline" را اجرا کنید.');
        console.warn('********************************************************************************\n');
    }
};

initWhatsApp();

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

// --- API ROUTES ---

// WhatsApp Session Management
app.get('/api/whatsapp/status', (req, res) => {
    res.json({ 
        ready: isWhatsAppReady, 
        qr: currentQR,
        user: whatsappUser
    });
});

app.post('/api/whatsapp/logout', async (req, res) => {
    if (whatsappClient) {
        try {
            await whatsappClient.logout();
            isWhatsAppReady = false;
            whatsappUser = null;
            res.json({ success: true, message: 'Logged out successfully' });
            // Re-init happens automatically on disconnect, or we can force it
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    } else {
        res.status(400).json({ success: false, message: 'Client not initialized' });
    }
});

app.post('/api/send-whatsapp', async (req, res) => {
    if (!whatsappClient || !isWhatsAppReady) {
        return res.status(503).json({ success: false, message: 'ربات واتساپ سرور فعال نیست. لطفا لاگ سرور را بررسی کنید.' });
    }
    
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'Missing number or message' });

    try {
        let chatId;
        // Check if it's a Group ID (usually contains '-')
        if (number.includes('-') || number.includes('@g.us')) {
             chatId = number.endsWith('@g.us') ? number : `${number}@g.us`;
        } else {
            // Normalize Phone Number
            let cleanNumber = number.toString().replace(/\D/g, ''); 
            if (cleanNumber.startsWith('09')) {
                cleanNumber = '98' + cleanNumber.substring(1);
            } else if (cleanNumber.startsWith('9') && cleanNumber.length === 10) {
                cleanNumber = '98' + cleanNumber;
            }
            chatId = `${cleanNumber}@c.us`;
        }
        
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
