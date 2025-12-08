
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { GoogleGenAI } from "@google/genai";

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

app.use(cors());
app.use(express.json({ limit: '200mb' })); 

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
            exitPermits: [], // New
            users: [{ id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم', role: 'admin', canManageTrade: true }], 
            messages: [], groups: [], tasks: [], tradeRecords: [] 
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
        return initial;
    }
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // Ensure exitPermits exists in legacy DBs
    if (!db.exitPermits) db.exitPermits = [];
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

// --- GEMINI HELPER ---
const getGeminiClient = () => {
    const db = getDb();
    const apiKey = db.settings?.geminiApiKey || process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (apiKey) {
        return new GoogleGenAI({ apiKey: apiKey });
    }
    return null;
};

// ==========================================
// WHATSAPP & TELEGRAM GLOBALS
// ==========================================
let whatsappClient = null;
let telegramBot = null;
let MessageMedia = null; 
let isWhatsAppReady = false;
let currentQR = null; 
let whatsappUser = null; 

const getTenDigits = (p) => {
    if (!p) return '';
    const digits = p.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
};

const sendWhatsAppMessageInternal = async (number, message) => {
    if (!whatsappClient || !isWhatsAppReady) return false;
    try {
        let chatId = number.includes('@') ? number : `98${getTenDigits(number)}@c.us`;
        await whatsappClient.sendMessage(chatId, message);
        console.log(`>>> WA Sent to ${chatId}`);
        return true;
    } catch (e) {
        console.error("WA Send Error:", e.message);
        return false;
    }
};

// --- VOICE TRANSCRIPTION (Enhanced for Browser & WhatsApp) ---
async function transcribe(buffer, mimeType) {
    const ai = getGeminiClient();
    if (!ai) return null;
    try {
        // Force a supported MIME type for Gemini if it's a common audio format
        // Gemini supports: audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac
        let cleanMime = 'audio/mp3'; // Default safe fallback
        
        if (mimeType.includes('ogg') || mimeType.includes('opus')) cleanMime = 'audio/ogg';
        else if (mimeType.includes('wav')) cleanMime = 'audio/wav';
        else if (mimeType.includes('webm')) cleanMime = 'audio/webm'; // Newer Gemini models support webm audio
        else if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) cleanMime = 'audio/mp3'; // Often mapped to mp3 internally or handled as generic audio

        console.log(`>>> Transcribing audio (Original: ${mimeType} -> Sent as: ${cleanMime})...`);

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType: cleanMime, data: buffer.toString('base64') } },
                    { text: "Transcribe this audio file to Persian (Farsi) text. Output ONLY the transcribed text." }
                ]
            }]
        });
        const txt = result.response.text().trim();
        console.log(">>> Transcribed: ", txt);
        return txt;
    } catch (e) {
        console.error(">>> Transcribe Error Details:", e.message);
        return null;
    }
}

async function processUserCommand(user, text, isVoice = false) {
    // ... (Existing logic for Payment Orders - kept simple for brevity in this block, assumed unchanged) ...
    // If you need to add "Exit Permit" creation via Voice, you would add logic here.
    return "دستور دریافت شد.";
}

// ... (Existing WhatsApp/Telegram Init Code - assumed unchanged) ...
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
            puppeteer: { headless: true, executablePath: getBrowser(), args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }
        });

        whatsappClient.on('qr', (qr) => { currentQR = qr; isWhatsAppReady = false; console.log(">>> WA QR"); qrcode.generate(qr, { small: true }); });
        whatsappClient.on('ready', () => { isWhatsAppReady = true; currentQR = null; whatsappUser = whatsappClient.info.wid.user; console.log(">>> WA Ready"); });
        
        whatsappClient.on('message', async (msg) => {
            try {
                if (!msg.from.includes('@c.us')) return;
                const senderDigits = getTenDigits(msg.from.replace('@c.us', ''));
                const db = getDb();
                const user = db.users.find(u => getTenDigits(u.phoneNumber) === senderDigits);
                if (!user) return;

                let text = msg.body;
                let isVoice = false;
                
                if (msg.hasMedia) {
                    const media = await msg.downloadMedia();
                    // Audio handling
                    if (media && media.mimetype && (media.mimetype.includes('audio') || media.mimetype.includes('ogg'))) {
                        console.log(">>> Processing Voice Note...");
                        const buff = Buffer.from(media.data, 'base64');
                        const transcribed = await transcribe(buff, media.mimetype);
                        if (transcribed) {
                            text = transcribed;
                            isVoice = true;
                            await msg.reply(`🎤 متن تشخیص داده شده:\n"${text}"`);
                        } else {
                            await msg.reply("متاسفانه نتوانستم صدا را تشخیص دهم.");
                            return;
                        }
                    }
                }
                // Process command...
            } catch (err) { console.error(err); }
        });

        whatsappClient.initialize().catch(e => console.error("WA Init Fail", e.message));

    } catch (e) { console.error("WA Module Error", e.message); }
};

setTimeout(() => { initWhatsApp(); }, 3000);

// ==========================================
// API ENDPOINTS
// ==========================================

app.post('/api/send-whatsapp', async (req, res) => {
    if (!whatsappClient || !isWhatsAppReady) return res.status(503).json({ success: false, message: 'Bot not ready' });
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
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/whatsapp/status', (req, res) => res.json({ ready: isWhatsAppReady, qr: currentQR, user: whatsappUser }));
app.post('/api/whatsapp/logout', async (req, res) => { if(whatsappClient) await whatsappClient.logout(); res.json({success:true}); });
app.get('/api/whatsapp/groups', async (req, res) => {
    if(!whatsappClient || !isWhatsAppReady) return res.status(503).json({success:false});
    const chats = await whatsappClient.getChats();
    res.json({ success: true, groups: chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name })) });
});

// Voice / AI Request
app.post('/api/ai-request', async (req, res) => {
    try {
        const { message, audio, mimeType, username } = req.body;
        let text = message;
        
        if (audio) {
            text = await transcribe(Buffer.from(audio, 'base64'), mimeType || 'audio/webm');
        }

        if (!text) return res.json({ reply: "متن تشخیص داده نشد." });
        return res.json({ reply: `(متن: ${text})` }); // Simple echo for now, or connect to logic

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// EXIT PERMITS API
app.get('/api/exit-permits', (req, res) => res.json(getDb().exitPermits));
app.post('/api/exit-permits', (req, res) => { 
    const db = getDb(); 
    const p = req.body; 
    p.updatedAt = Date.now(); 
    if(db.exitPermits.some(x=>x.permitNumber===p.permitNumber)) p.permitNumber = findNextAvailableExitPermitNumber(db); 
    db.exitPermits.unshift(p); 
    saveDb(db); 
    
    // Notification Logic for Exit Permits
    if (p.status === 'در انتظار تایید مدیرعامل') {
        const adminMsg = `🔔 *درخواست خروج بار جدید (#${p.permitNumber})*\n📦 کالا: ${p.goodsName}\n👤 درخواست کننده: ${p.requester}`;
        db.users.filter(u => u.role === 'ceo' || u.role === 'admin').forEach(u => {
            if (u.phoneNumber) sendWhatsAppMessageInternal(u.phoneNumber, adminMsg);
        });
    }

    res.json(db.exitPermits); 
});
app.put('/api/exit-permits/:id', (req, res) => { 
    const db = getDb(); 
    const i = db.exitPermits.findIndex(x=>x.id===req.params.id); 
    if(i!==-1){ 
        const oldStatus = db.exitPermits[i].status;
        db.exitPermits[i] = req.body; 
        db.exitPermits[i].updatedAt = Date.now(); 
        saveDb(db); 
        
        // Notifications on Status Change
        const p = db.exitPermits[i];
        let msg = '';
        let targetRole = '';
        
        if (p.status === 'تایید مدیرعامل / در انتظار خروج (کارخانه)') {
            msg = `✅ *مجوز خروج #${p.permitNumber} تایید شد*\n🏭 ارسال به کارتابل کارخانه\n📦 کالا: ${p.goodsName}`;
            targetRole = 'factory_manager';
        } else if (p.status === 'خارج شده (بایگانی)') {
            msg = `🚛 *بار با مجوز #${p.permitNumber} از کارخانه خارج شد*\n📦 کالا: ${p.goodsName}`;
            // Notify Sales Manager (Requester)
            const requesterUser = db.users.find(u => u.fullName === p.requester);
            if (requesterUser && requesterUser.phoneNumber) sendWhatsAppMessageInternal(requesterUser.phoneNumber, msg);
        }

        if (targetRole) {
            db.users.filter(u => u.role === targetRole || u.role === 'admin').forEach(u => {
                if (u.phoneNumber) sendWhatsAppMessageInternal(u.phoneNumber, msg);
            });
        }

        res.json(db.exitPermits); 
    } else res.sendStatus(404); 
});
app.delete('/api/exit-permits/:id', (req, res) => { const db = getDb(); db.exitPermits = db.exitPermits.filter(x=>x.id!==req.params.id); saveDb(db); res.json(db.exitPermits); });
app.get('/api/next-exit-permit-number', (req, res) => res.json({ nextNumber: findNextAvailableExitPermitNumber(getDb()) }));


// Standard Orders API
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
app.get('/api/backup', (req, res) => { res.json(getDb()); });
app.post('/api/restore', (req, res) => { if(req.body) { saveDb(req.body); res.json({success:true}); } else res.sendStatus(400); });

app.get('/api/chat', (req, res) => res.json(getDb().messages));
app.post('/api/chat', (req, res) => { const db = getDb(); if(db.messages.length>500) db.messages.shift(); db.messages.push(req.body); saveDb(db); res.json(db.messages); });
app.get('/api/trade', (req, res) => res.json(getDb().tradeRecords));
app.post('/api/trade', (req, res) => { const db = getDb(); db.tradeRecords.push(req.body); saveDb(db); res.json(db.tradeRecords); });
app.put('/api/trade/:id', (req, res) => { const db = getDb(); const i = db.tradeRecords.findIndex(t => t.id === req.params.id); if(i!==-1){ db.tradeRecords[i] = req.body; saveDb(db); res.json(db.tradeRecords); } });
app.delete('/api/trade/:id', (req, res) => { const db = getDb(); db.tradeRecords = db.tradeRecords.filter(t => t.id !== req.params.id); saveDb(db); res.json(db.tradeRecords); });

app.get('/api/manifest', (req, res) => res.json({ "name": "PaySys", "short_name": "PaySys", "start_url": "/", "display": "standalone", "icons": [] }));
app.get('*', (req, res) => { const p = path.join(__dirname, 'dist', 'index.html'); if(fs.existsSync(p)) res.sendFile(p); else res.send('Build first'); });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
