
// Helper to save DB
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', '..', 'database.json');

const saveDb = (data) => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (e) { console.error("DB Write Error", e); }
};

const generateUUID = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
const formatCurrency = (amount) => new Intl.NumberFormat('fa-IR').format(amount) + ' ریال';

// --- ACTIONS ---

export const handleCreatePayment = (db, args) => {
    const trackingNum = (db.settings.currentTrackingNumber || 1000) + 1;
    db.settings.currentTrackingNumber = trackingNum;
    
    const amount = typeof args.amount === 'string' ? parseInt(args.amount.replace(/[^0-9]/g, '')) : args.amount;
    
    // Create detailed payment structure
    const newOrder = { 
        id: generateUUID(), 
        trackingNumber: trackingNum, 
        date: new Date().toISOString().split('T')[0], 
        payee: args.payee, 
        totalAmount: amount, 
        description: args.description || 'ثبت از طریق واتساپ', 
        status: 'در انتظار بررسی مالی', 
        requester: 'WhatsApp', 
        payingCompany: db.settings.defaultCompany, 
        paymentDetails: [
            {
                id: generateUUID(), 
                method: 'حواله بانکی', 
                amount: amount, 
                bankName: args.bank || 'نامشخص',
                description: 'ثبت خودکار'
            }
        ], 
        createdAt: Date.now() 
    };
    
    db.orders.unshift(newOrder);
    saveDb(db);
    return `✅ *دستور پرداخت ثبت شد*\nشماره: ${trackingNum}\nمبلغ: ${formatCurrency(amount)}\nذینفع: ${args.payee}\nبانک: ${args.bank || '-'}`;
};

export const handleCreateBijak = (db, args) => {
    const company = db.settings.defaultCompany || 'نامشخص';
    const nextSeq = (db.settings.warehouseSequences?.[company] || 1000) + 1;
    db.settings.warehouseSequences = { ...db.settings.warehouseSequences, [company]: nextSeq };
    
    const newTx = { 
        id: generateUUID(), 
        type: 'OUT', 
        date: new Date().toISOString(), 
        company: company, 
        number: nextSeq, 
        recipientName: args.recipient,
        driverName: args.driver,   // Capture Driver
        plateNumber: args.plate,   // Capture Plate
        items: [
            {
                itemId: generateUUID(), 
                itemName: args.itemName, 
                quantity: Number(args.count), 
                weight: 0,
                unitPrice: 0
            }
        ], 
        createdAt: Date.now(), 
        createdBy: 'WhatsApp' 
    };
    
    db.warehouseTransactions.unshift(newTx);
    saveDb(db);
    
    let msg = `📦 *حواله خروج (بیجک) صادر شد*\nشماره: ${nextSeq}\nکالا: ${args.count} عدد ${args.itemName}\nگیرنده: ${args.recipient}`;
    if (args.driver) msg += `\nراننده: ${args.driver}`;
    if (args.plate) msg += `\nپلاک: ${args.plate}`;
    return msg;
};

export const handleApprovePayment = (db, number) => {
    const order = db.orders.find(o => o.trackingNumber == number);
    if (!order) return "❌ دستور پرداخت یافت نشد.";
    
    let oldStatus = order.status;
    if (order.status === 'در انتظار بررسی مالی') order.status = 'تایید مالی / در انتظار مدیریت';
    else if (order.status === 'تایید مالی / در انتظار مدیریت') order.status = 'تایید مدیریت / در انتظار مدیرعامل';
    else if (order.status === 'تایید مدیریت / در انتظار مدیرعامل') order.status = 'تایید نهایی';
    else if (order.status === 'تایید نهایی') return "ℹ️ این سند قبلاً تایید نهایی شده است.";
    
    saveDb(db);
    return `✅ *تایید شد*\nدستور پرداخت: ${number}\nوضعیت قبلی: ${oldStatus}\nوضعیت جدید: ${order.status}`;
};

export const handleRejectPayment = (db, number) => {
    const order = db.orders.find(o => o.trackingNumber == number);
    if (!order) return "❌ دستور پرداخت یافت نشد.";
    
    order.status = 'رد شده';
    saveDb(db);
    return `🚫 دستور پرداخت ${number} رد شد.`;
};

export const handleApproveExit = (db, number) => {
    const permit = db.exitPermits.find(p => p.permitNumber == number);
    if (!permit) return "❌ مجوز خروج یافت نشد.";
    
    let oldStatus = permit.status;
    if (permit.status === 'در انتظار تایید مدیرعامل') permit.status = 'تایید مدیرعامل / در انتظار خروج (کارخانه)';
    else if (permit.status === 'تایید مدیرعامل / در انتظار خروج (کارخانه)') permit.status = 'خارج شده (بایگانی)';
    else return "ℹ️ وضعیت این مجوز قابل تغییر نیست.";
    
    saveDb(db);
    return `✅ *تایید شد*\nمجوز خروج: ${number}\nوضعیت جدید: ${permit.status}`;
};

export const handleRejectExit = (db, number) => {
    const permit = db.exitPermits.find(p => p.permitNumber == number);
    if (!permit) return "❌ مجوز خروج یافت نشد.";
    
    permit.status = 'رد شده';
    saveDb(db);
    return `🚫 مجوز خروج ${number} رد شد.`;
};

export const handleReport = (db) => {
    const pendingOrders = db.orders.filter(o => o.status !== 'تایید نهایی' && o.status !== 'رد شده');
    const pendingExits = db.exitPermits.filter(p => p.status !== 'خارج شده (بایگانی)' && p.status !== 'رد شده');
    
    let report = `📊 *گزارش وضعیت سیستم*\n\n`;
    
    // Payments Detail
    report += `💰 *دستور پرداخت‌های باز (${pendingOrders.length}):*\n`;
    if (pendingOrders.length > 0) {
        pendingOrders.slice(0, 5).forEach(o => {
            report += `- #${o.trackingNumber} | ${o.payee} | ${formatCurrency(o.totalAmount)}\n  وضعیت: ${o.status}\n`;
        });
        if (pendingOrders.length > 5) report += `... و ${pendingOrders.length - 5} مورد دیگر\n`;
    } else {
        report += "موردی نیست.\n";
    }
    
    report += `\n----------------\n\n`;

    // Exits Detail
    report += `🚛 *مجوزهای خروج باز (${pendingExits.length}):*\n`;
    if (pendingExits.length > 0) {
        pendingExits.slice(0, 5).forEach(p => {
            const items = p.items?.map(i => i.goodsName).join(',') || p.goodsName || 'کالا';
            report += `- #${p.permitNumber} | ${items} | ${p.recipientName}\n  وضعیت: ${p.status}\n`;
        });
        if (pendingExits.length > 5) report += `... و ${pendingExits.length - 5} مورد دیگر\n`;
    } else {
        report += "موردی نیست.\n";
    }

    return report;
};
