
import { PaymentOrder, User, UserRole, SystemSettings, ChatMessage, ChatGroup, GroupTask, TradeRecord } from '../types';
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
    TRADE: 'app_data_trade'
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
        const timeoutId = setTimeout(() => controller.abort(), 5000);

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
        throw new Error("Server response invalid or not found");
    } catch (error) {
        await delay(200);
        
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
        
        // --- SETTINGS ---
        if (endpoint === '/settings') {
            if (method === 'GET') return getLocalData<SystemSettings>(LS_KEYS.SETTINGS, { currentTrackingNumber: 1000, companyNames: [], defaultCompany: '', bankNames: [], commodityGroups: [], rolePermissions: {} }) as unknown as T;
            if (method === 'POST') { setLocalData(LS_KEYS.SETTINGS, body); return body as unknown as T; }
        }

        // --- CHAT GROUPS (UPDATED) ---
        if (endpoint === '/groups' && method === 'GET') {
            return getLocalData<ChatGroup[]>(LS_KEYS.GROUPS, []) as unknown as T;
        }
        if (endpoint === '/groups' && method === 'POST') {
            const groups = getLocalData<ChatGroup[]>(LS_KEYS.GROUPS, []);
            groups.push(body);
            setLocalData(LS_KEYS.GROUPS, groups);
            return groups as unknown as T;
        }
        if (endpoint.startsWith('/groups/')) {
            const id = endpoint.split('/').pop();
            let groups = getLocalData<ChatGroup[]>(LS_KEYS.GROUPS, []);
            if (method === 'PUT') {
                const idx = groups.findIndex(g => g.id === id);
                if (idx !== -1) { groups[idx] = body; setLocalData(LS_KEYS.GROUPS, groups); }
                return groups as unknown as T;
            }
            if (method === 'DELETE') {
                groups = groups.filter(g => g.id !== id);
                setLocalData(LS_KEYS.GROUPS, groups);
                // Clean up related data (optional but good practice)
                // Note: Messages and tasks cleanup is usually handled in logic or server, 
                // but doing it here for mock completeness if needed, or rely on logic in `server.js` equivalent
                return groups as unknown as T;
            }
        }


        // --- UPLOAD (Mock) ---
        if (endpoint === '/upload' && method === 'POST') {
            return { fileName: body.fileName, url: body.fileData } as unknown as T;
        }

        throw new Error(`Mock endpoint not found: ${endpoint}`);
    }
};