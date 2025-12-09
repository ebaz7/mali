
import { GoogleGenAI } from "@google/genai";

export const parseMessage = async (text, db) => {
    // Clean text: Normalize Persian numbers to English
    const cleanText = text.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();

    // --- 1. APPROVAL / REJECTION LOGIC ---
    
    // Payment Approval: "تایید پرداخت 1001"
    const payApproveMatch = cleanText.match(/^(?:تایید|ok|yes)\s+(?:پرداخت|سند|واریز|هزینه|p)\s*(\d+)$/i);
    if (payApproveMatch) return { intent: 'APPROVE_PAYMENT', args: { number: payApproveMatch[1] } };

    // Payment Rejection: "رد پرداخت 1001"
    const payRejectMatch = cleanText.match(/^(?:رد|کنسل|no|reject)\s+(?:پرداخت|سند|واریز|هزینه|p)\s*(\d+)$/i);
    if (payRejectMatch) return { intent: 'REJECT_PAYMENT', args: { number: payRejectMatch[1] } };

    // Exit Approval: "تایید خروج 2001"
    const exitApproveMatch = cleanText.match(/^(?:تایید|ok|yes)\s+(?:خروج|بیجک|حواله|بار|مجوز|b)\s*(\d+)$/i);
    if (exitApproveMatch) return { intent: 'APPROVE_EXIT', args: { number: exitApproveMatch[1] } };

    // Exit Rejection: "رد خروج 2001"
    const exitRejectMatch = cleanText.match(/^(?:رد|کنسل|no|reject)\s+(?:خروج|بیجک|حواله|بار|مجوز|b)\s*(\d+)$/i);
    if (exitRejectMatch) return { intent: 'REJECT_EXIT', args: { number: exitRejectMatch[1] } };

    // Generic Approval (Smart ID Check): "تایید 1001"
    const genericMatch = cleanText.match(/^(?:تایید|اوکی|ok|رد|کنسل)\s+(\d+)$/i);
    if (genericMatch) {
        const action = cleanText.match(/رد|کنسل|no|reject/i) ? 'REJECT' : 'APPROVE';
        const number = genericMatch[1];
        
        // Check for ID collision in DB
        const order = db.orders.find(o => o.trackingNumber == number);
        const permit = db.exitPermits.find(p => p.permitNumber == number);

        if (order && permit) return { intent: 'AMBIGUOUS', args: { number } };
        if (order) return { intent: `${action}_PAYMENT`, args: { number } };
        if (permit) return { intent: `${action}_EXIT`, args: { number } };
        return { intent: 'NOT_FOUND', args: { number } };
    }

    // --- 2. CREATION LOGIC (DETAILED) ---

    // Payment: "دستور پرداخت [مبلغ] به [نام] بابت [شرح] (بانک [نام])"
    const payMatch = cleanText.match(/(?:دستور پرداخت|ثبت پرداخت|واریز)\s+(\d+(?:[.,]\d+)?)\s*(?:ریال|تومان)?\s*(?:به|برای|در وجه)\s+(.+?)\s+(?:بابت|شرح)\s+(.+?)(?:\s+(?:از|بانک)\s+(.+))?$/);
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
    
    // Bijak: "بیجک [تعداد] [کالا] برای [گیرنده] (راننده [نام]) (پلاک [شماره])"
    // Supports optional driver and plate
    const bijakMatch = cleanText.match(/(?:بیجک|خروج|حواله)\s+(\d+)\s*(?:کارتن|عدد|شاخه)?\s+(.+?)\s+(?:برای|به)\s+(.+?)(?:\s+(?:راننده)\s+(.+?))?(?:\s+(?:پلاک)\s+(.+))?$/);
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

    // --- 3. REPORTING ---
    if (cleanText.includes('گزارش') || cleanText.includes('کارتابل')) return { intent: 'REPORT' };
    if (cleanText.includes('راهنما') || cleanText === 'help') return { intent: 'HELP' };

    // --- 4. AI FALLBACK ---
    if (db.settings.geminiApiKey && !cleanText.startsWith('!')) {
        try {
            const ai = new GoogleGenAI({ apiKey: db.settings.geminiApiKey });
            const prompt = `Extract entities from this Persian command. Output JSON ONLY: { "intent": "...", "args": { ... } }. 
            Intents: CREATE_PAYMENT (args: amount, payee, description, bank), CREATE_BIJAK (args: count, itemName, recipient, driver, plate), REPORT. 
            Input: "${cleanText}"`;
            
            const response = await ai.models.generateContent({ 
                model: "gemini-2.5-flash", 
                contents: [{ role: 'user', parts: [{ text: prompt }] }] 
            });
            
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) return JSON.parse(jsonMatch[0]);
        } catch (e) { /* Ignore AI error */ }
    }

    return null;
};
