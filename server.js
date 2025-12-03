
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

// --- TELEGRAM BOT UTILS ---
let lastUpdateId = 0;
// Store user state for creation wizard: { chatId: { step: 'PAYEE' | 'AMOUNT' | 'DESC' | 'COMPANY', data: {} } }
const userFlows = {}; 

const MAIN_MENU = {
    keyboard: [
        [{ text: "📂 کارتابل من" }, { text: "📊 گزارشات" }],
        [{ text: "➕ ثبت دستور پرداخت" }, { text: "👤 پروفایل من" }]
    ],
    resize_keyboard: true,
    persistent: true
};

const CANCEL_MENU = {
    keyboard: [[{ text: "❌ انصراف" }]],
    resize_keyboard: true
};

const constructMultipart = (chatId, text, filePath, fileField = 'document', caption = '') => {
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    let data = `--${boundary}\r\n`;
    data += `Content-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`;
    data += `--${boundary}\r\n`;
    if (text) {
        data += `Content-Disposition: form-data; name="text"\r\n\r\n${text}\r\n`;
        data += `--${boundary}\r\n`;
    }
    if (caption) {
        data += `Content-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`;
        data += `--${boundary}\r\n`;
    }
    data += `Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\n`;
    data += `Content-Type: application/octet-stream\r\n\r\n`;

    return {
        boundary,
        body: Buffer.concat([
            Buffer.from(data, 'utf-8'),
            fileContent,
            Buffer.from(`\r\n--${boundary}--`, 'utf-8'),
        ])
    };
};

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
        console.error(`Error sending Telegram to ${chatId}:`, e.message);
    }
};

const sendTelegramFile = async (chatId, filePath, caption = '', type = 'document') => {
    const db = getDb();
    const token = db.settings.telegramBotToken;
    if (!token || !fs.existsSync(filePath)) return;

    try {
        const { boundary, body } = constructMultipart(chatId, null, filePath, type, caption);
        await fetch(`https://api.telegram.org/bot${token}/send${type.charAt(0).toUpperCase() + type.slice(1)}`, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            },
            body: body
        });
    } catch (e) {
        console.error(`Error sending file to ${chatId}:`, e.message);
    }
};

// Function to set the bot menu commands
const setBotCommands = async () => {
    const db = getDb();
    const token = db.settings.telegramBotToken;
    if (!token) return;

    try {
        await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                commands: [
                    { command: 'start', description: 'شروع / منوی اصلی' },
                    { command: 'pending', description: 'کارتابل من' },
                    { command: 'id', description: 'اطلاعات کاربری' }
                ]
            })
        });
    } catch (e) {
        console.error("Failed to set bot commands", e);
    }
};

// Initial call to set commands on server start (and periodically)
setInterval(setBotCommands, 3600000); // Check every hour
setTimeout(setBotCommands, 5000); // And on startup

const generateOrderReceipt = (order) => {
    const statusIcons = {
        'در انتظار بررسی مالی': '🟡',
        'تایید مالی / در انتظار مدیریت': '🟠',
        'تایید مدیریت / در انتظار مدیرعامل': '🟠',
        'تایید نهایی': '🟢',
        'رد شده': '🔴'
    };
    const icon = statusIcons[order.status] || '⚪';
    
    let html = `🧾 <b>رسید دستور پرداخت</b>\n`;
    html += `<b>شماره:</b> <code>${order.trackingNumber}</code>\n`;
    html += `➖➖➖➖➖➖➖➖\n`;
    html += `👤 <b>گیرنده:</b> ${order.payee}\n`;
    html += `💰 <b>مبلغ کل:</b> ${formatCurrency(order.totalAmount)} ریال\n`;
    html += `🏢 <b>محل پرداخت:</b> ${order.payingCompany || 'نامشخص'}\n`; 
    html += `📝 <b>شرح کلی:</b> ${order.description}\n`;
    
    // Detailed Payments
    if (order.paymentDetails && order.paymentDetails.length > 0) {
        html += `\n🔽 <b>جزئیات پرداخت:</b>\n`;
        order.paymentDetails.forEach((d, i) => {
            const detailInfo = d.method === 'چک' ? `(چک: ${d.chequeNumber || '-'})` : 
                               d.method === 'حواله بانکی' ? `(بانک: ${d.bankName || '-'})` : '';
            html += `${i+1}. <b>${d.method}</b>: ${formatCurrency(d.amount)} ${detailInfo}\n`;
            if (d.description) html += `   └ <i>${d.description}</i>\n`;
        });
    }

    html += `➖➖➖➖➖➖➖➖\n`;
    html += `👤 <b>درخواست کننده:</b> ${order.requester}\n`;
    html += `📅 <b>تاریخ:</b> ${toShamsi(order.date)}\n`;
    html += `📊 <b>وضعیت:</b> ${icon} ${order.status}\n`;
    
    if (order.status === 'رد شده' && order.rejectionReason) {
        html += `⛔ <b>دلیل رد:</b> ${order.rejectionReason}\n`;
    }

    return html;
};

// --- NOTIFICATION LOGIC ---
const getNotificationButtons = (order, role) => {
    if ((role === 'financial' && order.status === 'در انتظار بررسی مالی') ||
        (role === 'manager' && order.status === 'تایید مالی / در انتظار مدیریت') ||
        (role === 'ceo' && order.status === 'تایید مدیریت / در انتظار مدیرعامل')) {
        return {
            inline_keyboard: [
                [
                    { text: '✅ تایید درخواست', callback_data: `approve_${order.id}` },
                    { text: '❌ رد درخواست', callback_data: `reject_${order.id}` }
                ]
            ]
        };
    }
    return null;
};

const notifyUsers = async (db, role, message, order = null, specificUserId = null) => {
    const token = db.settings.telegramBotToken;
    if (!token) return;

    let targets = [];
    if (specificUserId) {
        targets = db.users.filter(u => u.id === specificUserId);
    } else {
        targets = db.users.filter(u => u.role === role);
    }

    const uniqueChatIds = [...new Set(targets.map(u => u.telegramChatId).filter(Boolean))];
    const adminId = db.settings.telegramAdminId;

    // Send to targets
    for (const chatId of uniqueChatIds) {
        let markup = null;
        if (order && !specificUserId) {
            markup = getNotificationButtons(order, role);
        }
        await sendTelegram(chatId, message, markup);
        
        // Send Attachments if available (Local files only)
        if (order && order.attachments) {
            for (const att of order.attachments) {
                if (att.data.startsWith('/uploads/')) {
                    const filePath = path.join(__dirname, att.data);
                    await sendTelegramFile(chatId, filePath, `📎 ضمیمه: ${att.fileName}`);
                }
            }
        }
    }

    // Admin Monitoring (Send copy if admin is not the target)
    if (adminId && !uniqueChatIds.includes(adminId)) {
        await sendTelegram(adminId, `👁‍🗨 <b>گزارش مدیر سیستم:</b>\n\n${message}`);
    }
};

// --- TELEGRAM PROCESSING ---
const processUpdate = async (update) => {
    const db = getDb();
    
    // 1. Text Messages & Creation Wizard
    if (update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        const user = db.users.find(u => u.telegramChatId == chatId);

        // --- GLOBAL CANCEL ---
        if (text === '❌ انصراف') {
            delete userFlows[chatId];
            await sendTelegram(chatId, "عملیات لغو شد.", MAIN_MENU);
            return;
        }

        // --- CREATION WIZARD FLOW ---
        if (userFlows[chatId]) {
            const flow = userFlows[chatId];
            
            if (flow.step === 'COMPANY') {
                flow.data.company = text;
                flow.step = 'PAYEE';
                await sendTelegram(chatId, "👤 نام گیرنده وجه را وارد کنید:", CANCEL_MENU);
                return;
            }
            if (flow.step === 'PAYEE') {
                flow.data.payee = text;
                flow.step = 'AMOUNT';
                await sendTelegram(chatId, "💰 مبلغ را به ریال وارد کنید (فقط عدد):", CANCEL_MENU);
                return;
            }
            if (flow.step === 'AMOUNT') {
                const amount = parseInt(text.replace(/,/g, '')); // Remove commas if user typed them
                if (isNaN(amount) || amount <= 0) {
                    await sendTelegram(chatId, "⛔ مبلغ نامعتبر است. لطفا عدد صحیح وارد کنید:");
                    return;
                }
                flow.data.amount = amount;
                flow.step = 'DESC';
                await sendTelegram(chatId, "📝 شرح پرداخت را وارد کنید:", CANCEL_MENU);
                return;
            }
            if (flow.step === 'DESC') {
                flow.data.description = text;
                
                // Finalize Order
                const trackingNum = findNextAvailableTrackingNumber(db);
                const nowIso = new Date().toISOString().split('T')[0];
                
                const newOrder = {
                    id: generateUUID(),
                    trackingNumber: trackingNum,
                    date: nowIso,
                    payee: flow.data.payee,
                    totalAmount: flow.data.amount,
                    description: flow.data.description,
                    payingCompany: flow.data.company,
                    status: 'در انتظار بررسی مالی',
                    requester: user ? user.fullName : `Telegram User ${chatId}`,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    paymentDetails: [{
                        id: generateUUID(),
                        method: 'حواله بانکی',
                        amount: flow.data.amount,
                        bankName: 'نامشخص (ثبت با ربات)',
                        description: 'ثبت شده از طریق ربات تلگرام'
                    }],
                    attachments: []
                };

                db.orders.unshift(newOrder);
                saveDb(db);

                // Clear flow
                delete userFlows[chatId];

                // Notify User
                await sendTelegram(chatId, `✅ <b>دستور پرداخت با موفقیت ثبت شد.</b>\nشماره پیگیری: ${trackingNum}`, MAIN_MENU);
                
                // Notify Financial Manager
                notifyUsers(db, 'financial', generateOrderReceipt(newOrder), newOrder);
                return;
            }
        }

        // --- MAIN COMMANDS ---
        if (text === '/start') {
            await sendTelegram(chatId, `👋 سلام ${user ? user.fullName : 'کاربر گرامی'}!\n\n🤖 به ربات سیستم مدیریت پرداخت خوش آمدید.\nجهت استفاده از امکانات، از منوی زیر استفاده کنید.`, MAIN_MENU);
        
        } else if (text === '👤 پروفایل من' || text === '/id') {
            const roleName = user ? (user.role === 'admin' ? 'مدیر سیستم' : user.role === 'ceo' ? 'مدیرعامل' : user.role === 'financial' ? 'مدیر مالی' : user.role === 'manager' ? 'مدیر داخلی' : 'کاربر عادی') : 'ناشناس';
            await sendTelegram(chatId, `🆔 <b>اطلاعات کاربری</b>\n\n👤 نام: ${user ? user.fullName : 'ثبت نشده'}\n🔑 نقش: ${roleName}\n📱 شناسه چت: <code>${chatId}</code>`, MAIN_MENU);
        
        } else if (text === '📊 گزارشات') {
            if (!user) { await sendTelegram(chatId, "⛔ شما در سیستم شناسایی نشدید."); return; }
            
            const pendingCount = db.orders.filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده').length;
            const today = new Date().toISOString().split('T')[0];
            const todayCount = db.orders.filter(o => o.date === today).length;
            const myPending = db.orders.filter(o => o.requester === user.fullName && o.status !== 'تایید نهایی' && o.status !== 'رد شده').length;
            
            let report = `📊 <b>گزارش وضعیت سیستم</b>\n\n`;
            report += `🕒 کل سفارشات در جریان: ${pendingCount}\n`;
            report += `📅 سفارشات ثبت شده امروز: ${todayCount}\n`;
            report += `📂 سفارشات باز شما: ${myPending}\n`;
            report += `\n<i>جهت گزارش دقیق‌تر به پنل تحت وب مراجعه کنید.</i>`;
            
            await sendTelegram(chatId, report, MAIN_MENU);

        } else if (text === '📂 کارتابل من' || text === '/pending') {
            if (!user) { await sendTelegram(chatId, "⛔ شما در سیستم شناسایی نشدید."); return; }
            
            let pendingOrders = [];
            // Role based filtering
            if (user.role === 'financial') pendingOrders = db.orders.filter(o => o.status === 'در انتظار بررسی مالی');
            else if (user.role === 'manager') pendingOrders = db.orders.filter(o => o.status === 'تایید مالی / در انتظار مدیریت');
            else if (user.role === 'ceo') pendingOrders = db.orders.filter(o => o.status === 'تایید مدیریت / در انتظار مدیرعامل');
            else if (user.role === 'admin') {
                // Admin sees everything pending
                 pendingOrders = db.orders.filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده');
            }
            
            if (pendingOrders.length === 0) {
                await sendTelegram(chatId, '✅ کارتابل شما خالی است.', MAIN_MENU);
            } else {
                await sendTelegram(chatId, `📂 <b>${pendingOrders.length} درخواست در کارتابل شما موجود است:</b>`);
                for (const o of pendingOrders) {
                    const msg = generateOrderReceipt(o);
                    // Only show buttons if the user has the right role for the current status
                    const markup = (user.role === 'admin' || 
                                   (user.role === 'financial' && o.status === 'در انتظار بررسی مالی') ||
                                   (user.role === 'manager' && o.status === 'تایید مالی / در انتظار مدیریت') ||
                                   (user.role === 'ceo' && o.status === 'تایید مدیریت / در انتظار مدیرعامل')) 
                                   ? getNotificationButtons(o, user.role === 'admin' ? (o.status === 'در انتظار بررسی مالی' ? 'financial' : o.status === 'تایید مالی / در انتظار مدیریت' ? 'manager' : 'ceo') : user.role) 
                                   : null;
                                   
                    await sendTelegram(chatId, msg, markup);
                }
            }

        } else if (text === '➕ ثبت دستور پرداخت') {
            if (!user) { await sendTelegram(chatId, "⛔ ابتدا باید در سیستم توسط ادمین تعریف شوید."); return; }
            
            // Start Wizard
            userFlows[chatId] = { step: 'COMPANY', data: {} };
            
            // Companies Keyboard
            const companies = db.settings.companyNames || [];
            let keyboard = [];
            if (companies.length > 0) {
                // Chunk into rows of 2
                for (let i = 0; i < companies.length; i += 2) {
                    const row = [{ text: companies[i] }];
                    if (companies[i+1]) row.push({ text: companies[i+1] });
                    keyboard.push(row);
                }
            }
            keyboard.push([{ text: "❌ انصراف" }]);

            await sendTelegram(chatId, "🏢 لطفا شرکت پرداخت کننده را انتخاب کنید یا نام آن را بنویسید:", {
                keyboard: keyboard,
                resize_keyboard: true
            });

        } else if (text === '/backup') {
            if (user && user.role === 'admin') {
                await sendTelegram(chatId, '📦 در حال تهیه نسخه پشتیبان...');
                sendTelegramFile(chatId, DB_FILE, `Backup ${new Date().toLocaleString('fa-IR')}`, 'document');
            } else {
                await sendTelegram(chatId, '⛔ شما دسترسی ادمین ندارید.');
            }
        }
    }

    // 2. Callback Queries (Buttons)
    if (update.callback_query) {
        const chatId = update.callback_query.message.chat.id;
        const data = update.callback_query.data;
        const user = db.users.find(u => u.telegramChatId == chatId);
        const [action, orderId] = data.split('_');
        
        if (!user) return;

        const orderIndex = db.orders.findIndex(o => o.id === orderId);
        if (orderIndex === -1) {
            await sendTelegram(chatId, "❌ درخواست یافت نشد.");
            return;
        }
        
        const order = db.orders[orderIndex];
        let nextStatus = '';
        let canAct = false;

        // Permission Check Logic (Allow Admin to override or specific role)
        const isFinancialStep = order.status === 'در انتظار بررسی مالی';
        const isManagerStep = order.status === 'تایید مالی / در انتظار مدیریت';
        const isCeoStep = order.status === 'تایید مدیریت / در انتظار مدیرعامل';

        if (action === 'approve') {
            if ((user.role === 'financial' || user.role === 'admin') && isFinancialStep) { nextStatus = 'تایید مالی / در انتظار مدیریت'; canAct = true; }
            if ((user.role === 'manager' || user.role === 'admin') && isManagerStep) { nextStatus = 'تایید مدیریت / در انتظار مدیرعامل'; canAct = true; }
            if ((user.role === 'ceo' || user.role === 'admin') && isCeoStep) { nextStatus = 'تایید نهایی'; canAct = true; }
        } else if (action === 'reject') {
             if (((user.role === 'financial' || user.role === 'admin') && isFinancialStep) ||
                 ((user.role === 'manager' || user.role === 'admin') && isManagerStep) ||
                 ((user.role === 'ceo' || user.role === 'admin') && isCeoStep)) {
                 nextStatus = 'رد شده';
                 canAct = true;
             }
        }

        if (canAct) {
            // Update DB
            db.orders[orderIndex].status = nextStatus;
            db.orders[orderIndex].updatedAt = Date.now(); 
            if (user.role === 'financial' || (user.role === 'admin' && isFinancialStep)) db.orders[orderIndex].approverFinancial = user.fullName;
            if (user.role === 'manager' || (user.role === 'admin' && isManagerStep)) db.orders[orderIndex].approverManager = user.fullName;
            if (user.role === 'ceo' || (user.role === 'admin' && isCeoStep)) db.orders[orderIndex].approverCeo = user.fullName;
            
            if (nextStatus === 'رد شده') {
                db.orders[orderIndex].rejectedBy = user.fullName;
                db.orders[orderIndex].rejectionReason = 'رد شده توسط ربات تلگرام';
            }
            saveDb(db);

            // Answer Callback to stop loading animation
            try {
                const token = db.settings.telegramBotToken;
                await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: update.callback_query.id, text: `وضعیت به ${nextStatus} تغییر کرد` })
                });
            } catch(e) {}

            // Update original message to remove buttons and show result
            try {
                 const token = db.settings.telegramBotToken;
                 await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        chat_id: chatId, 
                        message_id: update.callback_query.message.message_id,
                        text: generateOrderReceipt(db.orders[orderIndex]) + `\n\n✅ <b>توسط ${user.fullName} ${action === 'approve' ? 'تایید' : 'رد'} شد.</b>`,
                        parse_mode: 'HTML'
                    })
                });
            } catch(e) {}

            // Notify Next Step
            const updatedOrder = db.orders[orderIndex];
            if (nextStatus === 'تایید مالی / در انتظار مدیریت') notifyUsers(db, 'manager', generateOrderReceipt(updatedOrder), updatedOrder);
            if (nextStatus === 'تایید مدیریت / در انتظار مدیرعامل') notifyUsers(db, 'ceo', generateOrderReceipt(updatedOrder), updatedOrder);
            if (nextStatus === 'تایید نهایی') {
                notifyUsers(db, 'financial', `💰 <b>پرداخت تایید شد:</b>\n\n` + generateOrderReceipt(updatedOrder));
                const requester = db.users.find(u => u.fullName === updatedOrder.requester);
                if (requester) notifyUsers(db, null, `✅ <b>درخواست شما تایید شد</b>\n\n` + generateOrderReceipt(updatedOrder), null, requester.id);
            }
            if (nextStatus === 'رد شده') {
                const requester = db.users.find(u => u.fullName === updatedOrder.requester);
                if (requester) notifyUsers(db, null, `❌ <b>درخواست شما رد شد</b>\n\n` + generateOrderReceipt(updatedOrder), null, requester.id);
            }

        } else {
            await sendTelegram(chatId, "⛔ وضعیت سفارش تغییر کرده یا شما دسترسی ندارید.");
        }
    }
};

const pollTelegramUpdates = async () => {
    const db = getDb();
    const token = db.settings.telegramBotToken;
    if (!token) { setTimeout(pollTelegramUpdates, 10000); return; }

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
        console.error("Telegram Poll Error:", e.message);
    }
    setTimeout(pollTelegramUpdates, 100);
};

pollTelegramUpdates();

// --- BACKUP TIMER (8 HOURS) ---
setInterval(() => {
    const db = getDb();
    const adminId = db.settings.telegramAdminId;
    if (adminId && db.settings.telegramBotToken) {
        sendTelegram(adminId, "🕒 گزارش خودکار ۸ ساعته سیستم:");
        sendTelegramFile(adminId, DB_FILE, `Auto Backup ${new Date().toLocaleDateString('fa-IR')}`, 'document');
    }
}, 8 * 60 * 60 * 1000); // 8 Hours

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

    // Telegram Chat Notification
    if (newMsg.recipient) {
        const target = db.users.find(u => u.username === newMsg.recipient);
        if (target) notifyUsers(db, null, `📨 <b>پیام خصوصی از ${newMsg.sender}</b>:\n${newMsg.message || 'فایل/صدا'}`, null, target.id);
    } else if (newMsg.groupId) {
        const group = db.groups.find(g => g.id === newMsg.groupId);
        if (group) {
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
    newOrder.updatedAt = Date.now(); // Set updated time
    let assignedTrackingNumber = newOrder.trackingNumber;
    const isTaken = db.orders.some(o => o.trackingNumber === assignedTrackingNumber);
    if (isTaken) { assignedTrackingNumber = findNextAvailableTrackingNumber(db); newOrder.trackingNumber = assignedTrackingNumber; }
    db.orders.unshift(newOrder);
    saveDb(db);
    
    // Notify Financial
    notifyUsers(db, 'financial', generateOrderReceipt(newOrder), newOrder);
    res.json(db.orders);
});

app.put('/api/orders/:id', (req, res) => {
    const db = getDb();
    const updatedOrder = req.body;
    updatedOrder.updatedAt = Date.now(); // Update timestamp
    const index = db.orders.findIndex(o => o.id === req.params.id);
    if (index !== -1) {
        const oldStatus = db.orders[index].status;
        db.orders[index] = updatedOrder;
        saveDb(db);

        // Notify Logic on Status Change
        if (oldStatus !== updatedOrder.status) {
            const receipt = generateOrderReceipt(updatedOrder);

            if (updatedOrder.status === 'تایید مالی / در انتظار مدیریت') notifyUsers(db, 'manager', receipt, updatedOrder);
            else if (updatedOrder.status === 'تایید مدیریت / در انتظار مدیرعامل') notifyUsers(db, 'ceo', receipt, updatedOrder);
            else if (updatedOrder.status === 'تایید نهایی') {
                 notifyUsers(db, 'financial', `💰 <b>پرداخت تایید نهایی شد:</b>\n\n` + receipt);
                 const reqUser = db.users.find(u => u.fullName === updatedOrder.requester);
                 if (reqUser) notifyUsers(db, null, `✅ <b>درخواست شما تایید نهایی شد</b>\n\n` + receipt, null, reqUser.id);
            }
            else if (updatedOrder.status === 'رد شده') {
                 const reqUser = db.users.find(u => u.fullName === updatedOrder.requester);
                 if (reqUser) notifyUsers(db, null, `❌ <b>درخواست شما رد شد</b>\n\n` + receipt, null, reqUser.id);
            }
        }
        res.json(db.orders);
    } else res.status(404).json({ message: 'Order not found' });
});

app.delete('/api/orders/:id', (req, res) => { const db = getDb(); db.orders = db.orders.filter(o => o.id !== req.params.id); saveDb(db); res.json(db.orders); });
app.get('/api/backup', (req, res) => { const db = getDb(); res.setHeader('Content-Type', 'application/json'); res.setHeader('Content-Disposition', 'attachment; filename=database_backup.json'); res.json(db); });
app.post('/api/restore', (req, res) => { const newData = req.body; if (!newData || !Array.isArray(newData.orders) || !Array.isArray(newData.users)) { return res.status(400).json({ message: 'Invalid backup' }); } saveDb(newData); res.json({ success: true }); });
app.get('*', (req, res) => { const indexPath = path.join(__dirname, 'dist', 'index.html'); if (fs.existsSync(indexPath)) { res.sendFile(indexPath); } else { res.send('React App needs to be built. Run "npm run build" first.'); } });
app.listen(PORT, () => { console.log(`Server running on http://localhost:${PORT}`); });
