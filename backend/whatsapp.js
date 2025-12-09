
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

// --- PARSING LOGIC ---
const handleMessageProcessing = async (text, db) => {
    // Clean text
    const cleanText = text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();

    // 1. Explicit Approval/Rejection with Type Keywords
    // Regex explanation: Looks for (Approve) + (Type Keyword) + (Number)
    
    // -> Payment Approval
    const payApproveMatch = cleanText.match(/^(?:تایید|ok|yes)\s+(?:پرداخت|سند|واریز|هزینه|p)\s*(\d+)$/i);
    if (payApproveMatch) return { intent: 'APPROVE_PAYMENT', args: { number: payApproveMatch[1] } };

    // -> Payment Rejection
    const payRejectMatch = cleanText.match(/^(?:رد|کنسل|no|reject)\s+(?:پرداخت|سند|واریز|هزینه|p)\s*(\d+)$/i);
    if (payRejectMatch) return { intent: 'REJECT_PAYMENT', args: { number: payRejectMatch[1] } };

    // -> Exit/Bijak Approval
    const exitApproveMatch = cleanText.match(/^(?:تایید|ok|yes)\s+(?:خروج|بیجک|حواله|بار|مجوز|b)\s*(\d+)$/i);
    if (exitApproveMatch) return { intent: 'APPROVE_EXIT', args: { number: exitApproveMatch[1] } };

    // -> Exit/Bijak Rejection
    const exitRejectMatch = cleanText.match(/^(?:رد|کنسل|no|reject)\s+(?:خروج|بیجک|حواله|بار|مجوز|b)\s*(\d+)$/i);
    if (exitRejectMatch) return { intent: 'REJECT_EXIT', args: { number: exitRejectMatch[1] } };


    // 2. Ambiguous Approval (Just Number)
    // If user sends "تایید 1001", we check DB to see if it's unique or duplicate
    const genericMatch = cleanText.match(/^(?:تایید|اوکی|ok|رد|کنسل)\s+(\d+)$/i);
    if (genericMatch) {
        const action = cleanText.match(/رد|کنسل|no|reject/i) ? 'REJECT' : 'APPROVE';
        const number = genericMatch[1];
        
        const order = db.orders.find(o => o.trackingNumber == number);
        const permit = db.exitPermits.find(p => p.permitNumber == number);

        if (order && permit) {
            // Collision!
            return { intent: 'AMBIGUOUS', args: { number } };
        } else if (order) {
            return { intent: `${action}_PAYMENT`, args: { number } };
        } else if (permit) {
            return { intent: `${action}_EXIT`, args: { number } };
        } else {
            return { intent: 'NOT_FOUND', args: { number } };
        }
    }

    // 3. Creation Logic (Regex Fallback)
    const payMatch = cleanText.match(/(?:دستور پرداخت|ثبت پرداخت|واریز)\s+(\d+(?:[.,]\d+)?)\s*(?:ریال|تومان)?\s*(?:به|برای|در وجه)\s+(.+?)\s+(?:بابت|شرح)\s+(.+?)(?:\s+(?:از|بانک)\s+(.+))?$/);
    if (payMatch) return { intent: 'CREATE_PAYMENT', args: { amount: payMatch[1].replace(/[,.]/g, ''), payee: payMatch[2].trim(), description: payMatch[3].trim(), bank: payMatch[4] ? payMatch[4].trim() : 'نامشخص' } };
    
    const bijakMatch = cleanText.match(/(?:بیجک|خروج|حواله)\s+(\d+)\s*(?:کارتن|عدد|شاخه)?\s+(.+?)\s+(?:برای|به)\s+(.+?)(?:\s+(?:راننده)\s+(.+?))?(?:\s+(?:پلاک)\s+(.+))?$/);
    if (bijakMatch) return { intent: 'CREATE_BIJAK', args: { count: bijakMatch[1], itemName: bijakMatch[2].trim(), recipient: bijakMatch[3].trim(), driver: bijakMatch[4]?.trim(), plate: bijakMatch[5]?.trim() } };

    if (cleanText.includes('گزارش') || cleanText.includes('کارتابل')) return { intent: 'REPORT' };
    if (cleanText.includes('راهنما') || cleanText === 'help') return { intent: 'HELP' };

    // 4. AI Parsing (If enabled and not matched above)
    if (db.settings.geminiApiKey && !cleanText.startsWith('!')) {
        try {
            const ai = new GoogleGenAI({ apiKey: db.settings.geminiApiKey });
            const prompt = `Extract entities from this Persian command. Output JSON: { "intent": "...", "args": { ... } }. Intents: CREATE_PAYMENT, CREATE_BIJAK, REPORT. Input: "${cleanText}"`;
            const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: [{ role: 'user', parts: [{ text: prompt }] }] });
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch (e) { /* AI Fail, ignore */ }
    }

    return null;
};

// --- WHATSAPP CLIENT ---
export const initWhatsApp = (authDir) => {
    try {
        console.log(">>> Initializing WhatsApp Module...");
        const getBrowser = () => { 
            if (process.platform === 'win32') { 
                const paths = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']; 
                for (const p of paths) if (fs.existsSync(p)) return p; 
            } return null; 
        };

        client = new Client({ 
            authStrategy: new LocalAuth({ dataPath: authDir }), 
            puppeteer: { headless: true, executablePath: getBrowser(), args: ['--no-sandbox', '--disable-setuid-sandbox'] } 
        });

        client.on('qr', (qr) => { qrCode = qr; isReady = false; qrcode.generate(qr, { small: true }); });
        client.on('ready', () => { isReady = true; qrCode = null; clientInfo = client.info.wid.user; console.log(">>> WhatsApp Client Ready! ✅"); });

        client.on('message', async msg => {
            try {
                const body = msg.body.trim();
                if (msg.from.includes('@g.us') && !body.startsWith('!')) return;
                const db = getDb();
                if (!db) return;

                if (body === '!راهنما' || body === 'راهنما') {
                    msg.reply(`🤖 *راهنمای دستورات*\n\n✅ *تایید دستور پرداخت:*\n"تایید پرداخت [شماره]" (مثال: تایید پرداخت 1001)\n\n✅ *تایید حواله خروج (بیجک):*\n"تایید خروج [شماره]" (مثال: تایید خروج 1001)\n\n(برای رد کردن به جای "تایید" از "رد" استفاده کنید)\n\n💰 *ثبت پرداخت:*\n"دستور پرداخت [مبلغ] به [نام] بابت [شرح]"\n\n🚛 *ثبت بیجک:*\n"بیجک [تعداد] [کالا] برای [گیرنده]"`);
                    return;
                }

                const result = await handleMessageProcessing(body, db);
                if (!result) return;

                const { intent, args } = result;

                // --- HANDLING RESULTS ---
                if (intent === 'AMBIGUOUS') {
                    msg.reply(`⚠️ توجه:\nشماره ${args.number} هم در لیست "پرداخت‌ها" وجود دارد و هم در "مجوزهای خروج".\n\nلطفا نوع را مشخص کنید:\n1️⃣ تایید پرداخت ${args.number}\n2️⃣ تایید خروج ${args.number}`);
                }
                else if (intent === 'NOT_FOUND') {
                    msg.reply(`❌ سندی با شماره ${args.number} پیدا نشد.`);
                }
                
                // --- PAYMENT LOGIC ---
                else if (intent === 'APPROVE_PAYMENT') {
                    const order = db.orders.find(o => o.trackingNumber == args.number);
                    if (order) {
                        // Move to next step
                        if (order.status === 'در انتظار بررسی مالی') order.status = 'تایید مالی / در انتظار مدیریت';
                        else if (order.status === 'تایید مالی / در انتظار مدیریت') order.status = 'تایید مدیریت / در انتظار مدیرعامل';
                        else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل') order.status = 'تایید نهایی';
                        else if (order.status === 'تایید نهایی') { msg.reply("این سند قبلاً تایید نهایی شده است."); return; }
                        
                        saveDb(db);
                        msg.reply(`✅ دستور پرداخت ${args.number} تایید شد.\nوضعیت جدید: ${order.status}`);
                    } else msg.reply("❌ دستور پرداخت یافت نشد.");
                }
                else if (intent === 'REJECT_PAYMENT') {
                    const order = db.orders.find(o => o.trackingNumber == args.number);
                    if (order) {
                        order.status = 'رد شده';
                        saveDb(db);
                        msg.reply(`🚫 دستور پرداخت ${args.number} رد شد.`);
                    } else msg.reply("❌ دستور پرداخت یافت نشد.");
                }

                // --- EXIT PERMIT LOGIC ---
                else if (intent === 'APPROVE_EXIT') {
                    const permit = db.exitPermits.find(p => p.permitNumber == args.number);
                    if (permit) {
                        // Move to next step
                        if (permit.status === 'در انتظار تایید مدیرعامل') permit.status = 'تایید مدیرعامل / در انتظار خروج (کارخانه)';
                        else if (permit.status === 'تایید مدیرعامل / در انتظار خروج (کارخانه)') permit.status = 'خارج شده (بایگانی)';
                        else if (permit.status === 'خارج شده (بایگانی)') { msg.reply("این حواله قبلاً خارج شده است."); return; }

                        saveDb(db);
                        msg.reply(`✅ مجوز خروج ${args.number} تایید شد.\nوضعیت جدید: ${permit.status}`);
                    } else msg.reply("❌ مجوز خروج یافت نشد.");
                }
                else if (intent === 'REJECT_EXIT') {
                    const permit = db.exitPermits.find(p => p.permitNumber == args.number);
                    if (permit) {
                        permit.status = 'رد شده';
                        saveDb(db);
                        msg.reply(`🚫 مجوز خروج ${args.number} رد شد.`);
                    } else msg.reply("❌ مجوز خروج یافت نشد.");
                }

                // --- CREATION LOGIC ---
                else if (intent === 'CREATE_PAYMENT') {
                    const trackingNum = (db.settings.currentTrackingNumber || 1000) + 1;
                    db.settings.currentTrackingNumber = trackingNum;
                    const amount = typeof args.amount === 'string' ? parseInt(args.amount.replace(/[^0-9]/g, '')) : args.amount;
                    db.orders.unshift({ id: generateUUID(), trackingNumber: trackingNum, date: new Date().toISOString().split('T')[0], payee: args.payee, totalAmount: amount, description: args.description || 'واتساپ', status: 'در انتظار بررسی مالی', requester: 'WhatsApp', payingCompany: db.settings.defaultCompany, paymentDetails: [{id: generateUUID(), method: 'حواله بانکی', amount: amount, bankName: args.bank}], createdAt: Date.now() });
                    saveDb(db);
                    msg.reply(`✅ دستور پرداخت ثبت شد: #${trackingNum}`);
                }
                else if (intent === 'CREATE_BIJAK') {
                    const company = db.settings.defaultCompany || 'نامشخص';
                    const nextSeq = (db.settings.warehouseSequences?.[company] || 1000) + 1;
                    db.settings.warehouseSequences = { ...db.settings.warehouseSequences, [company]: nextSeq };
                    db.warehouseTransactions.unshift({ id: generateUUID(), type: 'OUT', date: new Date().toISOString(), company: company, number: nextSeq, recipientName: args.recipient, items: [{itemId: generateUUID(), itemName: args.itemName, quantity: Number(args.count), weight: 0}], createdAt: Date.now(), createdBy: 'WhatsApp' });
                    saveDb(db);
                    msg.reply(`📦 بیجک ثبت شد: #${nextSeq}`);
                }
                else if (intent === 'REPORT') {
                    const pendingOrders = db.orders.filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده').length;
                    const pendingExits = db.exitPermits.filter(p => p.status !== 'خارج شده (بایگانی)' && p.status !== 'رد شده').length;
                    msg.reply(`📊 *گزارش وضعیت*\n💰 پرداخت‌های باز: ${pendingOrders} مورد\n🚛 خروج‌های باز: ${pendingExits} مورد`);
                }

            } catch (error) { console.error("Message Error:", error); }
        });

        client.initialize().catch(e => console.error("WA Init Fail:", e.message));
    } catch (e) { console.error("WA Module Error:", e.message); }
};

export const getStatus = () => ({ ready: isReady, qr: qrCode, user: clientInfo });
export const logout = async () => { if (client) { await client.logout(); isReady = false; qrCode = null; clientInfo = null; } };
export const getGroups = async () => { if (!client || !isReady) return []; const chats = await client.getChats(); return chats.filter(c => c.isGroup).map(c => ({ id: c.id._serialized, name: c.name })); };
export const sendMessage = async (number, text, mediaData) => {
    if (!client || !isReady) throw new Error("WhatsApp not ready");
    let chatId = number.includes('@') ? number : `${number.replace(/\D/g, '').replace(/^0/, '98')}@c.us`;
    if (mediaData && mediaData.data) {
        const media = new MessageMedia(mediaData.mimeType, mediaData.data, mediaData.filename);
        await client.sendMessage(chatId, media, { caption: text || '' });
    } else if (text) await client.sendMessage(chatId, text);
};
