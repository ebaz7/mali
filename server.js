
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import cron from 'node-cron';

// --- IMPORT DEDICATED MODULES ---
import { initTelegram, sendDocument as sendTelegramDoc, sendMessage as sendTelegramMsg } from './backend/telegram.js';
import { initWhatsApp, sendMessage as sendWhatsAppMessage, getStatus as getWhatsAppStatus, logout as logoutWhatsApp, getGroups as getWhatsAppGroups } from './backend/whatsapp.js';

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
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
};

const saveDb = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

const findNextAvailableNumber = (arr, key, base) => {
    const startNum = base + 1;
    const existing = arr.map(o => o[key]).sort((a, b) => a - b);
    let next = startNum;
    for (const num of existing) { if (num === next) next++; else if (num > next) return next; }
    return next;
};

// --- INITIALIZE BOTS ---
const db = getDb();

// 1. Telegram
if (db.settings?.telegramBotToken) {
    initTelegram(db.settings.telegramBotToken);
}

// 2. WhatsApp
setTimeout(() => {
    initWhatsApp(WAUTH_DIR);
}, 3000);


// --- SMART NOTIFICATION LOGIC ---

// Find a user phone by role
const findUserPhoneByRole = (db, role) => {
    const user = db.users.find(u => u.role === role && u.phoneNumber);
    return user ? user.phoneNumber : null;
};

// Find user phone by name
const findUserPhoneByName = (db, fullName) => {
    const user = db.users.find(u => u.fullName === fullName && u.phoneNumber);
    return user ? user.phoneNumber : null;
};

const sendSmartNotification = async (targetNumber, message) => {
    if (!targetNumber) {
        console.log(">>> Notification Skipped: No target number provided.");
        return;
    }
    try {
        console.log(`>>> Sending Smart Notification to ${targetNumber}`);
        await sendWhatsAppMessage(targetNumber, message);
    } catch (e) {
        console.error(">>> Notification Failed:", e.message);
    }
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fa-IR').format(amount) + ' ریال';
};

// --- ROUTES ---

// 1. Order Routes
app.get('/api/orders', (req, res) => res.json(getDb().orders));
app.post('/api/orders', (req, res) => {
    const db = getDb();
    const item = req.body;
    item.id = item.id || Date.now().toString();
    item.updatedAt = Date.now();
    
    // Auto Numbering
    const nextNum = findNextAvailableNumber(db.orders, 'trackingNumber', db.settings.currentTrackingNumber || 1000);
    item.trackingNumber = nextNum;
    
    db.orders.unshift(item);
    saveDb(db);

    // Notify Financial Manager (New Request)
    const finPhone = findUserPhoneByRole(db, 'financial');
    if (finPhone) {
        const msg = `📢 *درخواست پرداخت جدید*\nشماره: ${item.trackingNumber}\nمبلغ: ${formatCurrency(item.totalAmount)}\nدرخواست کننده: ${item.requester}\n\nلطفا جهت بررسی به سیستم مراجعه کنید.`;
        sendSmartNotification(finPhone, msg);
    }

    res.json(db.orders);
});

app.put('/api/orders/:id', async (req, res) => {
    const db = getDb();
    const idx = db.orders.findIndex(x => x.id === req.params.id);
    if(idx !== -1) {
        const oldStatus = db.orders[idx].status;
        db.orders[idx] = { ...db.orders[idx], ...req.body, updatedAt: Date.now() };
        saveDb(db);
        
        const newOrder = db.orders[idx];
        const newStatus = newOrder.status;

        // --- SMART NOTIFICATION LOGIC FOR ORDERS ---
        if (oldStatus !== newStatus) {
            try {
                let targetPhone = null;
                let msg = '';

                // 1. Financial Approved -> Notify Manager
                if (newStatus === 'تایید مالی / در انتظار مدیریت') {
                    targetPhone = findUserPhoneByRole(db, 'manager'); 
                    msg = `✅ *تایید مالی انجام شد*\nدستور پرداخت: ${newOrder.trackingNumber}\nمبلغ: ${formatCurrency(newOrder.totalAmount)}\n\nمنتظر تایید مدیریت.`;
                }
                // 2. Manager Approved -> Notify CEO
                else if (newStatus === 'تایید مدیریت / در انتظار مدیرعامل') {
                    targetPhone = findUserPhoneByRole(db, 'ceo') || db.settings?.defaultSalesManager; 
                    msg = `✅ *تایید مدیریت انجام شد*\nدستور پرداخت: ${newOrder.trackingNumber}\nمبلغ: ${formatCurrency(newOrder.totalAmount)}\nذی‌نفع: ${newOrder.payee}\n\nمنتظر تایید نهایی مدیرعامل.`;
                }
                // 3. CEO Approved -> Notify Requester & Finance
                else if (newStatus === 'تایید نهایی') {
                    // Notify Requester
                    const reqPhone = findUserPhoneByName(db, newOrder.requester);
                    if (reqPhone) {
                        sendSmartNotification(reqPhone, `🎉 *درخواست شما تایید نهایی شد*\nشماره: ${newOrder.trackingNumber}\nمبلغ: ${formatCurrency(newOrder.totalAmount)}`);
                    }
                    // Notify Finance to pay
                    targetPhone = findUserPhoneByRole(db, 'financial');
                    msg = `💰 *دستور پرداخت تایید نهایی شد*\nشماره: ${newOrder.trackingNumber}\nمبلغ: ${formatCurrency(newOrder.totalAmount)}\n\nلطفا نسبت به پرداخت اقدام نمایید.`;
                }
                // 4. Rejected -> Notify Requester
                else if (newStatus === 'رد شده') {
                    targetPhone = findUserPhoneByName(db, newOrder.requester);
                    msg = `⛔ *درخواست پرداخت رد شد*\nشماره: ${newOrder.trackingNumber}\nدلیل: ${newOrder.rejectionReason || 'نامشخص'}`;
                }

                if (targetPhone) {
                    await sendSmartNotification(targetPhone, msg);
                }
            } catch (e) {
                console.error("Auto Notification Error:", e);
            }
        }

        res.json(db.orders);
    } else {
        res.sendStatus(404);
    }
});
app.delete('/api/orders/:id', (req, res) => { const db = getDb(); db.orders = db.orders.filter(x => x.id !== req.params.id); saveDb(db); res.json(db.orders); });
app.get('/api/next-tracking-number', (req, res) => res.json({ nextTrackingNumber: findNextAvailableNumber(getDb().orders, 'trackingNumber', getDb().settings.currentTrackingNumber || 1000) }));


// 2. Exit Permit Routes
app.get('/api/exit-permits', (req, res) => res.json(getDb().exitPermits));
app.post('/api/exit-permits', (req, res) => {
    const db = getDb();
    const item = req.body;
    item.id = item.id || Date.now().toString();
    item.updatedAt = Date.now();
    
    const nextNum = findNextAvailableNumber(db.exitPermits, 'permitNumber', db.settings.currentExitPermitNumber || 1000);
    item.permitNumber = nextNum;
    
    db.exitPermits.push(item);
    saveDb(db);

    // Notify CEO (New Exit Request)
    const ceoPhone = findUserPhoneByRole(db, 'ceo');
    if (ceoPhone) {
        const msg = `🚛 *درخواست خروج بار جدید*\nشماره: ${item.permitNumber}\nمقصد: ${item.recipientName || 'چند مقصد'}\n\nمنتظر تایید شما.`;
        sendSmartNotification(ceoPhone, msg);
    }

    res.json(db.exitPermits);
});

app.put('/api/exit-permits/:id', async (req, res) => {
    const db = getDb();
    const idx = db.exitPermits.findIndex(x => x.id === req.params.id);
    if(idx !== -1) {
        const oldStatus = db.exitPermits[idx].status;
        db.exitPermits[idx] = { ...db.exitPermits[idx], ...req.body, updatedAt: Date.now() };
        saveDb(db);

        const newPermit = db.exitPermits[idx];
        const newStatus = newPermit.status;

        // --- SMART NOTIFICATION FOR EXIT PERMITS ---
        if (oldStatus !== newStatus) {
            let targetPhone = null;
            let msg = '';

            // CEO Approved -> Notify Factory Manager
            if (newStatus === 'تایید مدیرعامل / در انتظار خروج (کارخانه)') {
                targetPhone = findUserPhoneByRole(db, 'factory_manager');
                msg = `🏭 *مجوز خروج تایید شد*\nشماره: ${newPermit.permitNumber}\nراننده: ${newPermit.driverName || '-'}\nپلاک: ${newPermit.plateNumber || '-'}\n\nمجاز به خروج از درب کارخانه.`;
            }
            // Exited -> Notify Sales Manager / Requester
            else if (newStatus === 'خارج شده (بایگانی)') {
                targetPhone = findUserPhoneByName(db, newPermit.requester);
                msg = `✅ *بار خارج شد*\nمجوز شماره: ${newPermit.permitNumber}\nوضعیت: خروج از کارخانه ثبت شد.`;
            }

            if (targetPhone) {
                sendSmartNotification(targetPhone, msg);
            }
        }

        res.json(db.exitPermits);
    } else res.sendStatus(404);
});
app.delete('/api/exit-permits/:id', (req, res) => { const db = getDb(); db.exitPermits = db.exitPermits.filter(x => x.id !== req.params.id); saveDb(db); res.json(db.exitPermits); });
app.get('/api/next-exit-permit-number', (req, res) => res.json({ nextNumber: findNextAvailableNumber(getDb().exitPermits, 'permitNumber', getDb().settings.currentExitPermitNumber || 1000) }));


// 3. Warehouse Routes
app.get('/api/warehouse/items', (req, res) => res.json(getDb().warehouseItems));
app.post('/api/warehouse/items', (req, res) => { const db = getDb(); const item = req.body; item.id = item.id || Date.now().toString(); db.warehouseItems.push(item); saveDb(db); res.json(db.warehouseItems); });
app.delete('/api/warehouse/items/:id', (req, res) => { const db = getDb(); db.warehouseItems = db.warehouseItems.filter(x => x.id !== req.params.id); saveDb(db); res.json(db.warehouseItems); });

app.get('/api/warehouse/transactions', (req, res) => res.json(getDb().warehouseTransactions));
app.post('/api/warehouse/transactions', async (req, res) => {
    const db = getDb();
    const tx = req.body;
    tx.updatedAt = Date.now();
    
    // Bijak Numbering logic
    if (tx.type === 'OUT') {
        const currentSeq = db.settings.warehouseSequences?.[tx.company] || 1000;
        const nextSeq = currentSeq + 1;
        db.settings.warehouseSequences[tx.company] = nextSeq;
        tx.number = nextSeq;
    }
    
    db.warehouseTransactions.unshift(tx);
    saveDb(db);

    // --- SMART NOTIFICATION FOR BIJAK ---
    if (tx.type === 'OUT') {
        const msg = `📦 *حواله خروج (بیجک) صادر شد*\nشرکت: ${tx.company}\nشماره بیجک: ${tx.number}\nگیرنده: ${tx.recipientName}\nتعداد اقلام: ${tx.items.length}\nراننده: ${tx.driverName || '-'}`;
        
        // Notify Warehouse Group
        if (db.settings.defaultWarehouseGroup) {
            sendSmartNotification(db.settings.defaultWarehouseGroup, msg);
        }
        // Notify Sales Manager
        if (db.settings.defaultSalesManager) {
            sendSmartNotification(db.settings.defaultSalesManager, msg);
        }
    }

    res.json(db.warehouseTransactions);
});
app.delete('/api/warehouse/transactions/:id', (req, res) => { const db = getDb(); db.warehouseTransactions = db.warehouseTransactions.filter(x => x.id !== req.params.id); saveDb(db); res.json(db.warehouseTransactions); });


// Other Standard Routes
app.get('/api/users', (req, res) => res.json(getDb().users));
app.post('/api/users', (req, res) => { const db = getDb(); const u = req.body; u.id = u.id || Date.now().toString(); db.users.push(u); saveDb(db); res.json(db.users); });
app.put('/api/users/:id', (req, res) => { const db = getDb(); const idx = db.users.findIndex(x => x.id === req.params.id); if(idx!==-1) { db.users[idx] = { ...db.users[idx], ...req.body }; saveDb(db); res.json(db.users); } else res.sendStatus(404); });
app.delete('/api/users/:id', (req, res) => { const db = getDb(); db.users = db.users.filter(x => x.id !== req.params.id); saveDb(db); res.json(db.users); });
app.post('/api/login', (req, res) => { const u = getDb().users.find(x => x.username === req.body.username && x.password === req.body.password); u ? res.json(u) : res.status(401).send('Invalid'); });

app.get('/api/settings', (req, res) => res.json(getDb().settings));
app.post('/api/settings', (req, res) => { 
    const db = getDb(); 
    db.settings = req.body; 
    saveDb(db); 
    if (req.body.telegramBotToken) initTelegram(req.body.telegramBotToken);
    res.json(db.settings); 
});

app.get('/api/chat', (req, res) => res.json(getDb().messages));
app.post('/api/chat', (req, res) => { const db = getDb(); const m = req.body; m.id = m.id || Date.now().toString(); db.messages.push(m); saveDb(db); res.json(db.messages); });
app.get('/api/trade', (req, res) => res.json(getDb().tradeRecords));
app.post('/api/trade', (req, res) => { const db = getDb(); const t = req.body; t.id = t.id || Date.now().toString(); db.tradeRecords.push(t); saveDb(db); res.json(db.tradeRecords); });
app.put('/api/trade/:id', (req, res) => { const db = getDb(); const idx = db.tradeRecords.findIndex(x => x.id === req.params.id); if(idx!==-1){ db.tradeRecords[idx] = {...db.tradeRecords[idx], ...req.body}; saveDb(db); res.json(db.tradeRecords); } else res.sendStatus(404); });
app.delete('/api/trade/:id', (req, res) => { const db = getDb(); db.tradeRecords = db.tradeRecords.filter(x => x.id !== req.params.id); saveDb(db); res.json(db.tradeRecords); });

// Standard Group/Task routes
['groups', 'tasks'].forEach(key => {
    app.get(`/api/${key}`, (req, res) => res.json(getDb()[key]));
    app.post(`/api/${key}`, (req, res) => { const db = getDb(); const i = req.body; i.id = i.id || Date.now().toString(); db[key].push(i); saveDb(db); res.json(db[key]); });
    app.put(`/api/${key}/:id`, (req, res) => { const db = getDb(); const idx = db[key].findIndex(x => x.id === req.params.id); if(idx!==-1){ db[key][idx]={...db[key][idx],...req.body}; saveDb(db); res.json(db[key]); } else res.sendStatus(404); });
    app.delete(`/api/${key}/:id`, (req, res) => { const db = getDb(); db[key] = db[key].filter(x => x.id !== req.params.id); saveDb(db); res.json(db[key]); });
});

// WhatsApp & AI Routes
app.post('/api/send-whatsapp', async (req, res) => { 
    try {
        const { number, message, mediaData } = req.body;
        await sendWhatsAppMessage(number, message, mediaData);
        res.json({ success: true });
    } catch (e) {
        res.status(503).json({ success: false, message: e.message });
    }
});
app.get('/api/whatsapp/status', (req, res) => res.json(getWhatsAppStatus()));
app.post('/api/whatsapp/logout', async (req, res) => { await logoutWhatsApp(); res.json({success:true}); });
app.get('/api/whatsapp/groups', async (req, res) => { 
    try {
        const groups = await getWhatsAppGroups();
        res.json({ success: true, groups });
    } catch(e) {
        res.status(503).json({ success: false });
    }
});

// --- GEMINI AI ROUTE (FIXED FOR @google/genai) ---
app.post('/api/ai-request', async (req, res) => { 
    try { 
        const { message, audio, mimeType, username } = req.body;
        const db = getDb();
        const apiKey = db.settings?.geminiApiKey;

        if (!apiKey) return res.json({ reply: "کلید هوش مصنوعی تنظیم نشده است." });

        const ai = new GoogleGenAI({ apiKey });
        
        let parts = [];
        if (audio) {
            const buffer = Buffer.from(audio, 'base64');
            const ext = mimeType?.includes('mp4') ? 'm4a' : 'webm';
            const filename = `ai_voice_${Date.now()}_${username}.${ext}`;
            const filepath = path.join(AI_UPLOADS_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            
            parts.push({ inlineData: { mimeType: mimeType || 'audio/webm', data: audio } });
            parts.push({ text: "این یک پیام صوتی فارسی است. اگر دستور پرداخت است، اطلاعات را استخراج کن. اگر سوال است پاسخ بده." });
        } else {
            parts.push({ text: message || "Hello" });
        }

        // CORRECT NEW SYNTAX:
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts }]
        });

        // Use response.text directly (getter property, not function)
        const responseText = response.text;
        
        res.json({ reply: responseText }); 

    } catch (e) { 
        console.error("AI Error:", e);
        res.status(500).json({ error: e.message }); 
    } 
});

// Backup Routes
const performFullBackup = async (isAuto = false, includeFiles = true) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const type = includeFiles ? 'full' : 'db-only';
    const backupFileName = `backup-${type}-${timestamp}.zip`;
    const backupPath = path.join(BACKUPS_DIR, backupFileName);
    
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', async () => {
            console.log(`>>> Backup: ${backupFileName}`);
            if (isAuto) {
                const db = getDb();
                if (db.settings?.telegramAdminId) {
                    sendTelegramDoc(db.settings.telegramAdminId, backupPath, `#بک_آپ_خودکار\n📅 ${new Date().toLocaleDateString('fa-IR')}`);
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
