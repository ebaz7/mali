
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
// This ensures that if Cloudflare sends a request, we know if it was HTTPS or HTTP.
app.enable('trust proxy');

app.use((req, res, next) => {
    // 1. Allow localhost/private IPs to be insecure (for testing inside the VPS or local network)
    const isLocal = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.hostname.startsWith('192.168.') || req.hostname.startsWith('10.');
    
    // 2. If it's a local request, proceed.
    if (isLocal) return next();

    // 3. Check protocol. Cloudflare sets 'x-forwarded-proto'.
    // If user is on HTTP, redirect to HTTPS.
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        next();
    } else {
        // Redirect to HTTPS
        res.redirect(`https://${req.headers.host}${req.url}`);
    }
});
// -------------------------------------------

app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(UPLOADS_DIR));

const getDb = () => {
    let db;
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            settings: {
                currentTrackingNumber: 1602, // Default base number
                companyNames: [],
                defaultCompany: '',
                bankNames: [],
                commodityGroups: [],
                rolePermissions: {
                    admin: { canViewAll: true, canApproveFinancial: true, canApproveManager: true, canApproveCeo: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true, canManageSettings: true },
                    ceo: { canViewAll: true, canApproveFinancial: true, canApproveManager: true, canApproveCeo: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true, canManageSettings: true },
                    manager: { canViewAll: true, canApproveFinancial: false, canApproveManager: true, canApproveCeo: false, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true, canManageSettings: false },
                    financial: { canViewAll: true, canApproveFinancial: true, canApproveManager: false, canApproveCeo: false, canEditOwn: true, canEditAll: false, canDeleteOwn: true, canDeleteAll: false, canManageTrade: false, canManageSettings: false },
                    user: { canViewAll: false, canApproveFinancial: false, canApproveManager: false, canApproveCeo: false, canEditOwn: true, canEditAll: false, canDeleteOwn: true, canDeleteAll: false, canManageTrade: false, canManageSettings: false }
                }
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
    
    // Ensure permissions exist
    if (!db.settings.rolePermissions) {
        db.settings.rolePermissions = {
            admin: { canViewAll: true, canApproveFinancial: true, canApproveManager: true, canApproveCeo: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true, canManageSettings: true },
            ceo: { canViewAll: true, canApproveFinancial: true, canApproveManager: true, canApproveCeo: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true, canManageSettings: true },
            manager: { canViewAll: true, canApproveFinancial: false, canApproveManager: true, canApproveCeo: false, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true, canManageSettings: false },
            financial: { canViewAll: true, canApproveFinancial: true, canApproveManager: false, canApproveCeo: false, canEditOwn: true, canEditAll: false, canDeleteOwn: true, canDeleteAll: false, canManageTrade: false, canManageSettings: false },
            user: { canViewAll: false, canApproveFinancial: false, canApproveManager: false, canApproveCeo: false, canEditOwn: true, canEditAll: false, canDeleteOwn: true, canDeleteAll: false, canManageTrade: false, canManageSettings: false }
        };
        saveDb(db);
    }
    return db;
};

const saveDb = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

const performAutoBackup = () => {
    try {
        if (fs.existsSync(DB_FILE)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(BACKUPS_DIR, `backup-auto-${timestamp}.json`);
            fs.copyFileSync(DB_FILE, backupFile);
            
            const files = fs.readdirSync(BACKUPS_DIR);
            if (files.length > 48) {
                const sortedFiles = files
                    .map(file => ({ file, mtime: fs.statSync(path.join(BACKUPS_DIR, file)).mtime }))
                    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
                
                const filesToDelete = sortedFiles.slice(48);
                filesToDelete.forEach(f => fs.unlinkSync(path.join(BACKUPS_DIR, f.file)));
            }
            console.log(`[Backup] Auto backup created: ${backupFile}`);
        }
    } catch (error) {
        console.error('[Backup] Error:', error);
    }
};

// Backup every 30 minutes (1800000 ms)
setInterval(performAutoBackup, 1800000);
performAutoBackup();

// --- SMART TRACKING NUMBER LOGIC ---
const findNextAvailableTrackingNumber = (db) => {
    // The setting currentTrackingNumber acts as the "Floor" or "Base".
    // We start looking for gaps AFTER this number.
    const baseNum = (db.settings.currentTrackingNumber || 1602);
    const startNum = baseNum + 1;
    
    const existingNumbers = db.orders.map(o => o.trackingNumber).sort((a, b) => a - b);
    let nextNum = startNum;

    for (const num of existingNumbers) {
        if (num < nextNum) continue; // Ignore numbers below our start threshold
        if (num === nextNum) {
            nextNum++; // Number taken, increment
        } else if (num > nextNum) {
            // Found a gap! (num is 1605, nextNum is 1603 -> 1603 is free)
            return nextNum;
        }
    }
    return nextNum;
};

// --- DYNAMIC MANIFEST ENDPOINT ---
app.get('/api/manifest', (req, res) => {
    // PREVENT CACHING: Critical for icon updates to reflect immediately
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    const db = getDb();
    const settings = db.settings || {};
    // Append timestamp to icon URL to force client refresh
    const iconBase = settings.pwaIcon || "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-keep.png";
    const iconSrc = iconBase.includes('?') ? iconBase : `${iconBase}?v=${Date.now()}`;
    
    const manifest = {
      "name": "Payment Order System",
      "short_name": "PaymentSys",
      "start_url": "/",
      "display": "standalone",
      "background_color": "#f3f4f6",
      "theme_color": "#2563eb",
      "orientation": "portrait-primary",
      "icons": [
        {
          "src": iconSrc,
          "sizes": "192x192",
          "type": "image/png"
        },
        {
          "src": iconSrc,
          "sizes": "512x512",
          "type": "image/png"
        }
      ]
    };
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
app.post('/api/users', (req, res) => {
    const db = getDb();
    db.users.push(req.body);
    saveDb(db);
    res.json(db.users);
});
app.put('/api/users/:id', (req, res) => {
    const db = getDb();
    const idx = db.users.findIndex(u => u.id === req.params.id);
    if (idx !== -1) {
        db.users[idx] = { ...db.users[idx], ...req.body };
        saveDb(db);
        res.json(db.users);
    } else res.status(404).json({ message: 'User not found' });
});
app.delete('/api/users/:id', (req, res) => {
    const db = getDb();
    db.users = db.users.filter(u => u.id !== req.params.id);
    saveDb(db);
    res.json(db.users);
});

app.get('/api/settings', (req, res) => { res.json(getDb().settings); });
app.post('/api/settings', (req, res) => {
    const db = getDb();
    db.settings = req.body;
    saveDb(db);
    res.json(db.settings);
});

app.get('/api/chat', (req, res) => { res.json(getDb().messages); });
app.post('/api/chat', (req, res) => {
    const db = getDb();
    const newMsg = req.body;
    if (db.messages.length > 500) db.messages = db.messages.slice(-500);
    db.messages.push(newMsg);
    saveDb(db);
    res.json(db.messages);
});
app.put('/api/chat/:id', (req, res) => {
    const db = getDb();
    const idx = db.messages.findIndex(m => m.id === req.params.id);
    if (idx !== -1) {
        db.messages[idx] = { ...db.messages[idx], ...req.body };
        saveDb(db);
        res.json(db.messages);
    } else res.status(404).json({ message: 'Message not found' });
});
app.delete('/api/chat/:id', (req, res) => {
    const db = getDb();
    db.messages = db.messages.filter(m => m.id !== req.params.id);
    saveDb(db);
    res.json(db.messages);
});

app.get('/api/groups', (req, res) => { res.json(getDb().groups); });
app.post('/api/groups', (req, res) => {
    const db = getDb();
    db.groups.push(req.body);
    saveDb(db);
    res.json(db.groups);
});
app.put('/api/groups/:id', (req, res) => {
    const db = getDb();
    const idx = db.groups.findIndex(g => g.id === req.params.id);
    if (idx !== -1) {
        db.groups[idx] = { ...db.groups[idx], ...req.body };
        saveDb(db);
        res.json(db.groups);
    } else res.status(404).json({ message: 'Group not found' });
});
app.delete('/api/groups/:id', (req, res) => {
    const db = getDb();
    db.groups = db.groups.filter(g => g.id !== req.params.id);
    db.messages = db.messages.filter(m => m.groupId !== req.params.id);
    db.tasks = db.tasks.filter(t => t.groupId !== req.params.id);
    saveDb(db);
    res.json(db.groups);
});

app.get('/api/tasks', (req, res) => { res.json(getDb().tasks); });
app.post('/api/tasks', (req, res) => {
    const db = getDb();
    db.tasks.push(req.body);
    saveDb(db);
    res.json(db.tasks);
});
app.put('/api/tasks/:id', (req, res) => {
    const db = getDb();
    const idx = db.tasks.findIndex(t => t.id === req.params.id);
    if (idx !== -1) {
        db.tasks[idx] = req.body;
        saveDb(db);
        res.json(db.tasks);
    } else res.status(404).json({error: 'Task not found'});
});
app.delete('/api/tasks/:id', (req, res) => {
    const db = getDb();
    db.tasks = db.tasks.filter(t => t.id !== req.params.id);
    saveDb(db);
    res.json(db.tasks);
});

app.get('/api/trade', (req, res) => { res.json(getDb().tradeRecords || []); });
app.post('/api/trade', (req, res) => {
    const db = getDb();
    db.tradeRecords = db.tradeRecords || [];
    db.tradeRecords.push(req.body);
    saveDb(db);
    res.json(db.tradeRecords);
});
app.put('/api/trade/:id', (req, res) => {
    const db = getDb();
    db.tradeRecords = db.tradeRecords || [];
    const idx = db.tradeRecords.findIndex(t => t.id === req.params.id);
    if (idx !== -1) {
        db.tradeRecords[idx] = req.body;
        saveDb(db);
        res.json(db.tradeRecords);
    } else res.status(404).json({error: 'Trade record not found'});
});
app.delete('/api/trade/:id', (req, res) => {
    const db = getDb();
    db.tradeRecords = (db.tradeRecords || []).filter(t => t.id !== req.params.id);
    saveDb(db);
    res.json(db.tradeRecords);
});

app.post('/api/upload', (req, res) => {
    try {
        const { fileName, fileData } = req.body;
        const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).send('Invalid base64 string format');
        const buffer = Buffer.from(matches[2], 'base64');
        const uniqueName = Date.now() + '_' + fileName;
        const filePath = path.join(UPLOADS_DIR, uniqueName);
        fs.writeFileSync(filePath, buffer);
        res.json({ url: `/uploads/${uniqueName}`, fileName: uniqueName });
    } catch (e) {
        res.status(500).send('Upload failed');
    }
});

// New Endpoint to get next available number (filling gaps)
app.get('/api/next-tracking-number', (req, res) => {
    const db = getDb();
    const nextNum = findNextAvailableTrackingNumber(db);
    res.json({ nextTrackingNumber: nextNum });
});

app.get('/api/orders', (req, res) => { res.json(getDb().orders); });
app.post('/api/orders', (req, res) => {
    const db = getDb();
    const newOrder = req.body;
    
    // Concurrency & Gap Filling Check
    let assignedTrackingNumber = newOrder.trackingNumber;
    
    const isTaken = db.orders.some(o => o.trackingNumber === assignedTrackingNumber);
    if (isTaken) {
        assignedTrackingNumber = findNextAvailableTrackingNumber(db);
        newOrder.trackingNumber = assignedTrackingNumber;
    }

    db.orders.unshift(newOrder);
    
    // NOTE: We do NOT auto-update db.settings.currentTrackingNumber here.
    // The user wants that setting to be a fixed "Floor" (معیار شروع).
    // The system will just fill up from there.
    
    saveDb(db);
    res.json(db.orders);
});
app.put('/api/orders/:id', (req, res) => {
    const db = getDb();
    const updatedOrder = req.body;
    const index = db.orders.findIndex(o => o.id === req.params.id);
    if (index !== -1) {
        // Prevent duplicate tracking numbers during edit (unless it's the same order)
        const duplicate = db.orders.find(o => o.trackingNumber === updatedOrder.trackingNumber && o.id !== updatedOrder.id);
        if (duplicate) {
             return res.status(400).json({ message: 'Tracking number already exists' });
        }

        db.orders[index] = updatedOrder;
        saveDb(db);
        res.json(db.orders);
    } else res.status(404).json({ message: 'Order not found' });
});
app.delete('/api/orders/:id', (req, res) => {
    const db = getDb();
    db.orders = db.orders.filter(o => o.id !== req.params.id);
    saveDb(db);
    res.json(db.orders);
});

app.get('/api/backup', (req, res) => {
    const db = getDb();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=database_backup.json');
    res.json(db);
});
app.post('/api/restore', (req, res) => {
    const newData = req.body;
    if (!newData || !Array.isArray(newData.orders) || !Array.isArray(newData.users)) {
        return res.status(400).json({ message: 'Invalid backup file format' });
    }
    saveDb(newData);
    res.json({ success: true, message: 'Database restored successfully' });
});

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('React App needs to be built. Run "npm run build" first.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
