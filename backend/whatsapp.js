
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

// --- AI LOGIC ---
const handleAIProcessing = async (text, db) => {
    if (!db.settings.geminiApiKey) return null;
    try {
        const ai = new GoogleGenAI({ apiKey: db.settings.geminiApiKey });
        
        // Context Data
        const itemsList = db.warehouseItems.map(i => i.name).join(', ');
        const companiesList = (db.settings.companyNames || []).join(', ');
        const banksList = (db.settings.bankNames || []).join(', ');

        const prompt = `
        You are an intelligent assistant for a Payment & Warehouse Automation System.
        Current Date: ${new Date().toLocaleDateString('fa-IR')}
        
        User Message: "${text}"
        
        System Context:
        - Registered Items: ${itemsList}
        - Registered Companies: ${companiesList}
        - Registered Banks: ${banksList}

        Your Goal: Identify the user's intent and extract entities.
        
        Supported Intents:
        1. CREATE_BIJAK (For: خروج کالا, بیجک, حواله فروش)
           - REQUIRED: recipient (گیرنده), items (Array of {name, count, weight}), company (شرکت)
           - OPTIONAL: address, driver, plate
           - NOTE: If company is missing, try to infer or ask. If item name is fuzzy, match closest from "Registered Items".
        
        2. CREATE_PAYMENT (For: دستور پرداخت, واریز, پرداخت)
           - REQUIRED: payee (ذینفع), amount (مبلغ), bank (بانک)
           - OPTIONAL: description, company
        
        3. APPROVE_ORDER (For: تایید سند, تایید بیجک)
           - REQUIRED: trackingNumber (شماره)
        
        4. REJECT_ORDER (For: رد سند)
           - REQUIRED: trackingNumber, reason
        
        5. REPORT (For: گزارش, وضعیت)
        
        6. HELP (For: راهنما, کمک)

        CRITICAL INSTRUCTION:
        - If REQUIRED fields are missing for an intent, set intent to "ASK_MORE" and in "reply" specify exactly what is missing in Persian.
        - Example: If user says "Create bijak for Ali", return intent="ASK_MORE", reply="لطفا نام کالا، تعداد و نام شرکت را مشخص کنید."
        - If all data is present, return the intent and the extracted args in JSON.

        Output JSON Format ONLY:
        { 
          "intent": "CREATE_BIJAK" | "CREATE_PAYMENT" | "APPROVE_ORDER" | "REJECT_ORDER" | "REPORT" | "HELP" | "ASK_MORE" | "UNKNOWN",
          "args": { ... },
          "reply": "Persian confirmation or question"
        }
        `;

        // CORRECT SDK USAGE:
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });

        // Get text directly from the property
        const responseText = response.text;
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("AI Error:", e);
    }
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
            console.log(">>> WhatsApp QR Generated 📷"); 
            qrcode.generate(qr, { small: true }); 
        });

        client.on('ready', () => { 
            isReady = true; qrCode = null; clientInfo = client.info.wid.user; 
            console.log(">>> WhatsApp Client Ready! ✅"); 
        });

        client.on('message', async msg => {
            const body = msg.body.trim();
            if (msg.from.includes('@g.us') && !body.startsWith('!')) return; // Only allow commands starting with ! in groups

            const db = getDb();
            if (!db) return;

            // 1. HELP COMMAND
            if (body === '!راهنما' || body === 'راهنما') {
                msg.reply(`🤖 *دستیار هوشمند سیستم*\n\nدستورات صوتی یا متنی زیر پشتیبانی می‌شوند:\n\n` +
                    `📦 *ثبت بیجک/حواله:*\n"یک بیجک بزن برای آقای رضایی، ۱۰۰ کارتن کابل از شرکت البرز به آدرس تهران..."\n\n` +
                    `💰 *ثبت دستور پرداخت:*\n"دستور پرداخت ۵۰ میلیون برای علی اکبری بابت خرید مواد از بانک ملی"\n\n` +
                    `✅ *تایید/رد:*\n"دستور ۱۰۲۴ رو تایید کن" یا "بیجک ۲۰۵ رو رد کن چون..."\n\n` +
                    `📊 *گزارش:*\n"گزارش وضعیت بده"`);
                return;
            }

            // 2. AI PROCESSING
            const processingMsg = body.length > 10 ? await msg.reply('⏳ در حال پردازش...') : null;
            
            const aiResult = await handleAIProcessing(body, db);
            
            if (processingMsg) processingMsg.delete(true); // Remove "Processing..."

            if (!aiResult) {
                // Fallback for simple commands if AI fails or no API key
                if (body === '!گزارش') { /* ... simple report logic ... */ }
                return;
            }

            // 3. EXECUTE INTENTS
            const { intent, args, reply } = aiResult;

            if (intent === 'ASK_MORE') {
                msg.reply(`❓ ${reply}`);
                return;
            }

            if (intent === 'CREATE_BIJAK') {
                // Args: company, recipient, address, driver, plate, items: [{name, count, weight}]
                const company = args.company || db.settings.defaultCompany || (db.settings.companyNames?.[0]);
                if (!company) { msg.reply("❌ نام شرکت مشخص نیست."); return; }

                // Calculate Next Number
                const currentSeq = db.settings.warehouseSequences?.[company] || 1000;
                const nextSeq = currentSeq + 1;
                db.settings.warehouseSequences[company] = nextSeq;

                // Match Items to DB IDs
                const txItems = (args.items || []).map(aiItem => {
                    const dbItem = db.warehouseItems.find(i => i.name.includes(aiItem.name) || aiItem.name.includes(i.name));
                    return {
                        itemId: dbItem ? dbItem.id : generateUUID(),
                        itemName: aiItem.name,
                        quantity: Number(aiItem.count) || 0,
                        weight: Number(aiItem.weight) || 0,
                        unitPrice: 0
                    };
                });

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
                    items: txItems,
                    createdAt: Date.now(),
                    createdBy: `WhatsApp (${msg.from.replace('@c.us', '')})`
                };

                db.warehouseTransactions.unshift(newTx);
                saveDb(db);
                
                let confirmMsg = `✅ *بیجک خروج صادر شد*\n📄 شماره: ${nextSeq}\n🏭 شرکت: ${company}\n👤 گیرنده: ${args.recipient}\n📦 اقلام: ${txItems.length} مورد`;
                if(args.address) confirmMsg += `\n📍 آدرس: ${args.address}`;
                msg.reply(confirmMsg);
            }

            else if (intent === 'CREATE_PAYMENT') {
                // Args: payee, amount, bank, description, company
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
                    requester: `WhatsApp User`,
                    payingCompany: args.company || db.settings.defaultCompany,
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
                msg.reply(`✅ *دستور پرداخت ثبت شد*\n🔢 شماره: ${trackingNum}\n👤 ذینفع: ${args.payee}\n💰 مبلغ: ${amount.toLocaleString()} ریال`);
            }

            else if (intent === 'APPROVE_ORDER') {
                // Check Payment Orders
                const order = db.orders.find(o => o.trackingNumber == args.trackingNumber);
                if (order) {
                    if (order.status === 'در انتظار بررسی مالی') order.status = 'تایید مالی / در انتظار مدیریت';
                    else if (order.status === 'تایید مالی / در انتظار مدیریت') order.status = 'تایید مدیریت / در انتظار مدیرعامل';
                    else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل') order.status = 'تایید نهایی';
                    order.updatedAt = Date.now();
                    saveDb(db);
                    msg.reply(`✅ دستور پرداخت ${args.trackingNumber} به مرحله بعدی (${order.status}) منتقل شد.`);
                } 
                // Check Exit Permits
                else {
                    const permit = db.exitPermits.find(p => p.permitNumber == args.trackingNumber);
                    if (permit) {
                        permit.status = 'تایید مدیرعامل / در انتظار خروج (کارخانه)';
                        saveDb(db);
                        msg.reply(`✅ مجوز خروج ${args.trackingNumber} تایید شد.`);
                    } else {
                        msg.reply(`❌ شماره سند ${args.trackingNumber} یافت نشد.`);
                    }
                }
            }

            else if (intent === 'REPORT') {
                const pendingOrders = db.orders.filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده').length;
                const pendingExits = db.exitPermits.filter(p => p.status !== 'خارج شده (بایگانی)' && p.status !== 'رد شده').length;
                msg.reply(`📊 *گزارش وضعیت*\n\n💰 کارتابل پرداخت: ${pendingOrders} سند باز\n🚛 کارتابل خروج: ${pendingExits} مجوز فعال`);
            }

            else if (intent === 'UNKNOWN') {
                msg.reply("متوجه منظور شما نشدم. لطفا از کلمات کلیدی مثل 'بیجک'، 'پرداخت' یا 'تایید' استفاده کنید.");
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
