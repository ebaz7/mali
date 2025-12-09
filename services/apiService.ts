
import { PaymentOrder, User, UserRole, SystemSettings, ChatMessage, ChatGroup, GroupTask, TradeRecord, WarehouseItem, WarehouseTransaction } from '../types';
import { INITIAL_ORDERS } from '../constants';

const API_BASE_URL = '/api';

const MOCK_USERS: User[] = [
    { id: '1', username: 'admin', password: '123', fullName: 'مدیر سیستم', role: UserRole.ADMIN, canManageTrade: true }
];

const LS_KEYS = {
    ORDERS: 'app_data_orders',
    USERS: 'app_data_users',
    SETTINGS: 'app_data_settings',
    CHAT: 'app_data_chat',
    GROUPS: 'app_data_groups',
    TASKS: 'app_data_tasks',
    TRADE: 'app_data_trade',
    WH_ITEMS: 'app_data_wh_items',
    WH_TX: 'app_data_wh_tx'
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getLocalData = <T>(key: string, defaultData: T): T => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultData;
    } catch {
        return defaultData;
    }
};

const setLocalData = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
};

export const apiCall = async <T>(endpoint: string, method: string = 'GET', body?: any): Promise<T> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); 

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const contentType = response.headers.get("content-type");
        if (response.ok && contentType && contentType.includes("application/json")) {
            return await response.json();
        }
        
        if (response.ok && (!contentType || !contentType.includes("application/json"))) {
             return { success: true } as unknown as T;
        }

        throw new Error(`Server Error: ${response.status}`);
    } catch (error) {
        console.warn(`API Fallback (Mock) triggered for: ${endpoint}`, error);
        await delay(500);
        
        // --- AUTH ---
        if (endpoint === '/login' && method === 'POST') {
            const users = getLocalData<User[]>(LS_KEYS.USERS, MOCK_USERS);
            const user = users.find(u => u.username === body.username && u.password === body.password);
            if (user) return user as unknown as T;
            throw new Error('Invalid credentials');
        }

        // --- ORDERS ---
        if (endpoint === '/orders') {
            if (method === 'GET') return getLocalData<PaymentOrder[]>(LS_KEYS.ORDERS, INITIAL_ORDERS) as unknown as T;
            if (method === 'POST') {
                const orders = getLocalData<PaymentOrder[]>(LS_KEYS.ORDERS, INITIAL_ORDERS);
                orders.unshift(body);
                setLocalData(LS_KEYS.ORDERS, orders);
                return orders as unknown as T;
            }
        }
        if (endpoint.startsWith('/orders/')) {
            const id = endpoint.split('/').pop();
            const orders = getLocalData<PaymentOrder[]>(LS_KEYS.ORDERS, INITIAL_ORDERS);
            if (method === 'PUT') {
                const index = orders.findIndex(o => o.id === id);
                if (index !== -1) { orders[index] = body; setLocalData(LS_KEYS.ORDERS, orders); }
                return orders as unknown as T;
            }
            if (method === 'DELETE') {
                const newOrders = orders.filter(o => o.id !== id);
                setLocalData(LS_KEYS.ORDERS, newOrders);
                return newOrders as unknown as T;
            }
        }

        // --- TRADE ---
        if (endpoint === '/trade') {
            if (method === 'GET') return getLocalData<TradeRecord[]>(LS_KEYS.TRADE, []) as unknown as T;
            if (method === 'POST') {
                const trades = getLocalData<TradeRecord[]>(LS_KEYS.TRADE, []);
                trades.push(body);
                setLocalData(LS_KEYS.TRADE, trades);
                return trades as unknown as T;
            }
        }
        if (endpoint.startsWith('/trade/')) {
             const id = endpoint.split('/').pop();
             let trades = getLocalData<TradeRecord[]>(LS_KEYS.TRADE, []);
             if (method === 'PUT') {
                 const idx = trades.findIndex(t => t.id === id);
                 if (idx !== -1) { trades[idx] = body; setLocalData(LS_KEYS.TRADE, trades); }
                 return trades as unknown as T;
             }
             if (method === 'DELETE') {
                 trades = trades.filter(t => t.id !== id);
                 setLocalData(LS_KEYS.TRADE, trades);
                 return trades as unknown as T;
             }
        }
        
        // --- WAREHOUSE ---
        if (endpoint === '/warehouse/items') {
            if (method === 'GET') return getLocalData<WarehouseItem[]>(LS_KEYS.WH_ITEMS, []) as unknown as T;
            if (method === 'POST') {
                const items = getLocalData<WarehouseItem[]>(LS_KEYS.WH_ITEMS, []);
                items.push(body);
                setLocalData(LS_KEYS.WH_ITEMS, items);
                return items as unknown as T;
            }
        }
        if (endpoint.startsWith('/warehouse/items/')) {
            const id = endpoint.split('/').pop();
            let items = getLocalData<WarehouseItem[]>(LS_KEYS.WH_ITEMS, []);
            
            // --- NEW PUT HANDLER FOR ITEMS ---
            if (method === 'PUT') {
                const idx = items.findIndex(i => i.id === id);
                if (idx !== -1) {
                    items[idx] = body;
                    setLocalData(LS_KEYS.WH_ITEMS, items);
                }
                return items as unknown as T;
            }

            if (method === 'DELETE') {
                items = items.filter(i => i.id !== id);
                setLocalData(LS_KEYS.WH_ITEMS, items);
                return items as unknown as T;
            }
        }
        if (endpoint === '/warehouse/transactions') {
            if (method === 'GET') return getLocalData<WarehouseTransaction[]>(LS_KEYS.WH_TX, []) as unknown as T;
            if (method === 'POST') {
                const txs = getLocalData<WarehouseTransaction[]>(LS_KEYS.WH_TX, []);
                txs.unshift(body);
                setLocalData(LS_KEYS.WH_TX, txs);
                return txs as unknown as T;
            }
        }
        if (endpoint.startsWith('/warehouse/transactions/')) {
            const id = endpoint.split('/').pop();
            let txs = getLocalData<WarehouseTransaction[]>(LS_KEYS.WH_TX, []);
            
            if (method === 'PUT') {
                const idx = txs.findIndex(t => t.id === id);
                if (idx !== -1) { 
                    txs[idx] = body; 
                    setLocalData(LS_KEYS.WH_TX, txs); 
                }
                return txs as unknown as T;
            }
            
            if (method === 'DELETE') {
                txs = txs.filter(t => t.id !== id);
                setLocalData(LS_KEYS.WH_TX, txs);
                return txs as unknown as T;
            }
        }

        // --- SETTINGS ---
        if (endpoint === '/settings') {
            if (method === 'GET') return getLocalData<SystemSettings>(LS_KEYS.SETTINGS, { currentTrackingNumber: 1000, companyNames: [], companies: [], defaultCompany: '', bankNames: [], commodityGroups: [], rolePermissions: {}, warehouseSequences: {} } as any) as unknown as T;
            if (method === 'POST') { setLocalData(LS_KEYS.SETTINGS, body); return body as unknown as T; }
        }

        // --- CHAT MESSAGES ---
        if (endpoint === '/chat') {
            if (method === 'GET') return getLocalData<ChatMessage[]>(LS_KEYS.CHAT, []) as unknown as T;
            if (method === 'POST') {
                const msgs = getLocalData<ChatMessage[]>(LS_KEYS.CHAT, []);
                if (msgs.length > 500) msgs.shift(); 
                msgs.push(body);
                setLocalData(LS_KEYS.CHAT, msgs);
                return msgs as unknown as T;
            }
        }
        if (endpoint.startsWith('/chat/')) {
            const id = endpoint.split('/').pop();
            let msgs = getLocalData<ChatMessage[]>(LS_KEYS.CHAT, []);
            if (method === 'PUT') {
                const idx = msgs.findIndex(m => m.id === id);
                if (idx !== -1) { msgs[idx] = body; setLocalData(LS_KEYS.CHAT, msgs); }
                return msgs as unknown as T;
            }
            if (method === 'DELETE') {
                msgs = msgs.filter(m => m.id !== id);
                setLocalData(LS_KEYS.CHAT, msgs);
                return msgs as unknown as T;
            }
        }

        // --- GROUPS & TASKS ---
        if (endpoint === '/groups' || endpoint.startsWith('/groups/')) return [] as unknown as T;
        if (endpoint === '/tasks' || endpoint.startsWith('/tasks/')) return [] as unknown as T;
        if (endpoint === '/users' && method === 'GET') return getLocalData<User[]>(LS_KEYS.USERS, MOCK_USERS) as unknown as T;

        // --- WHATSAPP & AI (Mock Responses for Offline Mode) ---
        if (endpoint === '/send-whatsapp') {
            return { success: true, message: 'Mock: پیام واتساپ (شبیه‌سازی شده) ارسال شد (سرور قطع است).' } as unknown as T;
        }
        if (endpoint === '/whatsapp/status') {
            return { ready: false, qr: null, user: null } as unknown as T;
        }
        if (endpoint === '/whatsapp/groups') {
            return { success: true, groups: [] } as unknown as T;
        }
        if (endpoint === '/whatsapp/logout') {
            return { success: true } as unknown as T;
        }
        if (endpoint === '/ai-request') {
            return { reply: "این یک پاسخ شبیه‌سازی شده از هوش مصنوعی است (ارتباط با سرور برقرار نیست)." } as unknown as T;
        }
        if (endpoint === '/analyze-payment') {
            return { 
                recommendation: "پرداخت عادی", 
                score: 80, 
                reasons: ["تحلیل آفلاین: تاریخ مناسب است.", "مبلغ در محدوده مجاز است."],
                isOffline: true 
            } as unknown as T;
        }

        // --- UPLOAD ---
        if (endpoint === '/upload' && method === 'POST') {
            return { fileName: body.fileName, url: body.fileData } as unknown as T;
        }
        
        if (endpoint === '/next-tracking-number') {
            const settings = getLocalData<SystemSettings>(LS_KEYS.SETTINGS, { currentTrackingNumber: 1000 } as any);
            return { nextTrackingNumber: settings.currentTrackingNumber + 1 } as unknown as T;
        }

        console.error(`Mock endpoint not found: ${endpoint}`);
        throw new Error(`Mock endpoint not found: ${endpoint}`);
    }
};
