
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import TelegramBot from 'node-telegram-bot-api';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AI_UPLOADS_DIR = path.join(__dirname, 'uploads', 'ai');
const BACKUPS_DIR = path.join(__dirname, 'backups');
const WAUTH_DIR = path.join(__dirname, 'wauth');

// Ensure directories exist
[UPLOADS_DIR, AI_UPLOADS_DIR, BACKUPS_DIR, WAUTH_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: '500mb' })); 
app.use(express.urlencoded({ limit: '500mb', extended: true }));

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

// --- DATABASE HELPER ---
const getDb = () => {
    if (!fs.existsSync(DB_FILE)) {
        const initial = { 
            settings: { 
                currentTrackingNumber: 1000, 
                currentExitPermitNumber: 1000,
                companyNames: [], companies: [], bankNames: [], rolePermissions: {}, savedContacts: [], warehouseSequences: {}
            }, 
            orders: [], exitPermits: [], warehouseItems: [], warehouseTransactions: [],
            users: [{ id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم', role: 'admin', canManageTrade: true }], 
            messages: [], groups: [], tasks: [], tradeRecords: [] 
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
        return initial;
    }
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Ensure arrays exist
    ['exitPermits', 'warehouseItems', 'warehouseTransactions', 'orders', 'users', 'messages', 'groups', 'tradeRecords'].forEach(k => {
        if (!db[k]) db[k] = [];
    });
    if (!db.settings.warehouseSequences) db.settings.warehouseSequences = {};
    return db;
};

const saveDb = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const findNextAvailableNumber = (arr, key, base) => {
    const startNum = base + 1;
    const existing = arr.map(o => o[key]).sort((a, b) => a - b);
    let next = startNum;
    for (const num of existing) { if (num === next) next++; else if (num > next) return next; }
    return next;
};

// --- STARTUP CHECKS ---
const db = getDb();
if (db.settings?.geminiApiKey) {
    console.log(">>> Gemini AI: API Key detected. Ready.");
} else {
    console.log(">>> Gemini AI: No API Key found. AI features will be offline.");
}

// --- GLOBAL BOTS ---
let whatsappClient = null;
let MessageMedia = null; 
let isWhatsAppReady = false;
let currentQR = null; 
let whatsappUser = null; 
let telegramBotInstance = null;

// --- TELEGRAM INIT ---
const initTelegramBot = () => {
    try {
        const db = getDb();
        const token = db.settings?.telegramBotToken;
        if (token && !telegramBotInstance) {
            telegramBotInstance = new TelegramBot(token, { polling: false }); 
            console.log(">>> Telegram Bot Initialized ✅");
        }
    } catch (e) {
        console.error("Telegram Init Error:", e.message);
    }
};
initTelegramBot();

// --- WHATSAPP INIT ---
const initWhatsApp = async () => {
    try {
        const wwebjs = await import('whatsapp-web.js');
        const { Client, LocalAuth, MessageMedia: MM } = wwebjs.default || wwebjs;
        MessageMedia = MM; 
        const qrcode = (await import('qrcode-terminal')).default;
        
        const getBrowser = () => { 
            if (process.platform === 'win32') { 
                const paths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 
                    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
                ]; 
                for (const p of paths) if (fs.existsSync(p)) return p; 
            } 
            return null; 
        };

        whatsappClient = new Client({ 
            authStrategy: new LocalAuth({ dataPath: WAUTH_DIR }), 
            puppeteer: { 
                headless: true, 
                executablePath: getBrowser(), 
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
            } 
        });

        whatsappClient.on('qr', (qr) => { 
            currentQR = qr; 
            isWhatsAppReady = false; 
            console.log(">>> WhatsApp QR Generated 📷"); 
            qrcode.generate(qr, { small: true }); 
        });

        whatsappClient.on('ready', () => { 
            isWhatsAppReady = true; 
            currentQR = null; 
            whatsappUser = whatsappClient.info.wid.user; 
            console.log(">>> WhatsApp Client Ready! ✅"); 
        });

        whatsappClient.on('disconnected', (reason) => {
            console.log('>>> WhatsApp Disconnected:', reason);
            isWhatsAppReady = false;
            setTimeout(() => { if(whatsappClient) whatsappClient.initialize(); }, 5000);
        });

        whatsappClient.initialize().catch(e => console.error("WA Init Fail", e.message));
    } catch (e) { 
        console.error("WA Module Error", e.message); 
    }
};
setTimeout(() => { initWhatsApp(); }, 3000);

const getTenDigits = (p) => { if (!p) return ''; const digits = p.replace(/\D/g, ''); return digits.length >= 10 ? digits.slice(-10) : digits; };

// --- ROUTES ---

// 1. WhatsApp Routes
app.post('/api/send-whatsapp', async (req, res) => { 
    if (!whatsappClient || !isWhatsAppReady) return res.status(503).json({ success: false, message: 'WhatsApp not ready' });
    const { number, message, mediaData } = req.body; 
    try { 
        let chatId = number.includes('@') ? number : `98${getTenDigits(number)}@c.us`; 
        if (mediaData && mediaData.data) { 
            const media = new MessageMedia(mediaData.mimeType, mediaData.data, mediaData.filename); 
            await whatsappClient.sendMessage(chatId, media, { caption: message || '' }); 
        } else if (message) { 
            await whatsappClient.sendMessage(chatId, message); 
        } 
        res.json({ success: true }); 
    } catch (e) { 
        console.error("WA Send Error:", e);
        res.status(500).json({ success: false, message: e.message }); 
    } 
});
app.get('/api/whatsapp/status', (req, res) => res.json({ ready: isWhatsAppReady, qr: currentQR, user: whatsappUser }));
app.post('/api/whatsapp/logout', async (req, res) => { if(whatsappClient) await whatsappClient.logout(); res.json({success:true}); });
app.get('/api/whatsapp/groups', async (req, res) => { if(!whatsappClient || !isWhatsAppReady) return res.status(503).json({success:false}); const chats = await whatsappClient.getChats(); res.json({ success: true, groups: chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name })) }); });

// 2. AI (Gemini) Route - CORRECTED FOR @google/genai
app.post('/api/ai-request', async (req, res) => { 
    try { 
        const { message, audio, mimeType, username } = req.body;
        const db = getDb();
        const apiKey = db.settings?.geminiApiKey;

        if (!apiKey) {
            return res.json({ reply: "تنظیمات هوش مصنوعی انجام نشده است. (کد 01: کلید یافت نشد)" });
        }

        const ai = new GoogleGenAI({ apiKey });
        
        // Prepare content parts
        let parts = [];
        if (audio) {
            // Save file
            const buffer = Buffer.from(audio, 'base64');
            const ext = mimeType?.includes('mp4') ? 'm4a' : 'webm';
            const filename = `ai_voice_${Date.now()}_${username}.${ext}`;
            const filepath = path.join(AI_UPLOADS_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            
            parts.push({
                inlineData: {
                    mimeType: mimeType || 'audio/webm',
                    data: audio
                }
            });
            parts.push({ text: "Please listen to this audio instruction in Persian. If it's a command to register a payment, extract amount, payee, and reason. If it's a chat, reply in Persian." });
        } else {
            parts.push({ text: message || "Hello" });
        }

        // Call Gemini using new SDK method
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts }]
        });

        // Correct way to get text
        const responseText = response.text;
        res.json({ reply: responseText }); 

    } catch (e) { 
        console.error("AI Error:", e);
        res.status(500).json({ error: "AI Service Error: " + e.message }); 
    } 
});

// 3. Backup/Restore
const performFullBackup = async (isAuto = false, includeFiles = true) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const type = includeFiles ? 'full' : 'db-only';
    const backupFileName = `backup-${type}-${timestamp}.zip`;
    const backupPath = path.join(BACKUPS_DIR, backupFileName);
    
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', async () => {
            console.log(`>>> Backup created: ${backupFileName}`);
            if (isAuto && telegramBotInstance) {
                const db = getDb();
                const chatId = db.settings?.telegramAdminId;
                if (chatId) {
                    try {
                        await telegramBotInstance.sendDocument(chatId, fs.createReadStream(backupPath), {
                            caption: `📦 #بک_آپ_خودکار\n📅 ${new Date().toLocaleDateString('fa-IR')}`
                        });
                    } catch (err) { console.error("Telegram Send Error:", err.message); }
                }
            }
            resolve(backupPath);
        });
        archive.on('error', reject);
        archive.pipe(output);
        if (fs.existsSync(DB_FILE)) archive.file(DB_FILE, { name: 'database.json' });
        if (includeFiles && fs.existsSync(UPLOADS_DIR)) archive.directory(UPLOADS_DIR, 'uploads');
        archive.finalize();
    });
};

cron.schedule('30 23 * * *', async () => { try { await performFullBackup(true, true); } catch (e) { console.error("Backup Failed:", e); } });

app.get('/api/full-backup', async (req, res) => { try { const backupPath = await performFullBackup(false, req.query.includeFiles !== 'false'); res.download(backupPath); } catch (e) { res.status(500).send(e.message); } });
app.post('/api/full-restore', (req, res) => { try { const { fileData } = req.body; if (!fileData) return res.status(400).send('No data'); const buffer = Buffer.from(fileData.split(',')[1], 'base64'); const zip = new AdmZip(buffer); const dbEntry = zip.getEntry("database.json"); if (dbEntry) fs.writeFileSync(DB_FILE, dbEntry.getData()); const entries = zip.getEntries().filter(e => e.entryName.startsWith('uploads/') && !e.isDirectory); entries.forEach(e => fs.writeFileSync(path.join(UPLOADS_DIR, path.basename(e.entryName)), e.getData())); res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); } });

// 4. Data API Routes
const handleList = (key) => (req, res) => res.json(getDb()[key]);
const handleAdd = (key, idField, numField, nextNumFn) => (req, res) => { 
    const db = getDb(); 
    const item = req.body; 
    item[idField] = item[idField] || Date.now().toString();
    item.updatedAt = Date.now();
    if (numField && (!item[numField] || item[numField] === 0)) {
        item[numField] = nextNumFn(db);
    }
    if(key === 'warehouseTransactions' || key === 'orders') db[key].unshift(item); else db[key].push(item);
    saveDb(db); 
    res.json(db[key]); 
};
const handleUpdate = (key) => (req, res) => { 
    const db = getDb(); 
    const idx = db[key].findIndex(x => x.id === req.params.id); 
    if(idx !== -1) { db[key][idx] = { ...db[key][idx], ...req.body, updatedAt: Date.now() }; saveDb(db); res.json(db[key]); } 
    else res.sendStatus(404); 
};
const handleDelete = (key) => (req, res) => { const db = getDb(); db[key] = db[key].filter(x => x.id !== req.params.id); saveDb(db); res.json(db[key]); };

// Routes
app.get('/api/orders', handleList('orders'));
app.post('/api/orders', handleAdd('orders', 'id', 'trackingNumber', (db) => findNextAvailableNumber(db.orders, 'trackingNumber', db.settings.currentTrackingNumber || 1000)));
app.put('/api/orders/:id', handleUpdate('orders'));
app.delete('/api/orders/:id', handleDelete('orders'));
app.get('/api/next-tracking-number', (req, res) => res.json({ nextTrackingNumber: findNextAvailableNumber(getDb().orders, 'trackingNumber', getDb().settings.currentTrackingNumber || 1000) }));

app.get('/api/exit-permits', handleList('exitPermits'));
app.post('/api/exit-permits', handleAdd('exitPermits', 'id', 'permitNumber', (db) => findNextAvailableNumber(db.exitPermits, 'permitNumber', db.settings.currentExitPermitNumber || 1000)));
app.put('/api/exit-permits/:id', handleUpdate('exitPermits'));
app.delete('/api/exit-permits/:id', handleDelete('exitPermits'));
app.get('/api/next-exit-permit-number', (req, res) => res.json({ nextNumber: findNextAvailableNumber(getDb().exitPermits, 'permitNumber', getDb().settings.currentExitPermitNumber || 1000) }));

app.get('/api/warehouse/items', handleList('warehouseItems'));
app.post('/api/warehouse/items', handleAdd('warehouseItems', 'id', null, null));
app.delete('/api/warehouse/items/:id', handleDelete('warehouseItems'));
app.get('/api/warehouse/transactions', handleList('warehouseTransactions'));
app.post('/api/warehouse/transactions', (req, res) => {
    const db = getDb();
    const tx = req.body;
    tx.updatedAt = Date.now();
    if (tx.type === 'OUT') {
        const currentSeq = db.settings.warehouseSequences?.[tx.company] || 1000;
        const nextSeq = currentSeq + 1;
        db.settings.warehouseSequences[tx.company] = nextSeq;
        tx.number = nextSeq;
    }
    db.warehouseTransactions.unshift(tx);
    saveDb(db);
    res.json(db.warehouseTransactions);
});
app.delete('/api/warehouse/transactions/:id', handleDelete('warehouseTransactions'));

app.get('/api/users', handleList('users'));
app.post('/api/users', handleAdd('users', 'id', null, null));
app.put('/api/users/:id', handleUpdate('users'));
app.delete('/api/users/:id', handleDelete('users'));
app.post('/api/login', (req, res) => { const u = getDb().users.find(x => x.username === req.body.username && x.password === req.body.password); u ? res.json(u) : res.status(401).send('Invalid'); });

app.get('/api/settings', (req, res) => res.json(getDb().settings));
app.post('/api/settings', (req, res) => { const db = getDb(); db.settings = req.body; saveDb(db); if (req.body.telegramBotToken) initTelegramBot(); res.json(db.settings); });

app.get('/api/chat', handleList('messages'));
app.post('/api/chat', handleAdd('messages', 'id', null, null));
app.put('/api/chat/:id', handleUpdate('messages'));
app.delete('/api/chat/:id', handleDelete('messages'));
app.get('/api/trade', handleList('tradeRecords'));
app.post('/api/trade', handleAdd('tradeRecords', 'id', null, null));
app.put('/api/trade/:id', handleUpdate('tradeRecords'));
app.delete('/api/trade/:id', handleDelete('tradeRecords'));

app.get('/api/groups', handleList('groups'));
app.post('/api/groups', handleAdd('groups', 'id', null, null));
app.put('/api/groups/:id', handleUpdate('groups'));
app.delete('/api/groups/:id', handleDelete('groups'));
app.get('/api/tasks', handleList('tasks'));
app.post('/api/tasks', handleAdd('tasks', 'id', null, null));
app.put('/api/tasks/:id', handleUpdate('tasks'));
app.delete('/api/tasks/:id', handleDelete('tasks'));

app.post('/api/upload', (req, res) => { 
    try { 
        const { fileName, fileData } = req.body; 
        const n = Date.now() + '_' + fileName; 
        fs.writeFileSync(path.join(UPLOADS_DIR, n), Buffer.from(fileData.split(',')[1], 'base64')); 
        res.json({ url: `/uploads/${n}`, fileName: n }); 
    } catch (e) { res.status(500).send('Err'); } 
});

app.get('/api/manifest', (req, res) => res.json({ "name": "PaySys", "short_name": "PaySys", "start_url": "/", "display": "standalone", "icons": [] }));
app.get('*', (req, res) => { const p = path.join(__dirname, 'dist', 'index.html'); if(fs.existsSync(p)) res.sendFile(p); else res.send('Build first'); });

app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
