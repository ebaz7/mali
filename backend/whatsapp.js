
import wwebjs from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';

const { Client, LocalAuth, MessageMedia } = wwebjs;

let client = null;
let isReady = false;
let qrCode = null;
let clientInfo = null;

export const initWhatsApp = (authDir) => {
    try {
        console.log(">>> Initializing WhatsApp Module...");
        
        // Browser path detection for different OS
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
            qrCode = qr; 
            isReady = false; 
            console.log(">>> WhatsApp QR Generated 📷 (Scan in Terminal)"); 
            qrcode.generate(qr, { small: true }); 
        });

        client.on('ready', () => { 
            isReady = true; 
            qrCode = null; 
            clientInfo = client.info.wid.user; 
            console.log(">>> WhatsApp Client Ready! ✅"); 
        });

        client.on('disconnected', (reason) => {
            console.log('>>> WhatsApp Disconnected:', reason);
            isReady = false;
            // Auto reconnect
            setTimeout(() => {
                console.log(">>> Reconnecting WhatsApp...");
                client.initialize();
            }, 5000);
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
    
    // Format Number: Handle 0912... -> 98912...@c.us
    let chatId = number;
    if (!number.includes('@')) {
        const cleanNum = number.replace(/\D/g, '');
        if (cleanNum.startsWith('0')) {
            chatId = `98${cleanNum.substring(1)}@c.us`;
        } else if (cleanNum.startsWith('98')) {
            chatId = `${cleanNum}@c.us`;
        } else {
            chatId = `${cleanNum}@c.us`; // Fallback
        }
    }

    // Handle Groups (if number is Group ID)
    if (number.includes('@g.us')) {
        chatId = number;
    }

    if (mediaData && mediaData.data) {
        const media = new MessageMedia(mediaData.mimeType, mediaData.data, mediaData.filename);
        await client.sendMessage(chatId, media, { caption: text || '' });
    } else if (text) {
        await client.sendMessage(chatId, text);
    }
};
