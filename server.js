
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

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
// N8N ORCHESTRATOR LOGIC
// ==========================================

async function processN8NRequest(user, messageText, audioData = null, audioMimeType = null) {
    const db = getDb();
    const webhookUrl = db.settings.n8nWebhookUrl;

    if (!webhookUrl) {
        return "خطا: آدرس وب‌هوک n8n در تنظیمات سیستم وارد نشده است.";
    }

    try {
        // 1. Prepare Payload for n8n
        // n8n will use OpenAI to understand intent and return a JSON action
        const payload = {
            user: {
                fullName: user.fullName,
                role: user.role,
                id: user.id
            },
            message: messageText,
            audio: audioData ? {
                data: audioData,
                mimeType: audioMimeType
            } : null,
            timestamp: new Date().toISOString()
        };

        // 2. Call n8n Webhook
        const response = await axios.post(webhookUrl, payload, { timeout: 30000 }); // 30s timeout
        const data = response.data;

        // 3. Process n8n Response (Expects JSON with 'action' or 'reply')
        // Format expected from n8n: { type: 'tool_call', tool: '...', args: {...} } OR { type: 'message', text: '...' }
        
        if (data.type === 'message') {
            return data.text;
        } 
        
        if (data.type === 'tool_call') {
            return handleToolExecution(data.tool, data.args, user);
        }

        // Fallback if structure is unknown but text exists
        if (data.text || data.reply) return data.text || data.reply;
        if (typeof data === 'string') return data;

        return "پاسخ نامشخصی از سرور هوش مصنوعی دریافت شد.";

    } catch (error) {
        console.error("n8n Error:", error.message);
        return "متاسفانه در ارتباط با سرور هوش مصنوعی (n8n) خطایی رخ داد.";
    }
}

function handleToolExecution(toolName, args, user) {
    const db = getDb();
    
    if (toolName === 'register_payment_order') {
        const trackingNum = findNextAvailableTrackingNumber(db);
        const newOrder = {
            id: Date.now().toString(36),
            trackingNumber: trackingNum,
            date: new Date().toISOString().split('T')[0],
            payee: args.payee,
            totalAmount: Number(args.amount),
            description: args.description,
            status: 'در انتظار بررسی مالی',
            requester: user.fullName,
            paymentDetails: [{
                id: Date.now().toString(36) + 'd',
                method: 'حواله بانکی',
                amount: Number(args.amount),
                description: 'ثبت شده توسط هوش مصنوعی'
            }],
            payingCompany: args.company || db.settings.defaultCompany,
            createdAt: Date.now()
        };
        db.orders.unshift(newOrder);
        saveDb(db);
        return `دستور پرداخت با موفقیت ثبت شد.\nشماره: ${trackingNum}\nمبلغ: ${Number(args.amount).toLocaleString('fa-IR')} ریال\nگیرنده: ${args.payee}`;
    }

    if (toolName === 'get_financial_summary') {
        if (!['admin', 'manager', 'ceo', 'financial'].includes(user.role)) {
            return "شما دسترسی لازم برای مشاهده گزارش مالی را ندارید.";
        }
        const pending = db.orders.filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده').length;
        const approved = db.orders.filter(o => o.status === 'تایید نهایی').length;
        const total = db.orders.filter(o => o.status === 'تایید نهایی').reduce((sum, o) => sum + o.totalAmount, 0);
        return `📊 گزارش وضعیت مالی:\n\n🟡 در انتظار: ${pending} مورد\n✅ تایید شده: ${approved} مورد\n💰 مجموع پرداختی: ${total.toLocaleString('fa-IR')} ریال`;
    }

    if (toolName === 'search_trade_file') {
        if (user.role === 'user' && !user.canManageTrade) {
            return "شما دسترسی به بخش بازرگانی ندارید.";
        }
        const term = (args.query || '').toLowerCase();
        const found = (db.tradeRecords || []).filter(r => 
            r.fileNumber.includes(term) || 
            r.goodsName.includes(term) || 
            r.sellerName.includes(term)
        ).slice(0, 3);
        
        if (found.length === 0) return "هیچ پرونده‌ای با این مشخصات یافت نشد.";
        
        let result = "📂 نتایج جستجو:\n";
        found.forEach(f => {
            result += `\n- پرونده: ${f.fileNumber}\n  کالا: ${f.goodsName}\n  وضعیت: ${f.status}\n`;
        });
        return result;
    }

    return `دستور ناشناخته: ${toolName}`;
}


// ==========================================
// WHATSAPP & TELEGRAM SETUP
// ==========================================

let whatsappClient = null;
let telegramBot = null;
let MessageMedia = null; 
let isWhatsAppReady = false;
let currentQR = null; 
let whatsappUser = null; 

// --- TELEGRAM INIT ---
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
                
                // Auth Check: Match Chat ID
                const user = db.users.find(u => u.telegramChatId === chatId);

                if (!user) {
                    telegramBot.sendMessage(chatId, `⛔ شما دسترسی ندارید.\nChat ID شما: ${chatId}\nلطفا این کد را به مدیر سیستم بدهید تا دسترسی شما را فعال کند.`);
                    return;
                }

                // Handle Audio/Voice
                if (msg.voice || msg.audio) {
                    const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
                    const fileLink = await telegramBot.getFileLink(fileId);
                    
                    // Fetch file bytes
                    const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
                    const base64 = Buffer.from(response.data).toString('base64');
                    
                    const mimeType = msg.voice ? 'audio/ogg' : 'audio/mpeg'; 
                    
                    telegramBot.sendChatAction(chatId, 'typing');
                    const reply = await processN8NRequest(user, null, base64, mimeType);
                    telegramBot.sendMessage(chatId, reply);
                } else if (msg.text) {
                    telegramBot.sendChatAction(chatId, 'typing');
                    const reply = await processN8NRequest(user, msg.text);
                    telegramBot.sendMessage(chatId, reply);
                }
            });
            
            telegramBot.on('polling_error', (error) => {
                console.error("Telegram Polling Error:", error.code);
            });
        }
    } catch (e) {
        console.warn('Telegram Bot Init Failed (Token missing or library issue).');
    }
};

const initWhatsApp = async () => {
    try {
        console.log('Attempting to load WhatsApp modules...');
        const wwebjs = await import('whatsapp-web.js');
        const { Client, LocalAuth, MessageMedia: MM } = wwebjs.default || wwebjs;
        MessageMedia = MM; 
        
        const qrcodeModule = await import('qrcode-terminal');
        const qrcode = qrcodeModule.default || qrcodeModule;

        const getBrowserPath = () => {
            const platform = process.platform;
            let paths = [];
            if (platform === 'win32') {
                paths = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'];
            } else if (platform === 'linux') {
                paths = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
            } else if (platform === 'darwin') {
                paths = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
            }
            for (const p of paths) { if (fs.existsSync(p)) return p; }
            return null;
        };

        const executablePath = getBrowserPath();
        
        whatsappClient = new Client({
            authStrategy: new LocalAuth({ dataPath: WAUTH_DIR }),
            puppeteer: { headless: true, executablePath: executablePath, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
        });

        whatsappClient.on('qr', (qr) => {
            currentQR = qr; isWhatsAppReady = false;
            qrcode.generate(qr, { small: true });
        });

        whatsappClient.on('ready', () => {
            console.log('\n>>> WhatsApp Client is READY! <<<\n');
            isWhatsAppReady = true; currentQR = null; whatsappUser = whatsappClient.info?.wid?.user;
        });

        // --- WHATSAPP MESSAGE HANDLER ---
        whatsappClient.on('message', async (msg) => {
            // 1. Identify User
            const senderNumber = msg.from.replace('@c.us', '');
            const db = getDb();
            // Normalize phone number matching (remove 98/0)
            const normalize = (n) => n ? n.replace(/^98|^0/, '') : '';
            const user = db.users.find(u => normalize(u.phoneNumber) === normalize(senderNumber));

            if (!user) {
                // Ignore unknown users
                return; 
            }

            // 2. Handle Inputs
            if (msg.hasMedia) {
                const media = await msg.downloadMedia();
                if (media.mimetype.startsWith('audio/')) {
                    // Process Audio
                    const reply = await processN8NRequest(user, null, media.data, media.mimetype);
                    msg.reply(reply);
                }
            } else {
                // Process Text
                const reply = await processN8NRequest(user, msg.body);
                msg.reply(reply);
            }
        });

        whatsappClient.initialize().catch(err => console.error("WA Init Error:", err.message));

    } catch (e) {
        console.warn('WhatsApp Module Error:', e.message);
    }
};

initWhatsApp();
setTimeout(initTelegram, 5000); // Delay Telegram init slightly

// --- API ROUTES ---

app.get('/api/whatsapp/status', (req, res) => {
    res.json({ ready: isWhatsAppReady, qr: currentQR, user: whatsappUser });
});

app.get('/api/whatsapp/groups', async (req, res) => {
    if (!whatsappClient || !isWhatsAppReady) return res.status(503).json({ success: false, message: 'WhatsApp not ready' });
    try {
        const chats = await whatsappClient.getChats();
        const groups = chats.filter(chat => chat.isGroup).map(chat => ({ id: chat.id._serialized, name: chat.name }));
        res.json({ success: true, groups });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/whatsapp/logout', async (req, res) => {
    if (whatsappClient) {
        try { await whatsappClient.logout(); isWhatsAppReady = false; whatsappUser = null; res.json({ success: true }); } 
        catch (e) { res.status(500).json({ success: false, message: e.message }); }
    } else res.status(400).json({ success: false });
});

app.post('/api/send-whatsapp', async (req, res) => {
    if (!whatsappClient || !isWhatsAppReady) return res.status(503).json({ success: false, message: 'Bot not ready' });
    const { number, message, mediaData } = req.body;
    if (!number) return res.status(400).json({ error: 'Missing number' });
    try {
        let chatId = (number.includes('-') || number.includes('@g.us')) ? (number.endsWith('@g.us') ? number : `${number}@g.us`) : `${number.replace(/\D/g, '').replace(/^09/, '989').replace(/^9/, '989')}@c.us`;
        if (mediaData && mediaData.data) {
            const media = new MessageMedia(mediaData.mimeType || 'image/png', mediaData.data, mediaData.filename);
            await whatsappClient.sendMessage(chatId, media, { caption: message || '' });
        } else if (message) {
            await whatsappClient.sendMessage(chatId, message);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

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
app.post('/api/chat', (req, res) => { const db = getDb(); const newMsg = req.body; if (db.messages.length > 500) db.messages = db.messages.slice(-500); db.messages.push(newMsg); saveDb(db); res.json(db.messages); });
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
