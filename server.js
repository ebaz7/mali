
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
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
const BACKUPS_DIR = path.join(__dirname, 'backups');
const WAUTH_DIR = path.join(__dirname, 'wauth');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR);
if (!fs.existsSync(WAUTH_DIR)) fs.mkdirSync(WAUTH_DIR);

// Increase limit for large backups
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
                companyNames: [], companies: [], bankNames: [], rolePermissions: {}, savedContacts: [] 
            }, 
            orders: [], 
            exitPermits: [], 
            warehouseItems: [], 
            warehouseTransactions: [],
            users: [{ id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم', role: 'admin', canManageTrade: true }], 
            messages: [], groups: [], tasks: [], tradeRecords: [] 
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
        return initial;
    }
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.exitPermits) db.exitPermits = [];
    if (!db.warehouseItems) db.warehouseItems = [];
    if (!db.warehouseTransactions) db.warehouseTransactions = [];
    if (!db.settings.currentExitPermitNumber) db.settings.currentExitPermitNumber = 1000;
    return db;
};

const saveDb = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const findNextAvailableTrackingNumber = (db) => {
    const baseNum = (db.settings?.currentTrackingNumber || 1000);
    const startNum = baseNum + 1;
    const existing = db.orders.map(o => o.trackingNumber).sort((a, b) => a - b);
    let next = startNum;
    for (const num of existing) { if (num === next) next++; else if (num > next) return next; }
    return next;
};

const findNextAvailableExitPermitNumber = (db) => {
    const baseNum = (db.settings?.currentExitPermitNumber || 1000);
    const startNum = baseNum + 1;
    const existing = db.exitPermits.map(o => o.permitNumber).sort((a, b) => a - b);
    let next = startNum;
    for (const num of existing) { if (num === next) next++; else if (num > next) return next; }
    return next;
};

// ... (Rest of WhatsApp/Telegram/Backup/Gemini code remains same) ...
// WHATSAPP & TELEGRAM GLOBALS
let whatsappClient = null;
let MessageMedia = null; 
let isWhatsAppReady = false;
let currentQR = null; 
let whatsappUser = null; 
let telegramBotInstance = null;

const initTelegramBot = () => {
    const db = getDb();
    const token = db.settings?.telegramBotToken;
    if (token && !telegramBotInstance) {
        telegramBotInstance = new TelegramBot(token, { polling: false });
        console.log(">>> Telegram Bot Initialized for Backups");
    }
    return telegramBotInstance;
};

const performFullBackup = async (isAuto = false, includeFiles = true) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const type = includeFiles ? 'full' : 'db-only';
    const backupFileName = `backup-${type}-${timestamp}.zip`;
    const backupPath = path.join(BACKUPS_DIR, backupFileName);
    
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', async () => {
            console.log(`>>> Backup created: ${backupFileName} (${archive.pointer()} bytes)`);
            if (isAuto) {
                const db = getDb();
                const bot = initTelegramBot();
                const chatId = db.settings?.telegramAdminId;
                if (bot && chatId) {
                    try {
                        await bot.sendDocument(chatId, fs.createReadStream(backupPath), {
                            caption: `📦 #بک_آپ_خودکار\n📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}\n⏰ ساعت: ${new Date().toLocaleTimeString('fa-IR')}`
                        });
                        console.log(">>> Backup sent to Telegram");
                    } catch (err) { console.error("!!! Failed to send backup to Telegram:", err.message); }
                }
            }
            resolve(backupPath);
        });
        archive.on('error', (err) => reject(err));
        archive.pipe(output);
        if (fs.existsSync(DB_FILE)) archive.file(DB_FILE, { name: 'database.json' });
        if (includeFiles && fs.existsSync(UPLOADS_DIR)) archive.directory(UPLOADS_DIR, 'uploads');
        archive.finalize();
    });
};

cron.schedule('30 23 * * *', async () => { console.log(">>> Starting Scheduled Full Backup..."); try { await performFullBackup(true, true); } catch (e) { console.error("!!! Backup Failed:", e); } });

const getTenDigits = (p) => { if (!p) return ''; const digits = p.replace(/\D/g, ''); return digits.length >= 10 ? digits.slice(-10) : digits; };
const initWhatsApp = async () => {
    try {
        const wwebjs = await import('whatsapp-web.js');
        const { Client, LocalAuth, MessageMedia: MM } = wwebjs.default || wwebjs;
        MessageMedia = MM; 
        const qrcode = (await import('qrcode-terminal')).default;
        const getBrowser = () => { if (process.platform === 'win32') { const paths = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']; for (const p of paths) if (fs.existsSync(p)) return p; } return null; };
        whatsappClient = new Client({ authStrategy: new LocalAuth({ dataPath: WAUTH_DIR }), puppeteer: { headless: true, executablePath: getBrowser(), args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] } });
        whatsappClient.on('qr', (qr) => { currentQR = qr; isWhatsAppReady = false; console.log(">>> WA QR"); qrcode.generate(qr, { small: true }); });
        whatsappClient.on('ready', () => { isWhatsAppReady = true; currentQR = null; whatsappUser = whatsappClient.info.wid.user; console.log(">>> WA Ready"); });
        whatsappClient.initialize().catch(e => console.error("WA Init Fail", e.message));
    } catch (e) { console.error("WA Module Error", e.message); }
};
setTimeout(() => { initWhatsApp(); }, 3000);

app.post('/api/send-whatsapp', async (req, res) => { if (!whatsappClient || !isWhatsAppReady) return res.status(503).json({ success: false, message: 'Bot not ready' }); const { number, message, mediaData } = req.body; try { let chatId = number.includes('@') ? number : `98${getTenDigits(number)}@c.us`; if (mediaData && mediaData.data) { const media = new MessageMedia(mediaData.mimeType, mediaData.data, mediaData.filename); await whatsappClient.sendMessage(chatId, media, { caption: message || '' }); } else if (message) { await whatsappClient.sendMessage(chatId, message); } res.json({ success: true }); } catch (e) { res.status(500).json({ success: false, message: e.message }); } });
app.get('/api/whatsapp/status', (req, res) => res.json({ ready: isWhatsAppReady, qr: currentQR, user: whatsappUser }));
app.post('/api/whatsapp/logout', async (req, res) => { if(whatsappClient) await whatsappClient.logout(); res.json({success:true}); });
app.get('/api/whatsapp/groups', async (req, res) => { if(!whatsappClient || !isWhatsAppReady) return res.status(503).json({success:false}); const chats = await whatsappClient.getChats(); res.json({ success: true, groups: chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name })) }); });
app.post('/api/ai-request', async (req, res) => { try { const { message } = req.body; res.json({ reply: `(AI Mock): ${message}` }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/full-backup', async (req, res) => { try { const includeFiles = req.query.includeFiles !== 'false'; const backupPath = await performFullBackup(false, includeFiles); res.download(backupPath); } catch (e) { res.status(500).send('Backup creation failed: ' + e.message); } });
app.post('/api/full-restore', (req, res) => { try { const { fileData } = req.body; if (!fileData) return res.status(400).send('No file data'); const buffer = Buffer.from(fileData.split(',')[1], 'base64'); const zip = new AdmZip(buffer); const dbEntry = zip.getEntry("database.json"); if (dbEntry) { fs.writeFileSync(DB_FILE, dbEntry.getData()); } const uploadEntries = zip.getEntries().filter(entry => entry.entryName.startsWith('uploads/') && !entry.isDirectory); uploadEntries.forEach(entry => { const fileName = path.basename(entry.entryName); const targetPath = path.join(UPLOADS_DIR, fileName); fs.writeFileSync(targetPath, entry.getData()); }); res.json({ success: true, message: 'Restore completed' }); } catch (e) { console.error("Restore Error:", e); res.status(500).json({ success: false, message: 'Restore failed: ' + e.message }); } });

// --- ROUTES ---
app.get('/api/exit-permits', (req, res) => res.json(getDb().exitPermits));
app.post('/api/exit-permits', (req, res) => { const db = getDb(); const p = req.body; p.updatedAt = Date.now(); if(db.exitPermits.some(x=>x.permitNumber===p.permitNumber)) p.permitNumber = findNextAvailableExitPermitNumber(db); db.exitPermits.unshift(p); saveDb(db); res.json(db.exitPermits); });
app.put('/api/exit-permits/:id', (req, res) => { const db = getDb(); const i = db.exitPermits.findIndex(x=>x.id===req.params.id); if(i!==-1){ db.exitPermits[i] = req.body; db.exitPermits[i].updatedAt = Date.now(); saveDb(db); res.json(db.exitPermits); } else res.sendStatus(404); });
app.delete('/api/exit-permits/:id', (req, res) => { const db = getDb(); db.exitPermits = db.exitPermits.filter(x=>x.id!==req.params.id); saveDb(db); res.json(db.exitPermits); });
app.get('/api/next-exit-permit-number', (req, res) => res.json({ nextNumber: findNextAvailableExitPermitNumber(getDb()) }));
app.get('/api/orders', (req, res) => res.json(getDb().orders));
app.post('/api/orders', (req, res) => { const db = getDb(); const o = req.body; o.updatedAt = Date.now(); if(db.orders.some(x=>x.trackingNumber===o.trackingNumber)) o.trackingNumber = findNextAvailableTrackingNumber(db); db.orders.unshift(o); saveDb(db); res.json(db.orders); });
app.put('/api/orders/:id', (req, res) => { const db = getDb(); const i = db.orders.findIndex(x=>x.id===req.params.id); if(i!==-1){ db.orders[i] = req.body; db.orders[i].updatedAt = Date.now(); saveDb(db); res.json(db.orders); } else res.sendStatus(404); });
app.delete('/api/orders/:id', (req, res) => { const db = getDb(); db.orders = db.orders.filter(x=>x.id!==req.params.id); saveDb(db); res.json(db.orders); });
app.get('/api/next-tracking-number', (req, res) => res.json({ nextTrackingNumber: findNextAvailableTrackingNumber(getDb()) }));
app.post('/api/upload', (req, res) => { try { const { fileName, fileData } = req.body; const b = Buffer.from(fileData.split(',')[1], 'base64'); const n = Date.now() + '_' + fileName; fs.writeFileSync(path.join(UPLOADS_DIR, n), b); res.json({ url: `/uploads/${n}`, fileName: n }); } catch (e) { res.status(500).send('Err'); } });
app.post('/api/login', (req, res) => { const { username, password } = req.body; const user = getDb().users.find(u => u.username === username && u.password === password); if (user) res.json(user); else res.status(401).json({ message: 'Invalid' }); });
app.get('/api/users', (req, res) => res.json(getDb().users));
app.post('/api/users', (req, res) => { const db = getDb(); db.users.push(req.body); saveDb(db); res.json(db.users); });
app.put('/api/users/:id', (req, res) => { const db = getDb(); const i = db.users.findIndex(u => u.id === req.params.id); if(i!==-1) { db.users[i] = { ...db.users[i], ...req.body }; saveDb(db); res.json(db.users); } });
app.delete('/api/users/:id', (req, res) => { const db = getDb(); db.users = db.users.filter(u => u.id !== req.params.id); saveDb(db); res.json(db.users); });
app.get('/api/settings', (req, res) => res.json(getDb().settings));
app.post('/api/settings', (req, res) => { const db = getDb(); db.settings = req.body; saveDb(db); res.json(db.settings); });
app.get('/api/chat', (req, res) => res.json(getDb().messages));
app.post('/api/chat', (req, res) => { const db = getDb(); if(db.messages.length>500) db.messages.shift(); db.messages.push(req.body); saveDb(db); res.json(db.messages); });
app.get('/api/trade', (req, res) => res.json(getDb().tradeRecords));
app.post('/api/trade', (req, res) => { const db = getDb(); db.tradeRecords.push(req.body); saveDb(db); res.json(db.tradeRecords); });
app.put('/api/trade/:id', (req, res) => { const db = getDb(); const i = db.tradeRecords.findIndex(t => t.id === req.params.id); if(i!==-1){ db.tradeRecords[i] = req.body; saveDb(db); res.json(db.tradeRecords); } });
app.delete('/api/trade/:id', (req, res) => { const db = getDb(); db.tradeRecords = db.tradeRecords.filter(t => t.id !== req.params.id); saveDb(db); res.json(db.tradeRecords); });

// --- WAREHOUSE ROUTES (ADDED) ---
app.get('/api/warehouse/items', (req, res) => res.json(getDb().warehouseItems));
app.post('/api/warehouse/items', (req, res) => { const db = getDb(); db.warehouseItems.push(req.body); saveDb(db); res.json(db.warehouseItems); });
app.delete('/api/warehouse/items/:id', (req, res) => { const db = getDb(); db.warehouseItems = db.warehouseItems.filter(i => i.id !== req.params.id); saveDb(db); res.json(db.warehouseItems); });

app.get('/api/warehouse/transactions', (req, res) => res.json(getDb().warehouseTransactions));
app.post('/api/warehouse/transactions', (req, res) => { const db = getDb(); db.warehouseTransactions.unshift(req.body); saveDb(db); res.json(db.warehouseTransactions); });
app.delete('/api/warehouse/transactions/:id', (req, res) => { const db = getDb(); db.warehouseTransactions = db.warehouseTransactions.filter(t => t.id !== req.params.id); saveDb(db); res.json(db.warehouseTransactions); });

app.get('/api/manifest', (req, res) => res.json({ "name": "PaySys", "short_name": "PaySys", "start_url": "/", "display": "standalone", "icons": [] }));
app.get('*', (req, res) => { const p = path.join(__dirname, 'dist', 'index.html'); if(fs.existsSync(p)) res.sendFile(p); else res.send('Build first'); });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
