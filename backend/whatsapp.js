
import wwebjs from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// IMPORT NEW MODULES
import { parseMessage } from './whatsapp/parser.js';
import * as Actions from './whatsapp/actions.js';

const { Client, LocalAuth, MessageMedia } = wwebjs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'database.json');

let client = null;
let isReady = false;
let qrCode = null;
let clientInfo = null;

// --- HELPERS ---
const getDb = () => {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }
    } catch (e) { console.error("DB Read Error", e); }
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
                    msg.reply(`🤖 *راهنمای دستورات*\n\n✅ *تایید دستورات:*\n"تایید پرداخت [شماره]"\n"تایید خروج [شماره]"\n\n💰 *ثبت پرداخت کامل:*\n"دستور پرداخت [مبلغ] به [نام] بابت [شرح] بانک [نام بانک]"\n\n🚛 *ثبت بیجک کامل:*\n"بیجک [تعداد] [کالا] برای [گیرنده] راننده [نام] پلاک [شماره]"\n\n📊 *گزارش کامل:* "گزارش"`);
                    return;
                }

                // 1. PARSE
                const result = await parseMessage(body, db);
                if (!result) return;

                const { intent, args } = result;
                let replyText = '';

                // 2. EXECUTE ACTION
                switch (intent) {
                    case 'AMBIGUOUS':
                        replyText = `⚠️ شماره ${args.number} تکراری است. لطفا مشخص کنید:\n"تایید پرداخت ${args.number}" یا "تایید خروج ${args.number}"`;
                        break;
                    case 'NOT_FOUND':
                        replyText = `❌ سندی با شماره ${args.number} یافت نشد.`;
                        break;
                    case 'APPROVE_PAYMENT':
                        replyText = Actions.handleApprovePayment(db, args.number);
                        break;
                    case 'REJECT_PAYMENT':
                        replyText = Actions.handleRejectPayment(db, args.number);
                        break;
                    case 'APPROVE_EXIT':
                        replyText = Actions.handleApproveExit(db, args.number);
                        break;
                    case 'REJECT_EXIT':
                        replyText = Actions.handleRejectExit(db, args.number);
                        break;
                    case 'CREATE_PAYMENT':
                        replyText = Actions.handleCreatePayment(db, args);
                        break;
                    case 'CREATE_BIJAK':
                        replyText = Actions.handleCreateBijak(db, args);
                        break;
                    case 'REPORT':
                        replyText = Actions.handleReport(db);
                        break;
                }

                if (replyText) msg.reply(replyText);

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
