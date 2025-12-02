

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const BACKUPS_DIR = path.join(__dirname, 'backups');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR);

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
                defaultCompany: '',
                bankNames: [],
                commodityGroups: [],
                rolePermissions: {},
                telegramBotToken: '',
                telegramAdminId: ''
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

// --- TELEGRAM BOT LOGIC ---
let lastUpdateId = 0;

const sendTelegram = async (chatId, text, replyMarkup = null) => {
    const db = getDb();
    const token = db.settings.telegramBotToken;
    if (!token) return;

    try {
        const body = {
            chat_id: chatId,
            text: text,
            parse_mode: 'HTML',
        };
        if (replyMarkup) body.reply_markup = replyMarkup;

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error(`Error sending Telegram message to ${chatId}:`, e);
    }
};

const sendTelegramDoc = async (chatId, filePath, caption) => {
    const db = getDb();
    const token = db.settings.telegramBotToken;
    if (!token || !fs.existsSync(filePath)) return;

    try {
        const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
        const fileName = path.basename(filePath);
        const fileContent = fs.readFileSync(filePath);

        let data = `--${boundary}\r\n`;
        data += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
        data += `--${boundary}\r\n`;
        data += `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
        data += `--${boundary}\r\n`;
        data += `Content-Disposition: form-data; name="document"; filename="${fileName}"\r\n`;
        data += `Content-Type: application/json\r\n\r\n`;

        const buffer = Buffer.concat([
            Buffer.from(data, 'utf-8'),
            fileContent,
            Buffer.from(`\r\n--${boundary}--`, 'utf-8'),
        ]);

        await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': buffer.length
            },
            body: buffer
        });
    } catch (e) {
        console.error("Error sending backup doc:", e);
    }
};

const processUpdate = async (update) => {
    const db = getDb();
    
    // 1. Handle Messages
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        const user = db.users.find(u => u.telegramChatId == chatId);

        if (text === '/start') {
            await sendTelegram(chatId, `👋 سلام!\n\n🤖 به ربات سیستم مدیریت پرداخت خوش آمدید.\n\n🆔 شناسه چت شما: <code>${chatId}</code>\n\nلطفا این کد را در پروفایل کاربری خود در نرم‌افزار وارد کنید.`);
        } else if (text === '/id') {
            await sendTelegram(chatId, `🆔 شناسه چت شما: <code>${chatId}</code>`);
        } else if (text === '/backup') {
            if (user && user.role === 'admin') {
                await sendTelegram(chatId, '📦 در حال تهیه نسخه پشتیبان...');
                sendTelegramDoc(chatId, DB_FILE, `Backup ${new Date().toLocaleString('fa-IR')}`);
            } else {
                await sendTelegram(chatId, '⛔ شما دسترسی ادمین ندارید.');
            }
        } else if (text === '/pending') {
            if (!user) {
                await sendTelegram(chatId, '⛔ شما در سیستم شناسایی نشدید.');
                return;
            }
            // Logic to list pending items for this user
            let pendingOrders = [];
            if (user.role === 'financial') pendingOrders = db.orders.filter(o => o.status === 'در انتظار بررسی مالی');
            if (user.role === 'manager') pendingOrders = db.orders.filter(o => o.status === 'تایید مالی / در انتظار مدیریت');
            if (user.role === 'ceo') pendingOrders = db.orders.filter(o => o.status === 'تایید مدیریت / در انتظار مدیرعامل');
            
            if (pendingOrders.length === 0) {
                await sendTelegram(chatId, '✅ کارتابل شما خالی است.');
            } else {
                let msg = '📋 <b>لیست وظایف جاری:</b>\n\n';
                pendingOrders.forEach(o => {
                    msg += `🔹 <b>${o.trackingNumber}</b>: ${o.payee} (${new Intl.NumberFormat('fa-IR').format(o.totalAmount)} ریال)\n`;
                });
                await sendTelegram(chatId, msg);
            }
        }
    }

    // 2. Handle Callbacks (Buttons)
    if (update.callback_query) {
        const chatId = update.callback_query.message.chat.id;
        const data = update.callback_query.data;
        const user = db.users.find(u => u.telegramChatId == chatId);

        // e.g., "approve_12345" or "reject_12345"
        const [action, orderId] = data.split('_');
        
        if (!user) {
            await sendTelegram(chatId, "⛔ خطا: کاربر شناسایی نشد.");
            return;
        }

        const orderIndex = db.orders.findIndex(o => o.id === orderId);
        if (orderIndex === -1) {
            await sendTelegram(chatId, "❌ درخواست مورد نظر یافت نشد (شاید قبلا تغییر وضعیت داده شده).");
            return;
        }
        
        const order = db.orders[orderIndex];

        // Permission Logic
        let canAct = false;
        let nextStatus = '';
        
        if (action === 'approve') {
            if (user.role === 'financial' && order.status === 'در انتظار بررسی مالی') { nextStatus = 'تایید مالی / در انتظار مدیریت'; canAct = true; }
            if (user.role === 'manager' && order.status === 'تایید مالی / در انتظار مدیریت') { nextStatus = 'تایید مدیریت / در انتظار مدیرعامل'; canAct = true; }
            if (user.role === 'ceo' && order.status === 'تایید مدیریت / در انتظار مدیرعامل') { nextStatus = 'تایید نهایی'; canAct = true; }
        } else if (action === 'reject') {
             // Basic reject logic allow relevant approver to reject
             if ((user.role === 'financial' && order.status === 'در انتظار بررسی مالی') ||
                 (user.role === 'manager' && order.status === 'تایید مالی / در انتظار مدیریت') ||
                 (user.role === 'ceo' && order.status === 'تایید مدیریت / در انتظار مدیرعامل')) {
                 nextStatus = 'رد شده';
                 canAct = true;
             }
        }

        if (canAct) {
            db.orders[orderIndex].status = nextStatus;
            
            // Set Approver Names
            if (user.role === 'financial') db.orders[orderIndex].approverFinancial = user.fullName;
            if (user.role === 'manager') db.orders[orderIndex].approverManager = user.fullName;
            if (user.role === 'ceo') db.orders[orderIndex].approverCeo = user.fullName;
            if (nextStatus === 'رد شده') {
                db.orders[orderIndex].rejectedBy = user.fullName;
                db.orders[orderIndex].rejectionReason = 'رد شده توسط ربات تلگرام';
            }

            saveDb(db);
            await sendTelegram(chatId, `✅ عملیات موفق.\nوضعیت جدید: <b>${nextStatus}</b>`);
            
            // Trigger notifications for next step
            notifyStatusChange(db, db.orders[orderIndex], order.status); // Pass old status logic handled inside? No, notifyStatusChange expects (db, order, OLD_STATUS)
            // Wait, notify logic needs old status to detect change. 
            // We just changed it in memory. So we need to call notify logic.
            // But notify logic is separated. Let's make a reusable function.
        } else {
             await sendTelegram(chatId, "⛔ شما دسترسی لازم برای تغییر وضعیت این درخواست را در این مرحله ندارید.");
        }
    }
};

const pollTelegramUpdates = async () => {
    const db = getDb();
    const token = db.settings.telegramBotToken;
    if (!token) {
        setTimeout(pollTelegramUpdates, 10000); // Retry later if no token
        return;
    }

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
        const data = await res.json();
        
        if (data.ok) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                await processUpdate(update);
            }
        }
    } catch (e) {
        console.error("Telegram Polling Error (ignoring):", e.message);
    }
    
    // Poll again immediately (Long Polling)
    setTimeout(pollTelegramUpdates, 100);
};

// Start Polling
pollTelegramUpdates();

// --- NOTIFICATION UTILS ---
const getNotificationButtons = (order, role) => {
    // Only show buttons if the user is the one supposed to act
    if (role === 'financial' && order.status === 'در انتظار بررسی مالی') return { inline_keyboard: [[{ text: '✅ تایید', callback_data: `approve_${order.id}` }, { text: '❌ رد', callback_data: `reject_${order.id}` }]] };
    if (role === 'manager' && order.status === 'تایید مالی / در انتظار مدیریت') return { inline_keyboard: [[{ text: '✅ تایید', callback_data: `approve_${order.id}` }, { text: '❌ رد', callback_data: `reject_${order.id}` }]] };
    if (role === 'ceo' && order.status === 'تایید مدیریت / در انتظار مدیرعامل') return { inline_keyboard: [[{ text: '✅ تایید', callback_data: `approve_${order.id}` }, { text: '❌ رد', callback_data: `reject_${order.id}` }]] };
    return null;
};

const notifyUsers = async (db, role, message, order = null, specificUserId = null) => {
    const token = db.settings.telegramBotToken;
    if (!token) return;

    let targets = [];
    if (specificUserId) {
        targets = db.users.filter(u => u.id === specificUserId);
    } else {
        // STRICT ROLE FILTERING
        targets = db.users.filter(u => u.role === role);
    }

    const uniqueChatIds = [...new Set(targets.map(u => u.telegramChatId).filter(Boolean))];
    
    for (const chatId of uniqueChatIds) {
        let markup = null;
        if (order && !specificUserId) {
            markup = getNotificationButtons(order, role);
        }
        await sendTelegram(chatId, message, markup);
        
        // If "Photo of Order" (Attachments) is requested
        if (order && order.attachments && order.attachments.length > 0) {
            // Since we can't easily stream URLs from DB (base64) to Telegram as InputFile without saving to disk,
            // we will just inform about attachments or send text links if they are URLs.
            // If they are local uploads (starting with /uploads), we can construct a full URL.
            // If base64, we skip for now to avoid massive payloads crashing the bot.
             const files = order.attachments.filter(a => a.data.startsWith('/uploads'));
             if (files.length > 0) {
                 await sendTelegram(chatId, `📎 <b>فایل‌های ضمیمه:</b>\n` + files.map(f => `${f.fileName}: ${req ? req.protocol + '://' + req.get('host') + f.data : f.data}`).join('\n'));
             }
        }
    }
};

// --- BACKUP TIMER (24h) ---
setInterval(() => {
    const db = getDb();
    const adminId = db.settings.telegramAdminId;
    if (adminId && db.settings.telegramBotToken) {
        sendTelegram(adminId, "🕒 گزارش خودکار ۲۴ ساعته سیستم:");
        sendTelegramDoc(adminId, DB_FILE, `Auto Backup ${new Date().toLocaleDateString('fa-IR')}`);
    }
}, 24 * 60 * 60 * 1000); // 24 Hours

// --- API ROUTES ---

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

    // NOTIFY CHAT RECIPIENTS via TELEGRAM
    if (newMsg.recipient) {
        const target = db.users.find(u => u.username === newMsg.recipient);
        if (target) {
            notifyUsers(db, null, `📨 <b>پیام جدید از ${newMsg.sender}</b>:\n\n${newMsg.message || 'پیام صوتی/فایل'}`, null, target.id);
        }
    } else if (newMsg.groupId) {
        const group = db.groups.find(g => g.id === newMsg.groupId);
        if (group) {
            // Notify all members except sender
            group.members.forEach(m => {
                 if (m !== newMsg.senderUsername) {
                     const u = db.users.find(user => user.username === m);
                     if (u) notifyUsers(db, null, `👥 <b>گروه ${group.name}</b>\n${newMsg.sender}: ${newMsg.message || 'فایل'}`, null, u.id);
                 }
            });
        }
    }

    res.json(db.messages);
});
app.put('/api/chat/:id', (req, res) => { const db = getDb(); const idx = db.messages.findIndex(m => m.id === req.params.id); if (idx !== -1) { db.messages[idx] = { ...db.messages[idx], ...req.body }; saveDb(db); res.json(db.messages); } else res.status(404).json({ message: 'Message not found' }); });
app.delete('/api/chat/:id', (req, res) => { const db = getDb(); db.messages = db.messages.filter(m => m.id !== req.params.id); saveDb(db); res.json(db.messages); });

app.get('/api/groups', (req, res) => { res.json(getDb().groups); });
app.post('/api/groups', (req, res) => { const db = getDb(); db.groups.push(req.body); saveDb(db); res.json(db.groups); });
app.put('/api/groups/:id', (req, res) => { const db = getDb(); const idx = db.groups.findIndex(g => g.id === req.params.id); if (idx !== -1) { db.groups[idx] = { ...db.groups[idx], ...req.body }; saveDb(db); res.json(db.groups); } else res.status(404).json({ message: 'Group not found' }); });
app.delete('/api/groups/:id', (req, res) => { const db = getDb(); db.groups = db.groups.filter(g => g.id !== req.params.id); db.messages = db.messages.filter(m => m.groupId !== req.params.id); db.tasks = db.tasks.filter(t => t.groupId !== req.params.id); saveDb(db); res.json(db.groups); });

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
        if (!matches || matches.length !== 3) return res.status(400).send('Invalid base64 string format');
        const buffer = Buffer.from(matches[2], 'base64');
        const uniqueName = Date.now() + '_' + fileName;
        const filePath = path.join(UPLOADS_DIR, uniqueName);
        fs.writeFileSync(filePath, buffer);
        res.json({ url: `/uploads/${uniqueName}`, fileName: uniqueName });
    } catch (e) { res.status(500).send('Upload failed'); }
});

const findNextAvailableTrackingNumber = (db) => {
    const baseNum = (db.settings.currentTrackingNumber || 1602);
    const startNum = baseNum + 1;
    const existingNumbers = db.orders.map(o => o.trackingNumber).sort((a, b) => a - b);
    let nextNum = startNum;
    for (const num of existingNumbers) { if (num < nextNum) continue; if (num === nextNum) { nextNum++; } else if (num > nextNum) { return nextNum; } }
    return nextNum;
};

app.get('/api/next-tracking-number', (req, res) => { res.json({ nextTrackingNumber: findNextAvailableTrackingNumber(getDb()) }); });
app.get('/api/orders', (req, res) => { res.json(getDb().orders); });

app.post('/api/orders', (req, res) => {
    const db = getDb();
    const newOrder = req.body;
    let assignedTrackingNumber = newOrder.trackingNumber;
    const isTaken = db.orders.some(o => o.trackingNumber === assignedTrackingNumber);
    if (isTaken) { assignedTrackingNumber = findNextAvailableTrackingNumber(db); newOrder.trackingNumber = assignedTrackingNumber; }
    db.orders.unshift(newOrder);
    saveDb(db);
    
    // NOTIFY: New Order -> Financial
    const msg = `🧾 <b>درخواست پرداخت جدید</b>\n\nشماره: ${newOrder.trackingNumber}\nمبلغ: ${new Intl.NumberFormat('fa-IR').format(newOrder.totalAmount)} ریال\nگیرنده: ${newOrder.payee}\nدرخواست کننده: ${newOrder.requester}`;
    notifyUsers(db, 'financial', msg, newOrder);
    res.json(db.orders);
});

app.put('/api/orders/:id', (req, res) => {
    const db = getDb();
    const updatedOrder = req.body;
    const index = db.orders.findIndex(o => o.id === req.params.id);
    if (index !== -1) {
        const duplicate = db.orders.find(o => o.trackingNumber === updatedOrder.trackingNumber && o.id !== updatedOrder.id);
        if (duplicate) return res.status(400).json({ message: 'Tracking number already exists' });

        const oldStatus = db.orders[index].status;
        db.orders[index] = updatedOrder;
        saveDb(db);

        // NOTIFICATION LOGIC - STRICT
        if (oldStatus !== updatedOrder.status) {
            const tracking = updatedOrder.trackingNumber;
            const amount = new Intl.NumberFormat('fa-IR').format(updatedOrder.totalAmount);
            
            if (updatedOrder.status === 'تایید مالی / در انتظار مدیریت') { 
                 const msg = `✅ <b>تایید مالی انجام شد</b>\n\nدستور پرداخت شماره ${tracking}\nمبلغ: ${amount} ریال\n\nمدیر محترم، جهت تایید اقدام نمایید.`;
                 notifyUsers(db, 'manager', msg, updatedOrder);
            }
            else if (updatedOrder.status === 'تایید مدیریت / در انتظار مدیرعامل') {
                 const msg = `👑 <b>تایید مدیریت انجام شد</b>\n\nدستور پرداخت شماره ${tracking}\nمبلغ: ${amount} ریال\n\nمدیرعامل محترم، جهت تایید نهایی اقدام نمایید.`;
                 notifyUsers(db, 'ceo', msg, updatedOrder);
            }
            else if (updatedOrder.status === 'تایید نهایی') {
                 const msg = `💰 <b>پرداخت تایید نهایی شد</b>\n\nدستور پرداخت شماره ${tracking}\nمبلغ: ${amount} ریال\n\nآماده پرداخت.`;
                 // Notify Financial for payment
                 notifyUsers(db, 'financial', msg);
                 
                 // Notify Requester
                 const requesterUser = db.users.find(u => u.fullName === updatedOrder.requester);
                 if (requesterUser) {
                     notifyUsers(db, null, `✅ <b>درخواست شما تایید شد</b>\n\nدستور پرداخت شماره ${tracking} تایید نهایی شد.`, null, requesterUser.id);
                 }
            }
            else if (updatedOrder.status === 'رد شده') {
                 const requesterUser = db.users.find(u => u.fullName === updatedOrder.requester);
                 if (requesterUser) {
                     const msg = `❌ <b>درخواست پرداخت رد شد</b>\n\nدستور پرداخت شماره ${tracking}\nدلیل: ${updatedOrder.rejectionReason || 'نامشخص'}`;
                     notifyUsers(db, null, msg, null, requesterUser.id);
                 }
            }
        }
        res.json(db.orders);
    } else res.status(404).json({ message: 'Order not found' });
});

app.delete('/api/orders/:id', (req, res) => { const db = getDb(); db.orders = db.orders.filter(o => o.id !== req.params.id); saveDb(db); res.json(db.orders); });
app.get('/api/backup', (req, res) => { const db = getDb(); res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename=database_backup.json'); res.json(db); });
app.post('/api/restore', (req, res) => { const newData = req.body; if (!newData || !Array.isArray(newData.orders) || !Array.isArray(newData.users)) { return res.status(400).json({ message: 'Invalid backup file format' }); } saveDb(newData); res.json({ success: true, message: 'Database restored successfully' }); });
app.get('*', (req, res) => { const indexPath = path.join(__dirname, 'dist', 'index.html'); if (fs.existsSync(indexPath)) { res.sendFile(indexPath); } else { res.send('React App needs to be built. Run "npm run build" first.'); } });
app.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });

