
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
        const initial = { settings: { currentTrackingNumber: 1000, companyNames: [], companies: [], bankNames: [], rolePermissions: {}, savedContacts: [] }, orders: [], users: [{ id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم', role: 'admin', canManageTrade: true }], messages: [], groups: [], tasks: [], tradeRecords: [] };
        fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
        return initial;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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

// Robust Phone Normalizer: Takes last 10 digits (e.g. 9123456789)
// This handles +98, 09, 9, 0098 variations automatically.
const getTenDigits = (p) => {
    if (!p) return '';
    const digits = p.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
};

const sendWhatsAppMessageInternal = async (number, message) => {
    if (!whatsappClient || !isWhatsAppReady) return false;
    try {
        // Construct standard WhatsApp ID
        let chatId = number.includes('@') ? number : `98${getTenDigits(number)}@c.us`;
        await whatsappClient.sendMessage(chatId, message);
        console.log(`>>> WA Sent to ${chatId}`);
        return true;
    } catch (e) {
        console.error("WA Send Error:", e.message);
        return false;
    }
};

// ==========================================
// CORE LOGIC: PROCESS COMMANDS
// ==========================================

function extractOrderWithRegex(text) {
    try {
        let amount = 0;
        const amountMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(میلیون|میلیارد|هزار|تومان|ریال)?/);
        if (amountMatch) {
            let val = parseFloat(amountMatch[1].replace(/,/g, ''));
            const unit = amountMatch[2];
            if (unit === 'میلیارد') val *= 10000000000;
            else if (unit === 'میلیون') val *= 10000000; 
            else if (unit === 'هزار') val *= 10000; 
            else if (unit === 'ریال') val *= 1;
            else val *= 10; 
            amount = Math.floor(val);
        }
        let payee = "نامشخص";
        const payeeMatch = text.match(/(?:به|برای|وجه)\s+([^0-9\.\,\،]+)/);
        if (payeeMatch && payeeMatch[1]) {
            payee = payeeMatch[1].trim().split(/\s+/).slice(0, 3).join(' '); 
        }
        if (amount > 0) return { payee, amount, description: text };
        return null;
    } catch (e) { return null; }
}

async function processUserCommand(user, text, isVoice = false) {
    if (!text) return "متن پیام خالی است.";
    const db = getDb();
    const cleanText = text.trim().toLowerCase();

    console.log(`>>> Processing command from ${user.fullName}: ${cleanText}`);

    // 1. APPROVAL LOGIC (Highest Priority)
    const numMatch = cleanText.match(/^(\d+)$/) || cleanText.match(/تایید\s*(\d+)/) || cleanText.match(/ok\s*(\d+)/);
    if (numMatch) {
        const trackNum = parseInt(numMatch[1]);
        const orderIdx = db.orders.findIndex(o => o.trackingNumber === trackNum);
        if (orderIdx === -1) return `❌ دستور #${trackNum} یافت نشد.`;
        
        const order = db.orders[orderIdx];
        let nextStatus = null;
        if (order.status === 'در انتظار بررسی مالی' && (user.role === 'financial' || user.role === 'admin')) nextStatus = 'تایید مالی / در انتظار مدیریت';
        else if (order.status === 'تایید مالی / در انتظار مدیریت' && (user.role === 'manager' || user.role === 'admin')) nextStatus = 'تایید مدیریت / در انتظار مدیرعامل';
        else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل' && (user.role === 'ceo' || user.role === 'admin')) nextStatus = 'تایید نهایی';

        if (nextStatus) {
            order.status = nextStatus;
            order.updatedAt = Date.now();
            order[`approver${user.role === 'admin' ? 'Admin' : user.role === 'ceo' ? 'Ceo' : user.role === 'manager' ? 'Manager' : 'Financial'}`] = user.fullName;
            db.orders[orderIdx] = order;
            saveDb(db);
            triggerNotifications(order, db);
            return `✅ دستور #${trackNum} تایید شد.\nوضعیت جدید: ${nextStatus}`;
        } else {
            return `⛔ وضعیت فعلی دستور (${order.status}) منتظر تایید شما نیست.`;
        }
    }

    // 2. REPORT LOGIC (Simple & Fast)
    if (cleanText.includes('گزارش') || cleanText.includes('کارتابل')) {
        let pending = [];
        if (user.role === 'financial') pending = db.orders.filter(o => o.status === 'در انتظار بررسی مالی');
        else if (user.role === 'manager') pending = db.orders.filter(o => o.status === 'تایید مالی / در انتظار مدیریت');
        else if (user.role === 'ceo') pending = db.orders.filter(o => o.status === 'تایید مدیریت / در انتظار مدیرعامل');
        else if (user.role === 'admin') pending = db.orders.filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده');

        if (pending.length === 0) return "✅ کارتابل شما خالی است.";
        let rep = `📊 *کارتابل جاری (${user.fullName})*:\n`;
        pending.slice(0, 8).forEach(o => { rep += `\n🔹 *#${o.trackingNumber}* | ${Number(o.totalAmount).toLocaleString()} ریال\n   بابت: ${o.description}\n`; });
        return rep + `\n💡 برای تایید، شماره دستور را ارسال کنید.`;
    }

    // 3. HELP LOGIC
    if (cleanText === 'راهنما' || cleanText === 'help' || cleanText === '/start') {
        return `🤖 *راهنمای سیستم*\n1️⃣ ارسال عدد دستور = تایید\n2️⃣ کلمه "گزارش" = مشاهده کارتابل\n3️⃣ "ثبت [مبلغ] برای [شخص]" = ثبت دستور جدید`;
    }

    // 4. CREATION LOGIC (Hybrid: AI -> Regex)
    if (cleanText.includes('ثبت') || cleanText.includes('پرداخت') || cleanText.includes('دستور')) {
        let data = null;
        const ai = getGeminiClient();
        
        // Only use AI if key exists, otherwise skip straight to regex
        if (ai) {
            try {
                console.log(">>> Sending to Gemini (Direct)...");
                const prompt = `Extract payment details from: "${text}". JSON: { "payee": string, "amount": number (in Rials), "description": string }. If amount is in Toman/Million, convert to Rial.`;
                
                const result = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { responseMimeType: 'application/json' }
                });
                
                const responseText = result.response.text();
                data = JSON.parse(responseText);
            } catch (e) {
                console.error(">>> Gemini Error (Fallback to Regex):", e.message);
            }
        }
        
        if (!data || !data.amount) {
            data = extractOrderWithRegex(text);
        }

        if (data && data.amount > 0) {
            const num = findNextAvailableTrackingNumber(db);
            const newOrder = {
                id: Date.now().toString(36),
                trackingNumber: num,
                date: new Date().toISOString().split('T')[0],
                payee: data.payee || "نامشخص",
                totalAmount: data.amount,
                description: data.description || text,
                status: 'در انتظار بررسی مالی',
                requester: user.fullName + ' (Bot)',
                paymentDetails: [{ id: 'ai'+Date.now(), method: 'حواله بانکی', amount: data.amount, description: 'Auto Generated' }],
                createdAt: Date.now()
            };
            db.orders.unshift(newOrder);
            saveDb(db);
            triggerNotifications(newOrder, db);
            return `✅ دستور پرداخت ثبت شد (#${num})\nمبلغ: ${data.amount.toLocaleString()} ریال\nگیرنده: ${data.payee}`;
        } else {
            return "مشخصات کامل نیست. لطفا مبلغ و گیرنده را ذکر کنید.";
        }
    }

    return "دستور نامعتبر. (راهنما: ثبت پرداخت / گزارش / تایید شماره)";
}

// --- NOTIFICATIONS ---
function triggerNotifications(order, db) {
    const tracking = order.trackingNumber;
    const amount = Number(order.totalAmount).toLocaleString('fa-IR');
    let targetRole = null;
    let msg = "";

    if (order.status === 'در انتظار بررسی مالی') { targetRole = 'financial'; msg = `🔔 *درخواست جدید (#${tracking})*\nمبلغ: ${amount} ریال\nذینفع: ${order.payee}`; } 
    else if (order.status === 'تایید مالی / در انتظار مدیریت') { targetRole = 'manager'; msg = `🔔 *تایید مدیریت لازم است (#${tracking})*\nمبلغ: ${amount} ریال`; }
    else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل') { targetRole = 'ceo'; msg = `🔔 *تایید نهایی مدیرعامل (#${tracking})*\nمبلغ: ${amount} ریال`; }
    else if (order.status === 'تایید نهایی') { targetRole = 'financial'; msg = `✅ *دستور #${tracking} نهایی شد.*\nلطفا پرداخت کنید.`; }

    if (targetRole && msg) {
        // WhatsApp Notifications
        db.users.filter(u => u.role === targetRole || u.role === 'admin').forEach(u => {
            if (u.phoneNumber) sendWhatsAppMessageInternal(u.phoneNumber, msg);
        });
        
        // Telegram Notifications
        if (telegramBot && db.settings?.telegramBotToken) {
             db.users.filter(u => (u.role === targetRole || u.role === 'admin') && u.telegramChatId).forEach(u => {
                 telegramBot.sendMessage(u.telegramChatId, msg).catch(() => {});
             });
        }
    }
}

// --- VOICE TRANSCRIPTION (Direct) ---
async function transcribe(buffer, mimeType) {
    const ai = getGeminiClient();
    if (!ai) return null;
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{
                role: 'user',
                parts: [
                    { inlineData: { mimeType: mimeType, data: buffer.toString('base64') } },
                    { text: "Transcribe audio to Persian text exactly." }
                ]
            }]
        });
        return result.response.text().trim();
    } catch (e) {
        console.error(">>> Transcribe Error:", e.message);
        return null;
    }
}

// ==========================================
// TELEGRAM BOT
// ==========================================
const initTelegram = async () => {
    try {
        const TelegramBot = (await import('node-telegram-bot-api')).default;
        const db = getDb();
        if (db.settings?.telegramBotToken) {
            telegramBot = new TelegramBot(db.settings.telegramBotToken, { 
                polling: { interval: 300, autoStart: true, params: { timeout: 10 } } 
            });
            console.log(">>> Telegram Bot Started");

            telegramBot.on('polling_error', () => {}); // Silence errors

            telegramBot.on('message', async (msg) => {
                const chatId = msg.chat.id.toString();
                const db = getDb();
                const user = db.users.find(u => u.telegramChatId === chatId);
                if (!user) { telegramBot.sendMessage(chatId, `⛔ عدم دسترسی. ID: ${chatId}`); return; }

                if (msg.text) {
                    const reply = await processUserCommand(user, msg.text);
                    telegramBot.sendMessage(chatId, reply).catch(() => {});
                }
            });
        }
    } catch (e) { console.log("TG Init Error:", e.message); }
};

// ==========================================
// WHATSAPP BOT
// ==========================================
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
                if (!msg.from.includes('@c.us')) return; // Ignore groups for command processing
                
                // Strict 10-digit matching (ignores 98 or 0 prefix issues)
                const senderDigits = getTenDigits(msg.from.replace('@c.us', ''));
                console.log(`>>> Incoming MSG from: ${msg.from} (Digits: ${senderDigits})`);

                const db = getDb();
                const user = db.users.find(u => getTenDigits(u.phoneNumber) === senderDigits);
                
                if (!user) {
                    // Optional: Feedback for unknown users
                    console.log(`>>> User Unknown: ${senderDigits}`);
                    // await msg.reply("⛔ شماره شما در سیستم تعریف نشده است.");
                    return;
                }

                let text = msg.body;
                
                // Voice Handling
                if (msg.hasMedia) {
                    try {
                        const media = await msg.downloadMedia();
                        if (media.mimetype.includes('audio')) {
                            const buff = Buffer.from(media.data, 'base64');
                            text = await transcribe(buff, media.mimetype);
                            if (text) msg.reply(`🎤: "${text}"`);
                        }
                    } catch (e) { console.error("WA Media Fail", e.message); }
                }

                if (text) {
                    const reply = await processUserCommand(user, text);
                    if (reply) await msg.reply(reply);
                }
            } catch (err) {
                console.error(">>> Error Processing Message:", err);
            }
        });

        whatsappClient.initialize().catch(e => console.error("WA Init Fail", e.message));

    } catch (e) { console.error("WA Module Error", e.message); }
};

// Initialize Bots
setTimeout(() => { initWhatsApp(); initTelegram(); }, 3000);

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

app.post('/api/ai-request', async (req, res) => {
    try {
        const { message, audio, mimeType } = req.body;
        let text = message;
        if (audio) {
            text = await transcribe(Buffer.from(audio, 'base64'), mimeType || 'audio/webm');
        }
        // Respond simply
        res.json({ reply: text ? `(تشخیص: ${text})` : "متوجه نشدم." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/analyze-payment', async (req, res) => {
    const { amount, date, company, description } = req.body;
    
    // Direct Gemini Call for Analysis (No explicit timeout wrapping)
    const ai = getGeminiClient();
    if (ai) {
        try {
            const prompt = `Analyze payment: Company: ${company}, Amount: ${amount} Rials, Date: ${date}, Desc: ${description}. JSON: { "recommendation": string (Persian), "score": number, "reasons": string[] }`;
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { responseMimeType: 'application/json' }
            });
            const jsonResponse = JSON.parse(result.response.text());
            return res.json(jsonResponse);
        } catch (e) {
            console.error("Analysis Error:", e.message);
        }
    }

    // Fallback if no client or error
    res.json({ 
        recommendation: "تحلیل آفلاین (هوش مصنوعی در دسترس نیست)", 
        score: 70, 
        reasons: ["خطای اتصال به سرویس هوشمند.", "مبلغ و اطلاعات را دستی بررسی کنید."],
        isOffline: true 
    });
});

// CRUD APIs
app.get('/api/orders', (req, res) => res.json(getDb().orders));
app.post('/api/orders', (req, res) => { const db = getDb(); const o = req.body; o.updatedAt = Date.now(); if(db.orders.some(x=>x.trackingNumber===o.trackingNumber)) o.trackingNumber = findNextAvailableTrackingNumber(db); db.orders.unshift(o); saveDb(db); triggerNotifications(o, db); res.json(db.orders); });
app.put('/api/orders/:id', (req, res) => { const db = getDb(); const i = db.orders.findIndex(x=>x.id===req.params.id); if(i!==-1){ const oldStatus = db.orders[i].status; db.orders[i] = req.body; db.orders[i].updatedAt = Date.now(); saveDb(db); if(oldStatus!==db.orders[i].status) triggerNotifications(db.orders[i], db); res.json(db.orders); } else res.sendStatus(404); });
app.delete('/api/orders/:id', (req, res) => { const db = getDb(); db.orders = db.orders.filter(x=>x.id!==req.params.id); saveDb(db); res.json(db.orders); });
app.get('/api/next-tracking-number', (req, res) => res.json({ nextTrackingNumber: findNextAvailableTrackingNumber(getDb()) }));
app.post('/api/upload', (req, res) => { try { const { fileName, fileData } = req.body; const b = Buffer.from(fileData.split(',')[1], 'base64'); const n = Date.now() + '_' + fileName; fs.writeFileSync(path.join(UPLOADS_DIR, n), b); res.json({ url: `/uploads/${n}`, fileName: n }); } catch (e) { res.status(500).send('Err'); } });

// Auth & Users
app.post('/api/login', (req, res) => { const { username, password } = req.body; const user = getDb().users.find(u => u.username === username && u.password === password); if (user) res.json(user); else res.status(401).json({ message: 'Invalid' }); });
app.get('/api/users', (req, res) => res.json(getDb().users));
app.post('/api/users', (req, res) => { const db = getDb(); db.users.push(req.body); saveDb(db); res.json(db.users); });
app.put('/api/users/:id', (req, res) => { const db = getDb(); const i = db.users.findIndex(u => u.id === req.params.id); if(i!==-1) { db.users[i] = { ...db.users[i], ...req.body }; saveDb(db); res.json(db.users); } });
app.delete('/api/users/:id', (req, res) => { const db = getDb(); db.users = db.users.filter(u => u.id !== req.params.id); saveDb(db); res.json(db.users); });
app.get('/api/settings', (req, res) => res.json(getDb().settings));
app.post('/api/settings', (req, res) => { const db = getDb(); db.settings = req.body; saveDb(db); res.json(db.settings); });
app.get('/api/backup', (req, res) => { res.json(getDb()); });
app.post('/api/restore', (req, res) => { if(req.body && req.body.orders) { saveDb(req.body); res.json({success:true}); } else res.sendStatus(400); });

// Chat & Trade
app.get('/api/chat', (req, res) => res.json(getDb().messages));
app.post('/api/chat', (req, res) => { const db = getDb(); if(db.messages.length>500) db.messages.shift(); db.messages.push(req.body); saveDb(db); res.json(db.messages); });
app.get('/api/trade', (req, res) => res.json(getDb().tradeRecords));
app.post('/api/trade', (req, res) => { const db = getDb(); db.tradeRecords.push(req.body); saveDb(db); res.json(db.tradeRecords); });
app.put('/api/trade/:id', (req, res) => { const db = getDb(); const i = db.tradeRecords.findIndex(t => t.id === req.params.id); if(i!==-1){ db.tradeRecords[i] = req.body; saveDb(db); res.json(db.tradeRecords); } });
app.delete('/api/trade/:id', (req, res) => { const db = getDb(); db.tradeRecords = db.tradeRecords.filter(t => t.id !== req.params.id); saveDb(db); res.json(db.tradeRecords); });

app.get('/api/manifest', (req, res) => res.json({ "name": "PaySys", "short_name": "PaySys", "start_url": "/", "display": "standalone", "icons": [] }));
app.get('*', (req, res) => { const p = path.join(__dirname, 'dist', 'index.html'); if(fs.existsSync(p)) res.sendFile(p); else res.send('Build first'); });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
