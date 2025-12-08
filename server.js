
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { spawn } from 'child_process';
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const BACKUPS_DIR = path.join(__dirname, 'backups');
const WAUTH_DIR = path.join(__dirname, 'wauth');

// --- GEMINI SETUP ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;
let geminiClient = null;
if (GEMINI_API_KEY) {
    console.log(">>> Gemini API Key found. Initializing AI...");
    geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
} else {
    console.warn(">>> ⚠️ No GEMINI_API_KEY found. System will run in LIMITED OFFLINE MODE.");
}

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
                companies: [], 
                defaultCompany: '',
                bankNames: [],
                commodityGroups: [],
                rolePermissions: {},
                savedContacts: [],
                telegramBotToken: '',
                telegramAdminId: '',
                smsApiKey: '',
                smsSenderNumber: '',
                whatsappNumber: '',
                n8nWebhookUrl: ''
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

const findNextAvailableTrackingNumber = (db) => {
    const baseNum = (db.settings.currentTrackingNumber || 1602);
    const startNum = baseNum + 1;
    const existingNumbers = db.orders.map(o => o.trackingNumber).sort((a, b) => a - b);
    let nextNum = startNum;
    for (const num of existingNumbers) { if (num < nextNum) continue; if (num === nextNum) { nextNum++; } else if (num > nextNum) { return nextNum; } }
    return nextNum;
};

// ==========================================
// WHATSAPP & TELEGRAM VARIABLES
// ==========================================
let whatsappClient = null;
let telegramBot = null;
let MessageMedia = null; 
let isWhatsAppReady = false;
let currentQR = null; 
let whatsappUser = null; 

const sendWhatsAppMessageInternal = async (number, message) => {
    if (!whatsappClient || !isWhatsAppReady) {
        console.warn('>>> WhatsApp Internal Send Failed: Client not ready.');
        return false;
    }
    try {
        let chatId = (number.includes('@')) ? number : `${number.replace(/\D/g, '').replace(/^09/, '989').replace(/^9/, '989')}@c.us`;
        await whatsappClient.sendMessage(chatId, message);
        console.log(`>>> WhatsApp sent to ${chatId}`);
        return true;
    } catch (e) {
        console.error("WA Send Error:", e);
        return false;
    }
};

const sendTelegramMessageInternal = async (chatId, message) => {
    if (!telegramBot) return false;
    try {
        await telegramBot.sendMessage(chatId, message);
        return true;
    } catch (e) {
        console.error("TG Send Error:", e);
        return false;
    }
};

// ==========================================
// OFFLINE AI ENGINE (FALLBACK)
// ==========================================
const processOfflineAI = (user, text) => {
    if (!text) return "متوجه نشدم.";
    const lower = text.toLowerCase();
    console.log(`>>> ⚠️ Using Offline AI Fallback for: ${text}`);

    if (lower.includes('گزارش') || lower.includes('وضعیت') || lower.includes('کارتابل') || lower.includes('چک')) {
        return { type: "tool_call", tool: "get_financial_summary", args: {} };
    }

    if (lower.includes('ثبت') || lower.includes('پرداخت') || lower.includes('دستور')) {
        const amountMatch = text.match(/(\d+)/); 
        const amount = amountMatch ? parseInt(amountMatch[0]) : 0;
        let payee = "نامشخص";
        if (text.includes("به")) payee = text.split("به")[1].split(" ")[1]; 
        return { type: "tool_call", tool: "register_payment_order", args: { payee: payee || "شخص ناشناس (آفلاین)", amount: amount || 1000000, description: text, company: "شرکت پیش‌فرض" } };
    }

    if (lower.includes('تایید') || lower.includes('اوکی')) {
        const numMatch = text.match(/(\d+)/);
        if (numMatch) return { type: "tool_call", tool: "manage_order", args: { trackingNumber: numMatch[0], action: 'approve' } };
    }
    
    if (lower.includes('رد') || lower.includes('کنسل')) {
        const numMatch = text.match(/(\d+)/);
        if (numMatch) return { type: "tool_call", tool: "manage_order", args: { trackingNumber: numMatch[0], action: 'reject', reason: 'رد شده توسط دستور متنی' } };
    }

    return { type: "message", text: "من در حالت آفلاین هستم (بدون اینترنت یا کلید هوش مصنوعی). اما می‌توانم دستوراتی مثل 'گزارش بده' یا 'ثبت پرداخت مبلغ ۱۰۰۰۰۰' را انجام دهم." };
};

// ==========================================
// GEMINI REQUEST LOGIC
// ==========================================

// Define Tools for Gemini
const geminiTools = [
    {
      functionDeclarations: [
        {
          name: 'register_payment_order',
          description: 'Register a new payment order or request',
          parameters: {
            type: 'OBJECT',
            properties: {
              payee: { type: 'STRING', description: 'Name of the person or company receiving payment' },
              amount: { type: 'NUMBER', description: 'Amount in Rial (convert user input to number)' },
              description: { type: 'STRING', description: 'Reason for payment or description' },
              company: { type: 'STRING', description: 'Name of the paying company' }
            },
            required: ['payee', 'amount']
          }
        },
        {
          name: 'get_financial_summary',
          description: 'Get a report of pending orders, status, or cartable',
          parameters: { type: 'OBJECT', properties: {} }
        },
        {
          name: 'manage_order',
          description: 'Approve or Reject a payment order by tracking number',
          parameters: {
            type: 'OBJECT',
            properties: {
              trackingNumber: { type: 'STRING', description: 'The order tracking number' },
              action: { type: 'STRING', description: 'approve or reject' },
              reason: { type: 'STRING', description: 'Reason for rejection (if applicable)' }
            },
            required: ['trackingNumber', 'action']
          }
        },
        {
          name: 'search_trade_file',
          description: 'Search for a trade/import file',
          parameters: {
            type: 'OBJECT',
            properties: {
              query: { type: 'STRING', description: 'File number, seller name, or goods name' }
            },
            required: ['query']
          }
        }
      ]
    }
];

async function processN8NRequest(user, messageText, audioData = null, audioMimeType = null, systemPrompt = null) {
    // Priority 1: Gemini (Free & Fast)
    if (geminiClient) {
        try {
            const model = "gemini-2.5-flash";
            const systemInstruction = "You are a smart financial assistant for a company. Respond in Persian (Farsi). Be concise. Use tools when the user asks to perform an action (register, approve, report). Current User: " + user.fullName + " Role: " + user.role;
            
            let contents = [];
            
            // Handle Audio Input directly in Gemini
            if (audioData) {
                contents = [{
                    role: "user",
                    parts: [
                        { inlineData: { mimeType: audioMimeType || 'audio/ogg', data: audioData } },
                        { text: messageText || "Please listen to this audio and execute the command or answer." }
                    ]
                }];
            } else {
                contents = [{ role: "user", parts: [{ text: messageText }] }];
            }

            const result = await geminiClient.models.generateContent({
                model: model,
                contents: contents,
                tools: geminiTools,
                config: {
                    systemInstruction: systemPrompt || systemInstruction,
                    temperature: 0.2, // Low temp for accurate tool use
                }
            });

            // Handle Response
            const response = result.response;
            const functionCalls = response.functionCalls();
            
            if (functionCalls && functionCalls.length > 0) {
                const call = functionCalls[0];
                return handleToolExecution(call.name, call.args, user);
            }
            
            if (response.text) {
                // Check if the response text looks like JSON (sometimes Gemini outputs JSON string instead of tool call if instructed poorly, but tools usually override)
                const txt = response.text;
                if (txt.trim().startsWith('{') && txt.includes("recommendation")) {
                    return JSON.parse(txt); // For analysis API
                }
                return txt;
            }

        } catch (error) {
            console.error(">>> Gemini Error:", error);
            // Fallthrough to offline mode
        }
    }

    // Priority 2: Offline Fallback (If Gemini fails or no key)
    const offlineResponse = processOfflineAI(user, messageText);
    if (offlineResponse.type === 'tool_call') {
        return handleToolExecution(offlineResponse.tool, offlineResponse.args, user);
    }
    return offlineResponse.text;
}

function handleToolExecution(toolName, args, user) {
    const db = getDb();
    console.log(`>>> Executing Tool: ${toolName} for ${user.fullName}`);
    
    try {
        if (toolName === 'register_payment_order') {
            const trackingNum = findNextAvailableTrackingNumber(db);
            const newOrder = {
                id: Date.now().toString(36),
                trackingNumber: trackingNum,
                date: new Date().toISOString().split('T')[0],
                payee: args.payee || "نامشخص",
                totalAmount: Number(args.amount) || 0,
                description: args.description || "ثبت شده توسط هوش مصنوعی",
                status: 'در انتظار بررسی مالی',
                requester: user.fullName,
                paymentDetails: [{
                    id: Date.now().toString(36) + 'd',
                    method: 'حواله بانکی',
                    amount: Number(args.amount) || 0,
                    description: 'ثبت شده توسط هوش مصنوعی'
                }],
                payingCompany: args.company || db.settings.defaultCompany,
                createdAt: Date.now()
            };
            db.orders.unshift(newOrder);
            saveDb(db);
            
            // Notify Financial
            const financeUsers = db.users.filter(u => u.role === 'financial');
            financeUsers.forEach(fu => {
                if(fu.phoneNumber) sendWhatsAppMessageInternal(fu.phoneNumber, `🔔 *دستور پرداخت جدید*\nشماره: ${trackingNum}\nمبلغ: ${Number(args.amount).toLocaleString('fa-IR')}\nدرخواست‌کننده: ${user.fullName}`);
            });

            return `دستور پرداخت با موفقیت ثبت شد.\nشماره: ${trackingNum}\nمبلغ: ${Number(args.amount).toLocaleString('fa-IR')} ریال\nگیرنده: ${args.payee}`;
        }

        if (toolName === 'get_financial_summary') {
            let reportText = `📊 *گزارش کارتابل شما (${user.fullName})*:\n`;
            let count = 0;

            if (user.role === 'admin' || user.role === 'financial') {
                const pending = db.orders.filter(o => o.status === 'در انتظار بررسی مالی');
                if (pending.length > 0) {
                    reportText += `\n🔸 *منتظر تایید مالی:* ${pending.length} مورد\n`;
                    pending.slice(0, 5).forEach(o => reportText += `   - #${o.trackingNumber} | ${o.payee} | ${Number(o.totalAmount).toLocaleString()} \n`);
                    count += pending.length;
                }
            }
            if (user.role === 'admin' || user.role === 'manager') {
                const pending = db.orders.filter(o => o.status === 'تایید مالی / در انتظار مدیریت');
                if (pending.length > 0) {
                    reportText += `\n🔸 *منتظر تایید مدیریت:* ${pending.length} مورد\n`;
                    pending.slice(0, 5).forEach(o => reportText += `   - #${o.trackingNumber} | ${o.payee} \n`);
                    count += pending.length;
                }
            }
            if (user.role === 'admin' || user.role === 'ceo') {
                const pending = db.orders.filter(o => o.status === 'تایید مدیریت / در انتظار مدیرعامل');
                if (pending.length > 0) {
                    reportText += `\n🔸 *منتظر تایید مدیرعامل:* ${pending.length} مورد\n`;
                    pending.slice(0, 5).forEach(o => reportText += `   - #${o.trackingNumber} | ${o.payee} \n`);
                    count += pending.length;
                }
            }
            if (count === 0) reportText += "\n✅ کارتابل شما خالی است.";
            return reportText;
        }

        if (toolName === 'manage_order') {
            const { trackingNumber, action, reason } = args;
            const orderIndex = db.orders.findIndex(o => o.trackingNumber == trackingNumber);
            if (orderIndex === -1) return `دستور پرداخت با شماره ${trackingNumber} یافت نشد.`;
            
            const order = db.orders[orderIndex];
            let nextStatus = null;
            let successMessage = "";

            if (action === 'reject') {
                nextStatus = 'رد شده';
                order.status = nextStatus;
                order.rejectionReason = reason || 'رد شده توسط هوش مصنوعی';
                order.rejectedBy = user.fullName;
                successMessage = `❌ دستور #${trackingNumber} رد شد.`;
            } else {
                if (order.status === 'در انتظار بررسی مالی' && (user.role === 'financial' || user.role === 'admin')) nextStatus = 'تایید مالی / در انتظار مدیریت';
                else if (order.status === 'تایید مالی / در انتظار مدیریت' && (user.role === 'manager' || user.role === 'admin')) nextStatus = 'تایید مدیریت / در انتظار مدیرعامل';
                else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل' && (user.role === 'ceo' || user.role === 'admin')) nextStatus = 'تایید نهایی';
                else return `⛔ وضعیت دستور (${order.status}) نیازی به تایید شما ندارد.`;
                
                order.status = nextStatus;
                successMessage = `✅ دستور #${trackingNumber} تایید شد.\nوضعیت جدید: ${nextStatus}`;
            }

            order.updatedAt = Date.now();
            db.orders[orderIndex] = order;
            saveDb(db);
            triggerNotifications(order, db);
            return successMessage;
        }

        if (toolName === 'search_trade_file') {
            const term = (args.query || '').toLowerCase();
            const found = (db.tradeRecords || []).filter(r => r.fileNumber.includes(term) || r.goodsName.includes(term) || r.sellerName.includes(term)).slice(0, 3);
            if (found.length === 0) return "هیچ پرونده‌ای یافت نشد.";
            let result = "📂 نتایج جستجو:\n";
            found.forEach(f => result += `\n- پرونده: ${f.fileNumber}\n  کالا: ${f.goodsName}\n  وضعیت: ${f.status}\n`);
            return result;
        }

        return `دستور ناشناخته: ${toolName}`;
    } catch (e) {
        console.error("Tool Execution Error:", e);
        return `خطا در اجرای دستور: ${e.message}`;
    }
}

function triggerNotifications(order, db) {
    const newStatus = order.status;
    const tracking = order.trackingNumber;
    const amount = Number(order.totalAmount).toLocaleString('fa-IR');
    let targetRole = null;
    let msg = '';

    if (newStatus === 'تایید مالی / در انتظار مدیریت') { targetRole = 'manager'; msg = `🔔 *کارتابل شما (مدیریت)*\nدستور #${tracking} توسط مالی تایید شد.`; }
    else if (newStatus === 'تایید مدیریت / در انتظار مدیرعامل') { targetRole = 'ceo'; msg = `🔔 *کارتابل شما (مدیرعامل)*\nدستور #${tracking} توسط مدیریت تایید شد.`; }
    else if (newStatus === 'تایید نهایی') { targetRole = 'financial'; msg = `✅ *دستور نهایی شد*\nدستور #${tracking} تایید نهایی شد.`; }

    if (targetRole && msg) {
        const targets = db.users.filter(u => u.role === targetRole || u.role === 'admin');
        targets.forEach(u => { if (u.phoneNumber) sendWhatsAppMessageInternal(u.phoneNumber, msg); });
    }
}

app.post('/api/analyze-payment', async (req, res) => {
    const { amount, date, company } = req.body;
    
    // Use Gemini JSON Mode
    const prompt = `Analyze this payment request: Amount ${amount}, Date ${date}, Company ${company}. Return a JSON object with keys: recommendation (string), score (number 0-100), reasons (array of strings).`;
    
    const response = await processN8NRequest(
        { fullName: 'Analyzer', role: 'system', id: 'sys' }, 
        prompt, null, null, "You are a financial analysis engine. Output ONLY valid JSON."
    );

    if (response && typeof response === 'object' && response.recommendation) {
        return res.json({ ...response, analysisId: Date.now() });
    }

    // Fallback Logic
    console.log("Using fallback analysis logic.");
    const amountNum = Number(amount);
    let score = 85;
    let reasons = [];
    let recommendation = "پرداخت بلامانع";

    if (amountNum > 5000000000) { score -= 25; reasons.push("مبلغ کلان است."); recommendation = "احتیاط"; }
    else if (amountNum > 1000000000) { score -= 10; reasons.push("مبلغ قابل توجه است."); }
    
    if (new Date(date).getDate() > 25) { reasons.push("ترافیک پرداخت آخر ماه."); score -= 5; }
    if (company && company.includes("بازرگانی")) { reasons.push("اولویت پرداخت‌های بازرگانی."); score += 5; }
    if (reasons.length === 0) reasons.push("شرایط نرمال است.");

    res.json({
        recommendation,
        score: Math.min(100, Math.max(0, score)),
        reasons,
        analysisId: Date.now(),
        isOffline: true
    });
});

const initTelegram = async () => {
    try {
        const TelegramBot = (await import('node-telegram-bot-api')).default;
        const db = getDb();
        const token = db.settings.telegramBotToken;
        
        if (token) {
            telegramBot = new TelegramBot(token, { polling: true });
            console.log('>>> Telegram Bot Started <<<');

            telegramBot.on('message', async (msg) => {
                const chatId = msg.chat.id.toString();
                const db = getDb();
                const user = db.users.find(u => u.telegramChatId === chatId);

                if (!user) {
                    telegramBot.sendMessage(chatId, `⛔ عدم دسترسی. Chat ID شما: ${chatId}`);
                    return;
                }

                let audioData = null;
                let messageText = msg.text;

                if (msg.voice || msg.audio) {
                    try {
                        const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
                        const fileLink = await telegramBot.getFileLink(fileId);
                        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
                        audioData = Buffer.from(response.data).toString('base64');
                    } catch (e) {
                        telegramBot.sendMessage(chatId, "خطا در دانلود صوت.");
                        return;
                    }
                }

                if (messageText || audioData) {
                    const reply = await processN8NRequest(user, messageText, audioData);
                    if (reply) telegramBot.sendMessage(chatId, typeof reply === 'string' ? reply : JSON.stringify(reply));
                }
            });
        }
    } catch (e) { console.warn('Telegram Bot Error:', e.message); }
};

const initWhatsApp = async () => {
    try {
        const wwebjs = await import('whatsapp-web.js');
        const { Client, LocalAuth, MessageMedia: MM } = wwebjs.default || wwebjs;
        MessageMedia = MM; 
        const qrcodeModule = await import('qrcode-terminal');
        const qrcode = qrcodeModule.default || qrcodeModule;

        const getBrowserPath = () => {
            const platform = process.platform;
            if (platform === 'win32') {
                const paths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 
                    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
                ];
                for (const p of paths) { if (fs.existsSync(p)) return p; }
            }
            return null;
        };

        whatsappClient = new Client({
            authStrategy: new LocalAuth({ dataPath: WAUTH_DIR }),
            puppeteer: { 
                headless: true, 
                executablePath: getBrowserPath(),
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
            }
        });

        whatsappClient.on('qr', (qr) => {
            currentQR = qr; isWhatsAppReady = false;
            console.log(">>> WA QR Received");
            qrcode.generate(qr, { small: true });
        });

        whatsappClient.on('ready', () => {
            console.log('>>> WhatsApp Ready');
            isWhatsAppReady = true; currentQR = null; whatsappUser = whatsappClient.info?.wid?.user;
        });

        whatsappClient.on('message', async (msg) => {
            const senderNumber = msg.from.replace('@c.us', '');
            const db = getDb();
            const normalize = (n) => n ? n.replace(/^98|^0/, '') : '';
            const user = db.users.find(u => normalize(u.phoneNumber) === normalize(senderNumber));
            
            if (!user) return; 

            let messageText = msg.body;
            let audioData = null;

            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media.mimetype.includes('audio') || media.mimetype.includes('ogg')) {
                        console.log('>>> Voice message received from', user.fullName);
                        audioData = media.data; 
                    }
                } catch (err) {
                    console.error('Failed to download media:', err);
                    return;
                }
            }

            if (messageText || audioData) {
                const reply = await processN8NRequest(user, messageText, audioData);
                if (reply) msg.reply(typeof reply === 'string' ? reply : JSON.stringify(reply));
            }
        });

        whatsappClient.initialize().catch(err => {
            console.error("WA Init Error:", err.message);
            isWhatsAppReady = false;
        });

    } catch (e) {
        console.warn('WhatsApp Module Error:', e.message);
    }
};

setTimeout(() => {
    initWhatsApp();
    initTelegram();
}, 3000);

app.get('/api/whatsapp/status', (req, res) => { res.json({ ready: isWhatsAppReady, qr: currentQR, user: whatsappUser }); });
app.get('/api/whatsapp/groups', async (req, res) => {
    if (!whatsappClient || !isWhatsAppReady) return res.status(503).json({ success: false });
    try { const chats = await whatsappClient.getChats(); const groups = chats.filter(chat => chat.isGroup).map(chat => ({ id: chat.id._serialized, name: chat.name })); res.json({ success: true, groups }); } catch (e) { res.status(500).json({ success: false }); }
});
app.post('/api/whatsapp/logout', async (req, res) => {
    if (whatsappClient) { try { await whatsappClient.logout(); isWhatsAppReady = false; res.json({ success: true }); } catch (e) { res.status(500).json({ success: false }); } } else res.status(400).json({ success: false });
});
app.post('/api/send-whatsapp', async (req, res) => {
    if (!whatsappClient || !isWhatsAppReady) return res.status(503).json({ success: false, message: 'Bot not ready' });
    const { number, message, mediaData } = req.body;
    try {
        let chatId = (number.includes('@')) ? number : `${number.replace(/\D/g, '').replace(/^09/, '989').replace(/^9/, '989')}@c.us`;
        if (mediaData && mediaData.data) {
            const media = new MessageMedia(mediaData.mimeType, mediaData.data, mediaData.filename);
            await whatsappClient.sendMessage(chatId, media, { caption: message || '' });
        } else if (message) { await whatsappClient.sendMessage(chatId, message); }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/ai-request', async (req, res) => {
    try { const reply = await processN8NRequest({ fullName: 'User', role: 'user', id: 'fe' }, req.body.message); res.json({ reply: typeof reply === 'string' ? reply : JSON.stringify(reply) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/manifest', (req, res) => {
    const db = getDb();
    const icon = db.settings.pwaIcon || "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-keep.png";
    res.json({ "name": "PaymentSys", "short_name": "PaySys", "start_url": "/", "display": "standalone", "background_color": "#f3f4f6", "theme_color": "#2563eb", "icons": [ { "src": icon, "sizes": "192x192", "type": "image/png" }, { "src": icon, "sizes": "512x512", "type": "image/png" } ] });
});

app.post('/api/login', (req, res) => { const { username, password } = req.body; const db = getDb(); const user = db.users.find(u => u.username === username && u.password === password); if (user) res.json(user); else res.status(401).json({ message: 'Invalid' }); });
app.get('/api/users', (req, res) => res.json(getDb().users));
app.post('/api/users', (req, res) => { const db = getDb(); db.users.push(req.body); saveDb(db); res.json(db.users); });
app.put('/api/users/:id', (req, res) => { const db = getDb(); const i = db.users.findIndex(u => u.id === req.params.id); if (i!==-1) { db.users[i] = { ...db.users[i], ...req.body }; saveDb(db); res.json(db.users); } else res.sendStatus(404); });
app.delete('/api/users/:id', (req, res) => { const db = getDb(); db.users = db.users.filter(u => u.id !== req.params.id); saveDb(db); res.json(db.users); });
app.get('/api/settings', (req, res) => res.json(getDb().settings));
app.post('/api/settings', (req, res) => { const db = getDb(); db.settings = req.body; saveDb(db); res.json(db.settings); });
app.get('/api/chat', (req, res) => res.json(getDb().messages));
app.post('/api/chat', (req, res) => { const db = getDb(); const m = req.body; if(db.messages.length>500) db.messages.shift(); db.messages.push(m); saveDb(db); res.json(db.messages); });
app.put('/api/chat/:id', (req, res) => { const db = getDb(); const i = db.messages.findIndex(m => m.id === req.params.id); if (i!==-1) { db.messages[i] = { ...db.messages[i], ...req.body }; saveDb(db); res.json(db.messages); } else res.sendStatus(404); });
app.delete('/api/chat/:id', (req, res) => { const db = getDb(); db.messages = db.messages.filter(m => m.id !== req.params.id); saveDb(db); res.json(db.messages); });
app.get('/api/groups', (req, res) => res.json(getDb().groups));
app.post('/api/groups', (req, res) => { const db = getDb(); db.groups.push(req.body); saveDb(db); res.json(db.groups); });
app.put('/api/groups/:id', (req, res) => { const db = getDb(); const i = db.groups.findIndex(g => g.id === req.params.id); if(i!==-1){ db.groups[i] = { ...db.groups[i], ...req.body }; saveDb(db); res.json(db.groups); } else res.sendStatus(404); });
app.delete('/api/groups/:id', (req, res) => { const db = getDb(); db.groups = db.groups.filter(g => g.id !== req.params.id); saveDb(db); res.json(db.groups); });
app.get('/api/tasks', (req, res) => res.json(getDb().tasks));
app.post('/api/tasks', (req, res) => { const db = getDb(); db.tasks.push(req.body); saveDb(db); res.json(db.tasks); });
app.put('/api/tasks/:id', (req, res) => { const db = getDb(); const i = db.tasks.findIndex(t => t.id === req.params.id); if(i!==-1){ db.tasks[i] = req.body; saveDb(db); res.json(db.tasks); } else res.sendStatus(404); });
app.delete('/api/tasks/:id', (req, res) => { const db = getDb(); db.tasks = db.tasks.filter(t => t.id !== req.params.id); saveDb(db); res.json(db.tasks); });
app.get('/api/trade', (req, res) => res.json(getDb().tradeRecords || []));
app.post('/api/trade', (req, res) => { const db = getDb(); db.tradeRecords = db.tradeRecords || []; db.tradeRecords.push(req.body); saveDb(db); res.json(db.tradeRecords); });
app.put('/api/trade/:id', (req, res) => { const db = getDb(); db.tradeRecords = db.tradeRecords || []; const i = db.tradeRecords.findIndex(t => t.id === req.params.id); if(i!==-1){ db.tradeRecords[i] = req.body; saveDb(db); res.json(db.tradeRecords); } else res.sendStatus(404); });
app.delete('/api/trade/:id', (req, res) => { const db = getDb(); db.tradeRecords = (db.tradeRecords || []).filter(t => t.id !== req.params.id); saveDb(db); res.json(db.tradeRecords); });
app.post('/api/upload', (req, res) => { try { const { fileName, fileData } = req.body; const b = Buffer.from(fileData.split(',')[1], 'base64'); const n = Date.now() + '_' + fileName; fs.writeFileSync(path.join(UPLOADS_DIR, n), b); res.json({ url: `/uploads/${n}`, fileName: n }); } catch (e) { res.status(500).send('Err'); } });
app.get('/api/next-tracking-number', (req, res) => res.json({ nextTrackingNumber: findNextAvailableTrackingNumber(getDb()) }));
app.get('/api/orders', (req, res) => res.json(getDb().orders));
app.post('/api/orders', (req, res) => { const db = getDb(); const o = req.body; o.updatedAt = Date.now(); if(db.orders.some(x=>x.trackingNumber===o.trackingNumber)) o.trackingNumber = findNextAvailableTrackingNumber(db); db.orders.unshift(o); saveDb(db); res.json(db.orders); });

app.put('/api/orders/:id', (req, res) => { 
    const db = getDb(); 
    const i = db.orders.findIndex(x=>x.id===req.params.id); 
    if(i!==-1){ 
        const oldStatus = db.orders[i].status;
        db.orders[i] = req.body; 
        db.orders[i].updatedAt = Date.now(); 
        saveDb(db); 
        if (oldStatus !== db.orders[i].status) triggerNotifications(db.orders[i], db);
        res.json(db.orders); 
    } else {
        res.sendStatus(404);
    }
});

app.delete('/api/orders/:id', (req, res) => { const db = getDb(); db.orders = db.orders.filter(x=>x.id!==req.params.id); saveDb(db); res.json(db.orders); });
app.get('/api/backup', (req, res) => { res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename=backup.json'); res.json(getDb()); });
app.post('/api/restore', (req, res) => { if(req.body && req.body.orders) { saveDb(req.body); res.json({success:true}); } else res.sendStatus(400); });
app.get('*', (req, res) => { const p = path.join(__dirname, 'dist', 'index.html'); if(fs.existsSync(p)) res.sendFile(p); else res.send('Build first'); });

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
