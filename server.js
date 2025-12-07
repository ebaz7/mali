
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { spawn } from 'child_process';

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
// WHATSAPP & TELEGRAM VARIABLES
// ==========================================
let whatsappClient = null;
let telegramBot = null;
let MessageMedia = null; 
let isWhatsAppReady = false;
let currentQR = null; 
let whatsappUser = null; 

// Helper to send WA message internally
const sendWhatsAppMessageInternal = async (number, message) => {
    if (!whatsappClient || !isWhatsAppReady) return false;
    try {
        let chatId = (number.includes('@')) ? number : `${number.replace(/\D/g, '').replace(/^09/, '989').replace(/^9/, '989')}@c.us`;
        await whatsappClient.sendMessage(chatId, message);
        return true;
    } catch (e) {
        console.error("WA Send Error:", e);
        return false;
    }
};

// Helper to send Telegram message internally
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
// N8N ORCHESTRATOR & SYNC
// ==========================================
let n8nProcess = null;

// Function to auto-configure n8n (Import Workflow & Activate)
const syncN8nWorkflow = async () => {
    const db = getDb();
    const webhookUrl = process.env.N8N_WEBHOOK_URL || db.settings.n8nWebhookUrl || 'http://localhost:5678/webhook/ai';
    
    let apiBase = webhookUrl.split('/webhook')[0];
    if (!apiBase) apiBase = 'http://localhost:5678';

    const workflowPath = path.join(__dirname, 'n8n_workflow.json');
    if (!fs.existsSync(workflowPath)) {
        return;
    }

    const workflowJson = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
    
    const auth = Buffer.from('admin:password').toString('base64');
    const headers = { 
        'Authorization': `Basic ${auth}`, 
        'Content-Type': 'application/json' 
    };

    console.log(`>>> Starting n8n Sync to ${apiBase}...`);

    let attempts = 0;
    const maxAttempts = 60; // Wait longer for n8n to fully boot
    
    const interval = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(interval);
            console.warn('>>> Giving up on n8n sync (n8n might be unreachable).');
            return;
        }

        try {
            // 1. Check if n8n API is up
            const listRes = await axios.get(`${apiBase}/api/v1/workflows`, { headers, timeout: 2000 });
            const existing = listRes.data.data.find(w => w.name === workflowJson.name);
            
            let workflowId;
            
            if (existing) {
                // Update Existing
                console.log('>>> Updating existing n8n workflow...');
                workflowId = existing.id;
                await axios.put(`${apiBase}/api/v1/workflows/${workflowId}`, workflowJson, { headers });
            } else {
                // Create New
                console.log('>>> Creating new n8n workflow...');
                const createRes = await axios.post(`${apiBase}/api/v1/workflows`, workflowJson, { headers });
                workflowId = createRes.data.id;
            }

            // 2. Activate Workflow
            if (workflowId) {
                await axios.post(`${apiBase}/api/v1/workflows/${workflowId}/activate`, {}, { headers });
                console.log('>>> ✅ n8n Workflow synced and ACTIVATED successfully.');
            }
            
            clearInterval(interval);
        } catch (e) {
            // Silent error logging while waiting for startup
        }
    }, 2000);
};

const startN8nService = () => {
    if (process.env.N8N_WEBHOOK_URL) {
        console.log('>>> Using external/docker n8n service defined in env.');
        return;
    }

    console.log('>>> Initializing Local AI Engine (n8n)...');
    
    // Prepare Environment
    const n8nEnv = {
        ...process.env,
        N8N_BASIC_AUTH_ACTIVE: 'true',
        N8N_BASIC_AUTH_USER: 'admin',
        N8N_BASIC_AUTH_PASSWORD: 'password',
        N8N_PORT: '5678',
        N8N_HOST: 'localhost',
        N8N_DIAGNOSTICS_ENABLED: 'false',
        N8N_PERSONALIZATION_ENABLED: 'false',
        N8N_ENCRYPTION_KEY: 'payment-system-local-key',
        N8N_USER_FOLDER: path.join(__dirname, 'n8n_data')
    };

    if (!fs.existsSync(path.join(__dirname, 'n8n_data'))) {
        fs.mkdirSync(path.join(__dirname, 'n8n_data'), { recursive: true });
    }

    const isWin = process.platform === 'win32';
    
    // Strategy:
    // 1. Try local node_modules/.bin/n8n (Fastest, uses installed package)
    // 2. Fallback to 'npx n8n start' (Might check internet, but usually uses cache)
    
    const localBin = path.join(__dirname, 'node_modules', '.bin', isWin ? 'n8n.cmd' : 'n8n');
    let command, args;

    if (fs.existsSync(localBin)) {
        console.log('>>> Found local n8n binary.');
        command = localBin;
        args = ['start'];
    } else {
        console.log('>>> Local binary not found. Falling back to npx (system cache).');
        command = isWin ? 'npx.cmd' : 'npx';
        args = ['n8n', 'start'];
    }

    try {
        console.log(`>>> Executing: ${command} ${args.join(' ')}`);

        n8nProcess = spawn(command, args, {
            env: n8nEnv,
            stdio: 'pipe', 
            detached: false,
            // CRITICAL FIX: Shell must be true on Windows to execute .cmd/batch files properly
            shell: isWin 
        });

        n8nProcess.stdout.on('data', (data) => {
            const output = data.toString();
            if (output.includes('Editor is now accessible')) {
                console.log('>>> ✅ n8n is active and running locally on port 5678');
            }
        });

        n8nProcess.stderr.on('data', (data) => {
            // Keep logs silent unless there's a fatal crash
            if (data.toString().includes('crash') || data.toString().includes('Error')) {
                // console.error('[n8n Error]', data.toString()); 
            }
        });

        n8nProcess.on('error', (err) => {
            console.warn('>>> Local AI Engine failed to start:', err.message);
        });
        
    } catch (e) {
        console.warn('>>> Could not spawn AI Engine.', e);
    }
};

// ==========================================
// N8N REQUEST LOGIC
// ==========================================

async function processN8NRequest(user, messageText, audioData = null, audioMimeType = null, systemPrompt = null) {
    const db = getDb();
    // Prioritize Env Var, then DB, then Default Localhost
    const webhookUrl = process.env.N8N_WEBHOOK_URL || db.settings.n8nWebhookUrl || 'http://localhost:5678/webhook/ai';

    try {
        const payload = {
            user: {
                fullName: user.fullName,
                role: user.role,
                id: user.id
            },
            message: messageText,
            systemPrompt: systemPrompt,
            audio: audioData ? {
                data: audioData, // Base64 string without prefix
                mimeType: audioMimeType
            } : null,
            timestamp: new Date().toISOString()
        };

        const response = await axios.post(webhookUrl, payload, { timeout: 40000 }); // timeout increased for audio
        const data = response.data;

        // Ensure data is parsed if n8n returns stringified JSON
        let parsedData = data;
        if (typeof data === 'string') {
            try { parsedData = JSON.parse(data); } catch(e) {}
        }

        // Handle Smart Analysis JSON Response
        if (parsedData.recommendation && parsedData.score) {
            return parsedData;
        }

        if (parsedData.type === 'message') {
            return parsedData.text;
        } 
        
        if (parsedData.type === 'tool_call') {
            return handleToolExecution(parsedData.tool, parsedData.args, user);
        }

        if (parsedData.text || parsedData.reply) return parsedData.text || parsedData.reply;
        if (typeof parsedData === 'string') return parsedData;

        return "پاسخ نامفهومی از هوش مصنوعی دریافت شد.";

    } catch (error) {
        // --- FALLBACK MODE (OFFLINE AI) ---
        if (systemPrompt && systemPrompt.includes("JSON generator")) {
            return null; 
        }

        if (audioData) {
            return "🎤 پیام صوتی دریافت شد اما ارتباط با سرویس هوش مصنوعی (n8n) برقرار نیست.";
        }

        // Simple Rule-Based Chatbot
        const lowerMsg = (messageText || '').toLowerCase();
        
        if (lowerMsg.includes('سلام') || lowerMsg.includes('درود')) {
            return `سلام ${user.fullName} عزیز! چطور می‌توانم کمکتان کنم؟ (حالت آفلاین)`;
        }
        
        if (lowerMsg.includes('وضعیت') || lowerMsg.includes('گزارش') || lowerMsg.includes('کارتابل')) {
            return handleToolExecution('get_financial_summary', {}, user);
        }

        return "⚠️ ارتباط با موتور هوشمند برقرار نیست. سیستم در حالت آفلاین کار می‌کند.";
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
        
        // Notify Financial Managers
        const financeUsers = db.users.filter(u => u.role === 'financial');
        financeUsers.forEach(fu => {
            if(fu.phoneNumber) sendWhatsAppMessageInternal(fu.phoneNumber, `🔔 *دستور پرداخت جدید*\nشماره: ${trackingNum}\nمبلغ: ${Number(args.amount).toLocaleString('fa-IR')}\nدرخواست‌کننده: ${user.fullName}`);
            if(fu.telegramChatId) sendTelegramMessageInternal(fu.telegramChatId, `🔔 دستور پرداخت جدید\nشماره: ${trackingNum}\nمبلغ: ${Number(args.amount).toLocaleString('fa-IR')}`);
        });

        return `دستور پرداخت با موفقیت ثبت شد.\nشماره: ${trackingNum}\nمبلغ: ${Number(args.amount).toLocaleString('fa-IR')} ریال\nگیرنده: ${args.payee}`;
    }

    if (toolName === 'get_financial_summary') {
        // Personalized Report Logic
        let reportText = `📊 *گزارش کارتابل شما (${user.fullName})*:\n\n`;
        let count = 0;

        if (user.role === 'admin' || user.role === 'financial') {
            const pendingFinance = db.orders.filter(o => o.status === 'در انتظار بررسی مالی');
            if (pendingFinance.length > 0) {
                reportText += `🔸 *منتظر تایید مالی:* ${pendingFinance.length} مورد\n`;
                pendingFinance.slice(0, 5).forEach(o => {
                    reportText += `   - #${o.trackingNumber} | ${o.payee} | ${Number(o.totalAmount).toLocaleString()} ریال\n`;
                });
                count += pendingFinance.length;
            }
        }

        if (user.role === 'admin' || user.role === 'manager') {
            const pendingManager = db.orders.filter(o => o.status === 'تایید مالی / در انتظار مدیریت');
            if (pendingManager.length > 0) {
                reportText += `\n🔸 *منتظر تایید مدیریت:* ${pendingManager.length} مورد\n`;
                pendingManager.slice(0, 5).forEach(o => {
                    reportText += `   - #${o.trackingNumber} | ${o.payee} | ${Number(o.totalAmount).toLocaleString()} ریال\n`;
                });
                count += pendingManager.length;
            }
        }

        if (user.role === 'admin' || user.role === 'ceo') {
            const pendingCeo = db.orders.filter(o => o.status === 'تایید مدیریت / در انتظار مدیرعامل');
            if (pendingCeo.length > 0) {
                reportText += `\n🔸 *منتظر تایید مدیرعامل:* ${pendingCeo.length} مورد\n`;
                pendingCeo.slice(0, 5).forEach(o => {
                    reportText += `   - #${o.trackingNumber} | ${o.payee} | ${Number(o.totalAmount).toLocaleString()} ریال\n`;
                });
                count += pendingCeo.length;
            }
        }

        // If regular user, show their own pending requests
        const myPending = db.orders.filter(o => o.requester === user.fullName && o.status !== 'تایید نهایی' && o.status !== 'رد شده');
        if (myPending.length > 0) {
             reportText += `\n🔹 *درخواست‌های جاری شما:* ${myPending.length} مورد\n`;
             myPending.slice(0, 3).forEach(o => {
                reportText += `   - #${o.trackingNumber}: ${o.status}\n`;
             });
             count += myPending.length;
        }

        if (count === 0) {
            reportText += "✅ کارتابل شما خالی است.";
        } 

        return reportText;
    }

    // NEW TOOL: Manage Order (Approve/Reject)
    if (toolName === 'manage_order') {
        const { trackingNumber, action, reason } = args; // action: 'approve' | 'reject'
        const orderIndex = db.orders.findIndex(o => o.trackingNumber == trackingNumber);
        
        if (orderIndex === -1) return `دستور پرداخت با شماره ${trackingNumber} یافت نشد.`;
        
        const order = db.orders[orderIndex];
        let nextStatus = null;
        let successMessage = "";

        if (action === 'reject') {
            nextStatus = 'رد شده';
            order.status = nextStatus;
            order.rejectionReason = reason || 'رد شده توسط ربات';
            order.rejectedBy = user.fullName;
            successMessage = `❌ دستور #${trackingNumber} رد شد.`;
        } else {
            // Approval Logic based on Role and Current Status
            if (order.status === 'در انتظار بررسی مالی' && (user.role === 'financial' || user.role === 'admin')) {
                nextStatus = 'تایید مالی / در انتظار مدیریت';
                order.approverFinancial = user.fullName;
            } else if (order.status === 'تایید مالی / در انتظار مدیریت' && (user.role === 'manager' || user.role === 'admin')) {
                nextStatus = 'تایید مدیریت / در انتظار مدیرعامل';
                order.approverManager = user.fullName;
            } else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل' && (user.role === 'ceo' || user.role === 'admin')) {
                nextStatus = 'تایید نهایی';
                order.approverCeo = user.fullName;
            } else {
                return `⛔ شما دسترسی لازم برای تایید این مرحله را ندارید یا وضعیت دستور (${order.status}) نیازی به تایید شما ندارد.`;
            }
            
            order.status = nextStatus;
            successMessage = `✅ دستور #${trackingNumber} با موفقیت تایید شد.\nوضعیت جدید: ${nextStatus}`;
        }

        order.updatedAt = Date.now();
        db.orders[orderIndex] = order;
        saveDb(db);
        
        // Trigger Proactive Notifications (Similar to PUT route)
        triggerNotifications(order, db);

        return successMessage;
    }

    if (toolName === 'search_trade_file') {
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

// Helper for Notifications (Used in Tool Execution & API)
function triggerNotifications(order, db) {
    const newStatus = order.status;
    const tracking = order.trackingNumber;
    const amount = Number(order.totalAmount).toLocaleString('fa-IR');
    
    let targetRole = null;
    let msg = '';

    if (newStatus === 'تایید مالی / در انتظار مدیریت') {
        targetRole = 'manager';
        msg = `🔔 *کارتابل شما (مدیریت)*\nدستور پرداخت #${tracking} توسط مالی تایید شد و منتظر تایید شماست.\nمبلغ: ${amount} ریال`;
    } else if (newStatus === 'تایید مدیریت / در انتظار مدیرعامل') {
        targetRole = 'ceo';
        msg = `🔔 *کارتابل شما (مدیرعامل)*\nدستور پرداخت #${tracking} توسط مدیریت تایید شد و منتظر تایید نهایی شماست.\nمبلغ: ${amount} ریال`;
    } else if (newStatus === 'تایید نهایی') {
        targetRole = 'financial'; // Notify financial again to pay
        msg = `✅ *دستور پرداخت نهایی شد*\nدستور #${tracking} تایید نهایی شد. لطفا نسبت به پرداخت اقدام کنید.\nمبلغ: ${amount} ریال`;
        
        // Notify requester too
        const requesterUser = db.users.find(u => u.fullName === order.requester);
        if (requesterUser) {
            if(requesterUser.phoneNumber) sendWhatsAppMessageInternal(requesterUser.phoneNumber, `✅ *درخواست شما تایید شد*\nدستور پرداخت #${tracking} تایید نهایی شد.`);
            if(requesterUser.telegramChatId) sendTelegramMessageInternal(requesterUser.telegramChatId, `✅ درخواست شما (#${tracking}) تایید نهایی شد.`);
        }
    } else if (newStatus === 'رد شده') {
        // Notify requester
        const requesterUser = db.users.find(u => u.fullName === order.requester);
        if (requesterUser) {
            const txt = `❌ *درخواست رد شد*\nدستور پرداخت #${tracking} رد شد.\nدلیل: ${order.rejectionReason || 'نامشخص'}`;
            if(requesterUser.phoneNumber) sendWhatsAppMessageInternal(requesterUser.phoneNumber, txt);
            if(requesterUser.telegramChatId) sendTelegramMessageInternal(requesterUser.telegramChatId, txt);
        }
    }

    if (targetRole && msg) {
        const targets = db.users.filter(u => u.role === targetRole || u.role === 'admin');
        targets.forEach(u => {
            if (u.phoneNumber) sendWhatsAppMessageInternal(u.phoneNumber, msg);
            if (u.telegramChatId) sendTelegramMessageInternal(u.telegramChatId, msg);
        });
    }
}

// ==========================================
// SMART ANALYSIS ENDPOINT
// ==========================================
app.post('/api/analyze-payment', async (req, res) => {
    const { amount, date, company } = req.body;
    
    // 1. Try AI Analysis
    const prompt = `Analyze: Amount ${amount}, Date ${date}, Company ${company}. JSON: {recommendation, score, reasons}`;
    const aiResponse = await processN8NRequest(
        { fullName: 'Analyzer', role: 'system', id: 'sys' }, 
        prompt, null, null, "You are a JSON generator."
    );

    if (aiResponse && typeof aiResponse === 'object' && aiResponse.recommendation) {
        return res.json({ ...aiResponse, analysisId: Date.now() });
    }

    // 2. Fallback Rule-Based Analysis (Offline Mode)
    console.log("Using fallback analysis logic.");
    const amountNum = Number(amount);
    let score = 85;
    let reasons = [];
    let recommendation = "پرداخت بلامانع";

    if (amountNum > 5000000000) { 
        score -= 25; 
        reasons.push("مبلغ کلان است، نیاز به بررسی نقدینگی."); 
        recommendation = "احتیاط";
    } else if (amountNum > 1000000000) {
        score -= 10;
        reasons.push("مبلغ قابل توجه است.");
    }

    const d = new Date(date);
    const day = d.getDate();
    if (day > 25) {
        reasons.push("ترافیک پرداخت آخر ماه.");
        score -= 5;
    }

    if (company && company.includes("بازرگانی")) {
        reasons.push("اولویت پرداخت‌های بازرگانی بالاست.");
        score += 5;
    }

    if (reasons.length === 0) reasons.push("شرایط نرمال ارزیابی شد.");

    res.json({
        recommendation,
        score: Math.min(100, Math.max(0, score)),
        reasons,
        analysisId: Date.now(),
        isOffline: true
    });
});


// ==========================================
// WHATSAPP & TELEGRAM
// ==========================================

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

                // Handle Voice/Audio
                let audioData = null;
                let messageText = msg.text;

                if (msg.voice || msg.audio) {
                    try {
                        const fileId = msg.voice ? msg.voice.file_id : msg.audio.file_id;
                        const fileLink = await telegramBot.getFileLink(fileId);
                        const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
                        audioData = Buffer.from(response.data).toString('base64');
                        // Mime type isn't strictly needed for Whisper as long as it's a common format
                    } catch (e) {
                        telegramBot.sendMessage(chatId, "خطا در پردازش صوت.");
                        return;
                    }
                }

                if (messageText || audioData) {
                    const reply = await processN8NRequest(user, messageText, audioData);
                    telegramBot.sendMessage(chatId, typeof reply === 'string' ? reply : JSON.stringify(reply, null, 2));
                }
            });
            
            telegramBot.on('polling_error', (e) => console.error("TG Poll Error:", e.code));
            telegramBot.on('error', (e) => console.error("TG Error:", e.message));
        }
    } catch (e) {
        console.warn('Telegram Bot Init Failed:', e.message);
    }
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
            
            if (!user) return; // Ignore unknown numbers

            let messageText = msg.body;
            let audioData = null;
            let audioMimeType = null;

            // Handle Voice/Audio Messages
            if (msg.hasMedia) {
                try {
                    const media = await msg.downloadMedia();
                    if (media.mimetype.includes('audio') || media.mimetype.includes('ogg')) {
                        console.log('>>> Voice message received from', user.fullName);
                        audioData = media.data; // Base64 string
                        audioMimeType = media.mimetype;
                    }
                } catch (err) {
                    console.error('Failed to download media:', err);
                    msg.reply("خطا در دانلود پیام صوتی.");
                    return;
                }
            }

            // If it's a voice message or text message, process it
            if (messageText || audioData) {
                const reply = await processN8NRequest(user, messageText, audioData, audioMimeType);
                msg.reply(typeof reply === 'string' ? reply : JSON.stringify(reply));
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

// Start Services
setTimeout(() => {
    startN8nService(); 
    syncN8nWorkflow(); 
    initWhatsApp();
    initTelegram();
}, 3000);

// --- ROUTES ---
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

// CRUD Routes
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

// Update Order - Includes Proactive Notifications
app.put('/api/orders/:id', (req, res) => { 
    const db = getDb(); 
    const i = db.orders.findIndex(x=>x.id===req.params.id); 
    
    if(i!==-1){ 
        const oldStatus = db.orders[i].status;
        db.orders[i] = req.body; 
        db.orders[i].updatedAt = Date.now(); 
        saveDb(db); 
        
        // Trigger Notifications on State Change
        if (oldStatus !== db.orders[i].status) {
            triggerNotifications(db.orders[i], db);
        }

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
