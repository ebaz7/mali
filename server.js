
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
app.use(express.static(path.join(__dirname, 'dist')));
app.use('/uploads', express.static(UPLOADS_DIR));

const getDb = () => {
    let db;
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            settings: {
                currentTrackingNumber: 1000,
                companyNames: [],
                defaultCompany: '',
                bankNames: [],
                commodityGroups: [],
                rolePermissions: {
                    admin: { canViewAll: true, canApproveFinancial: true, canApproveManager: true, canApproveCeo: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true },
                    ceo: { canViewAll: true, canApproveFinancial: false, canApproveManager: false, canApproveCeo: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true },
                    manager: { canViewAll: true, canApproveFinancial: false, canApproveManager: true, canApproveCeo: false, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true },
                    financial: { canViewAll: true, canApproveFinancial: true, canApproveManager: false, canApproveCeo: false, canEditOwn: true, canEditAll: false, canDeleteOwn: true, canDeleteAll: false, canManageTrade: false },
                    user: { canViewAll: false, canApproveFinancial: false, canApproveManager: false, canApproveCeo: false, canEditOwn: true, canEditAll: false, canDeleteOwn: true, canDeleteAll: false, canManageTrade: false }
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
    
    if (!db.settings.rolePermissions) {
        db.settings.rolePermissions = {
            admin: { canViewAll: true, canApproveFinancial: true, canApproveManager: true, canApproveCeo: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true },
            ceo: { canViewAll: true, canApproveFinancial: false, canApproveManager: false, canApproveCeo: true, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true },
            manager: { canViewAll: true, canApproveFinancial: false, canApproveManager: true, canApproveCeo: false, canEditOwn: true, canEditAll: true, canDeleteOwn: true, canDeleteAll: true, canManageTrade: true },
            financial: { canViewAll: true, canApproveFinancial: true, canApproveManager: false, canApproveCeo: false, canEditOwn: true, canEditAll: false, canDeleteOwn: true, canDeleteAll: false, canManageTrade: false },
            user: { canViewAll: false, canApproveFinancial: false, canApproveManager: false, canApproveCeo: false, canEditOwn: true, canEditAll: false, canDeleteOwn: true, canDeleteAll: false, canManageTrade: false }
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

app.get('/api/orders', (req, res) => { res.json(getDb().orders); });
app.post('/api/orders', (req, res) => {
    const db = getDb();
    const newOrder = req.body;
    
    // Concurrency Check: If tracking number exists, increment it
    let assignedTrackingNumber = newOrder.trackingNumber;
    const existing = db.orders.find(o => o.trackingNumber === assignedTrackingNumber);
    
    if (existing) {
        // Find the absolute max tracking number in the system
        const maxOrderNum = db.orders.reduce((max, o) => o.trackingNumber > max ? o.trackingNumber : max, 0);
        const maxSettingNum = db.settings.currentTrackingNumber;
        assignedTrackingNumber = Math.max(maxOrderNum, maxSettingNum) + 1;
        newOrder.trackingNumber = assignedTrackingNumber;
    }

    db.orders.unshift(newOrder);
    
    // Always update the setting if we moved past it
    if (assignedTrackingNumber > db.settings.currentTrackingNumber) {
        db.settings.currentTrackingNumber = assignedTrackingNumber;
    }
    
    saveDb(db);
    res.json(db.orders);
});
app.put('/api/orders/:id', (req, res) => {
    const db = getDb();
    const updatedOrder = req.body;
    const index = db.orders.findIndex(o => o.id === req.params.id);
    if (index !== -1) {
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
