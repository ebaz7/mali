
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';

let bot = null;

export const initTelegram = (token) => {
    if (!token) {
        console.log(">>> Telegram: No token provided in settings.");
        return;
    }
    try {
        // Polling is false to avoid conflicts, we use it for sending notifications mainly
        bot = new TelegramBot(token, { polling: false });
        console.log(">>> Telegram Bot Module Loaded ✅");
    } catch (e) {
        console.error(">>> Telegram Init Error:", e.message);
    }
};

export const sendMessage = async (chatId, text) => {
    if (!bot || !chatId) return;
    try {
        await bot.sendMessage(chatId, text);
        console.log(`>>> Telegram: Sent message to ${chatId}`);
    } catch (e) {
        console.error(">>> Telegram Send Msg Error:", e.message);
    }
};

export const sendDocument = async (chatId, filePath, caption) => {
    if (!bot || !chatId) return;
    try {
        if (fs.existsSync(filePath)) {
            await bot.sendDocument(chatId, fs.createReadStream(filePath), { caption });
            console.log(`>>> Telegram: Sent doc to ${chatId}`);
        }
    } catch (e) {
        console.error(">>> Telegram Send Doc Error:", e.message);
    }
};

export const getBot = () => bot;
