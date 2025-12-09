
import wwebjs from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const { Client, LocalAuth, MessageMedia } = wwebjs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'database.json');

let client = null;
let isReady = false;
let qrCode = null;
let clientInfo = null;

// --- HELPERS ---
const generateUUID = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

const getDb = () => {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }
    } catch (e) { console.error("DB Read Error", e); }
    return null;
};

const saveDb = (data) => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) { console.error("DB Write Error", e); }
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fa-IR').format(amount) + ' ریال';
};

// --- PARSING LOGIC (Hybrid: AI + Regex Fallback) ---
const handleMessageProcessing = async (text, db) => {
    // 1. Try AI First (If API Key exists & Working)
    if (db.settings.geminiApiKey && !text.startsWith('!')) {
        try {
            const ai = new GoogleGenAI({ apiKey: db.settings.geminiApiKey });
            const prompt = `
            Extract entities from this Persian Payment/Warehouse command.
            Input: "${text}"
            
            Detect Intent:
            - CREATE_PAYMENT: Needs amount, payee, description(optional), bank(optional), company(optional).
            - CREATE_BIJAK: Needs items(name, count), recipient, driver(optional), plate(optional), address(optional).
            - REPORT: If user asks for report/status.
            
            Output JSON only: { "intent": "...", "args": { ... } }
            `;
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.log("AI Failed, switching to Regex parser.");
        }
    }

    // 2. Advanced Regex Fallback (Offline Mode)
    console.log(">>> Using Regex Parser for:", text);
    
    // --- PAYMENT PATTERN ---
    // Format: دستور پرداخت 1000 به علی بابت خرید چوب از بانک ملی
    const payMatch = text.match(/(?:دستور پرداخت|ثبت پرداخت|واریز)\s+(\d+(?:[.,]\d+)?)\s*(?:ریال|تومان)?\s*(?:به|برای|در وجه)\s+(.+?)\s+(?:بابت|شرح)\s+(.+?)(?:\s+(?:از|بانک)\s+(.+))?$/);
    if (payMatch) {
        return {
            intent: 'CREATE_PAYMENT',
            args: { 
                amount: payMatch[1].replace(/[,.]/g, ''), 
                payee: payMatch[2].trim(), 
                description: payMatch[3].trim(),
                bank: payMatch[4] ? payMatch[4].trim() : 'نامشخص'
            }
        };
    }
    
    // Simple Payment (Legacy)
    const simplePay = text.match(/(?:پرداخت|واریز)\s+(\d+)\s*(?:برای|به)\s+(.+)/);
    if (simplePay && !payMatch) {
        return {
            intent: 'CREATE_PAYMENT',
            args: { amount: simplePay[1], payee: simplePay[2].trim(), description: 'ثبت سریع واتساپ', bank: '' }
        };
    }

    // --- BIJAK (EXIT) PATTERN ---
    // Format: بیجک 50 کارتن کابل برای شرکت البرز راننده اکبری پلاک 12-345
    const bijakMatch = text.match(/(?:بیجک|خروج|حواله)\s+(\d+)\s*(?:کارتن|عدد|شاخه)?\s+(.+?)\s+(?:برای|به)\s+(.+?)(?:\s+(?:راننده)\s+(.+?))?(?:\s+(?:پلاک)\s+(.+))?$/);
    if (bijakMatch) {
        return {
            intent: 'CREATE_BIJAK',
            args: {
                count: bijakMatch[1],
                itemName: bijakMatch[2].trim(),
                recipient: bijakMatch[3].trim(),
                driver: bijakMatch[4] ? bijakMatch[4].trim() : '',
                plate: bijakMatch[5] ? bijakMatch[5].trim() : ''
            }
        };
    }

    // --- APPROVALS ---
    const approveMatch = text.match(/(?:تایید|اوکی|ok)\s+(\d+)/i);
    if (approveMatch) return { intent: 'APPROVE_ORDER', args: { trackingNumber: approveMatch[1] } };

    const rejectMatch = text.match(/(?:رد|کنسل)\s+(\d+)/);
    if (rejectMatch) return { intent: 'REJECT_ORDER', args: { trackingNumber: rejectMatch[1] } };

    // --- REPORT ---
    if (text.includes('گزارش') || text.includes('کارتابل') || text === '!گزارش') {
        return { intent: 'REPORT' };
    }

    // --- HELP ---
    if (text.includes('راهنما') || text.includes('کمک')) return { intent: 'HELP' };

    return null;
};

// --- WHATSAPP CLIENT ---
export const initWhatsApp = (authDir) => {
    try {
        console.log(">>> Initializing WhatsApp Module...");
        
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

        client = new Client({ 
            authStrategy: new LocalAuth({ dataPath: authDir }), 
            puppeteer: { 
                headless: true, 
                executablePath: getBrowser(), 
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] 
            } 
        });

        client.on('qr', (qr) => { 
            qrCode = qr; isReady = false; 
            qrcode.generate(qr, { small: true }); 
        });

        client.on('ready', () => { 
            isReady = true; qrCode = null; clientInfo = client.info.wid.user; 
            console.log(">>> WhatsApp Client Ready! ✅"); 
        });

        client.on('message', async msg => {
            try {
                const body = msg.body.trim();
                if (msg.from.includes('@g.us') && !body.startsWith('!')) return;

                const db = getDb();
                if (!db) return;

                // 1. Help Command
                if (body === '!راهنما' || body === 'راهنما') {
                    msg.reply(`🤖 *دستیار هوشمند سیستم مالی*\n\n` +
                        `💰 *ثبت دستور پرداخت کامل:*\n"دستور پرداخت [مبلغ] به [نام] بابت [توضیحات] از [بانک]"\nمثال: دستور پرداخت 5000000 به علی رضایی بابت خرید لوازم از بانک ملی\n\n` +
                        `🚛 *ثبت بیجک خروج کالا:*\n"بیجک [تعداد] [کالا] برای [گیرنده] راننده [نام] پلاک [پلاک]"\nمثال: بیجک 50 کارتن لامپ برای فروشگاه نور راننده حسینی پلاک 66-345\n\n` +
                        `📊 *گزارش کارتابل:*\nارسال کلمه "گزارش" یا "کارتابل"`);
                    return;
                }

                // 2. Process Intent
                const processingMsg = body.length > 20 ? await msg.reply('⏳ ...') : null;
                
                // CORRECTED FUNCTION CALL HERE:
                const result = await handleMessageProcessing(body, db);
                
                if (processingMsg) processingMsg.delete(true);

                if (!result) {
                    if (body.length > 5) msg.reply("⚠️ دستور نامفهوم. برای راهنما کلمه «راهنما» را ارسال کنید.");
                    return;
                }

                const { intent, args } = result;

                // --- COMMAND: CREATE PAYMENT ---
                if (intent === 'CREATE_PAYMENT') {
                    const trackingNum = (db.settings.currentTrackingNumber || 1000) + 1;
                    db.settings.currentTrackingNumber = trackingNum;

                    const amount = typeof args.amount === 'string' ? parseInt(args.amount.replace(/[^0-9]/g, '')) : args.amount;

                    const newOrder = {
                        id: generateUUID(),
                        trackingNumber: trackingNum,
                        date: new Date().toISOString().split('T')[0],
                        payee: args.payee,
                        totalAmount: amount,
                        description: args.description || 'ثبت شده از طریق واتساپ',
                        status: 'در انتظار بررسی مالی',
                        requester: `WhatsApp User (${msg.from.replace('@c.us', '').slice(0,5)}...)`,
                        payingCompany: args.company || db.settings.defaultCompany || db.settings.companyNames?.[0] || 'شرکت اصلی',
                        paymentDetails: [{
                            id: generateUUID(),
                            method: 'حواله بانکی',
                            amount: amount,
                            bankName: args.bank || '',
                            description: 'ثبت خودکار'
                        }],
                        createdAt: Date.now()
                    };

                    db.orders.unshift(newOrder);
                    saveDb(db);
                    msg.reply(`✅ *دستور پرداخت با موفقیت ثبت شد*\n\n🔢 شماره: ${trackingNum}\n👤 ذینفع: ${args.payee}\n💰 مبلغ: ${formatCurrency(amount)}\n📝 بابت: ${newOrder.description}\n🏦 بانک: ${args.bank || 'تعیین نشده'}`);
                }

                // --- COMMAND: CREATE BIJAK ---
                else if (intent === 'CREATE_BIJAK') {
                    const company = db.settings.defaultCompany || (db.settings.companyNames?.[0]) || 'نامشخص';
                    const currentSeq = db.settings.warehouseSequences?.[company] || 1000;
                    const nextSeq = currentSeq + 1;
                    db.settings.warehouseSequences = { ...db.settings.warehouseSequences, [company]: nextSeq };

                    const newTx = {
                        id: generateUUID(),
                        type: 'OUT',
                        date: new Date().toISOString(),
                        company: company,
                        number: nextSeq,
                        recipientName: args.recipient,
                        destination: args.address || '',
                        driverName: args.driver || '',
                        plateNumber: args.plate || '',
                        items: [{
                            itemId: generateUUID(),
                            itemName: args.itemName || 'کالای عمومی',
                            quantity: Number(args.count) || 1,
                            weight: 0,
                            unitPrice: 0
                        }],
                        createdAt: Date.now(),
                        createdBy: `WhatsApp User`
                    };

                    db.warehouseTransactions.unshift(newTx);
                    saveDb(db);
                    msg.reply(`📦 *حواله خروج (بیجک) صادر شد*\n\n📄 شماره: ${nextSeq}\n👤 گیرنده: ${args.recipient}\n📦 کالا: ${args.itemName} (${args.count})\n🚛 راننده: ${args.driver || '-'}\n🔢 پلاک: ${args.plate || '-'}`);
                }

                // --- COMMAND: REPORT (DETAILED) ---
                else if (intent === 'REPORT') {
                    // 1. Payments Report
                    const pendingOrders = db.orders.filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده');
                    
                    let paymentMsg = `📊 *گزارش کارتابل دستور پرداخت‌ها*\nوضعیت: ${new Date().toLocaleDateString('fa-IR')}\n---------------------------`;
                    if (pendingOrders.length === 0) {
                        paymentMsg += "\n✅ هیچ دستور پرداخت بازی وجود ندارد.";
                    } else {
                        pendingOrders.forEach(o => {
                            paymentMsg += `\n🔹 *شماره: ${o.trackingNumber}*`;
                            paymentMsg += `\n👤 ذینفع: ${o.payee}`;
                            paymentMsg += `\n💰 مبلغ: ${formatCurrency(o.totalAmount)}`;
                            paymentMsg += `\n📝 بابت: ${o.description}`;
                            paymentMsg += `\n👤 ثبت‌کننده: ${o.requester}`;
                            paymentMsg += `\n⏳ وضعیت: ${o.status}`;
                            paymentMsg += `\n---------------------------`;
                        });
                    }
                    await msg.reply(paymentMsg);

                    // 2. Exits (Bijak) Report (Separate Message)
                    const pendingExits = db.exitPermits.filter(p => p.status !== 'خارج شده (بایگانی)' && p.status !== 'رد شده');
                    const recentBijaks = db.warehouseTransactions.filter(t => t.type === 'OUT').slice(0, 5); // Last 5 Bijaks

                    let exitMsg = `🚛 *گزارش حواله و خروج کالا*\n---------------------------`;
                    
                    if (pendingExits.length > 0) {
                        exitMsg += `\n🔴 *مجوزهای خروج در انتظار:*`;
                        pendingExits.forEach(p => {
                            exitMsg += `\n🔸 مجوز #${p.permitNumber} | گیرنده: ${p.recipientName}`;
                            exitMsg += `\n   وضعیت: ${p.status}`;
                        });
                        exitMsg += `\n---------------------------`;
                    }

                    exitMsg += `\n📦 *آخرین بیجک‌های صادر شده:*`;
                    recentBijaks.forEach(b => {
                        const itemSummary = b.items.map(i => `${i.quantity} ${i.itemName}`).join('، ');
                        exitMsg += `\n🔹 بیجک #${b.number} | ${itemSummary}`;
                        exitMsg += `\n   گیرنده: ${b.recipientName}`;
                        if(b.driverName) exitMsg += ` | راننده: ${b.driverName}`;
                    });

                    // Small delay to ensure order
                    setTimeout(() => msg.reply(exitMsg), 500);
                }

                // --- COMMAND: APPROVE ---
                else if (intent === 'APPROVE_ORDER') {
                    const order = db.orders.find(o => o.trackingNumber == args.trackingNumber);
                    if (order) {
                        // Simple state machine for approval
                        if (order.status === 'در انتظار بررسی مالی') order.status = 'تایید مالی / در انتظار مدیریت';
                        else if (order.status === 'تایید مالی / در انتظار مدیریت') order.status = 'تایید مدیریت / در انتظار مدیرعامل';
                        else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل') order.status = 'تایید نهایی';
                        
                        saveDb(db);
                        msg.reply(`✅ دستور پرداخت ${args.trackingNumber} به مرحله "${order.status}" منتقل شد.`);
                    } else {
                        msg.reply("❌ شماره سند یافت نشد.");
                    }
                }
            } catch (error) {
                console.error("Error processing message:", error);
                // Optional: msg.reply("خطا در پردازش درخواست.");
            }
        });

        client.initialize().catch(e => console.error(">>> WA Init Fail:", e.message));

    } catch (e) {
        console.error(">>> WhatsApp Module Error:", e.message);
    }
};

export const getStatus = () => ({ ready: isReady, qr: qrCode, user: clientInfo });

export const logout = async () => {
    if (client) {
        await client.logout();
        isReady = false;
        qrCode = null;
        clientInfo = null;
    }
};

export const getGroups = async () => {
    if (!client || !isReady) return [];
    const chats = await client.getChats();
    return chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name }));
};

export const sendMessage = async (number, text, mediaData) => {
    if (!client || !isReady) throw new Error("WhatsApp not ready");
    
    let chatId = number;
    if (!number.includes('@')) {
        const cleanNum = number.replace(/\D/g, '');
        if (cleanNum.startsWith('0')) chatId = `98${cleanNum.substring(1)}@c.us`;
        else if (cleanNum.startsWith('98')) chatId = `${cleanNum}@c.us`;
        else chatId = `${cleanNum}@c.us`; 
    }
    if (number.includes('@g.us')) chatId = number;

    if (mediaData && mediaData.data) {
        const media = new MessageMedia(mediaData.mimeType, mediaData.data, mediaData.filename);
        await client.sendMessage(chatId, media, { caption: text || '' });
    } else if (text) {
        await client.sendMessage(chatId, text);
    }
};
