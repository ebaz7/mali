
import React, { useState, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CreateOrder from './components/CreateOrder';
import ManageOrders from './components/ManageOrders';
import Login from './components/Login';
import ManageUsers from './components/ManageUsers';
import Settings from './components/Settings';
import ChatRoom from './components/ChatRoom';
import TradeModule from './components/TradeModule';
import { getOrders, getSettings } from './services/storageService';
import { getCurrentUser } from './services/authService';
import { PaymentOrder, User, OrderStatus, UserRole, AppNotification, SystemSettings } from './types';
import { Loader2 } from 'lucide-react';
import { sendNotification } from './services/notificationService';
import { generateUUID } from './constants';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [settings, setSettings] = useState<SystemSettings | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [manageOrdersInitialTab, setManageOrdersInitialTab] = useState<'current' | 'archive'>('current');
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<OrderStatus | 'pending_all' | null>(null);
  const prevOrdersRef = useRef<PaymentOrder[]>([]);
  const isFirstLoad = useRef(true);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_LIMIT = 60 * 60 * 1000; 

  useEffect(() => {
    const user = getCurrentUser();
    if (user) setCurrentUser(user);
  }, []);

  const handleLogout = () => {
    setCurrentUser(null);
    prevOrdersRef.current = [];
    isFirstLoad.current = true;
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
  };

  useEffect(() => {
    if (currentUser) {
        const resetIdleTimer = () => {
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
            idleTimeoutRef.current = setTimeout(() => { handleLogout(); alert("به دلیل عدم فعالیت به مدت ۱ ساعت، از سیستم خارج شدید."); }, IDLE_LIMIT);
        };
        const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
        events.forEach(event => window.addEventListener(event, resetIdleTimer));
        resetIdleTimer();
        return () => { events.forEach(event => window.removeEventListener(event, resetIdleTimer)); if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current); };
    }
  }, [currentUser]);

  const addAppNotification = (title: string, message: string) => {
      setNotifications(prev => [{ id: generateUUID(), title, message, timestamp: Date.now(), read: false }, ...prev]);
  };

  const loadData = async (silent = false) => {
    if (!currentUser) return;
    if (!silent) setLoading(true);
    try {
        const [ordersData, settingsData] = await Promise.all([getOrders(), getSettings()]);
        setSettings(settingsData);
        if (!isFirstLoad.current && silent) checkForNotifications(prevOrdersRef.current, ordersData, currentUser);
        prevOrdersRef.current = ordersData;
        setOrders(ordersData);
        isFirstLoad.current = false;
    } catch (error) { console.error("Failed to load data", error); } finally { if (!silent) setLoading(false); }
  };

  const checkForNotifications = (oldList: PaymentOrder[], newList: PaymentOrder[], user: User) => {
     const newOrders = newList.filter(n => !oldList.find(o => o.id === n.id));
     newOrders.forEach(order => {
        if ([UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCIAL, UserRole.CEO].includes(user.role)) {
             const title = 'درخواست پرداخت جدید'; const body = `شماره: ${order.trackingNumber}`; sendNotification(title, body); addAppNotification(title, body);
        }
     });
     newList.forEach(newItem => {
        const oldItem = oldList.find(o => o.id === newItem.id);
        if (oldItem && oldItem.status !== newItem.status) {
           if (newItem.requester === user.fullName) {
               let msg = newItem.status === OrderStatus.REJECTED ? 'درخواست شما رد شد.' : 'وضعیت درخواست شما تغییر کرد.';
               sendNotification('تغییر وضعیت', msg); addAppNotification('تغییر وضعیت', msg);
           }
        }
     });
  };

  useEffect(() => {
    if (currentUser) {
      loadData(false);
      const intervalId = setInterval(() => loadData(true), 15000);
      return () => clearInterval(intervalId);
    }
  }, [currentUser]);

  const handleOrderCreated = () => { loadData(); setManageOrdersInitialTab('current'); setDashboardStatusFilter(null); setActiveTab('manage'); };
  const handleLogin = (user: User) => { setCurrentUser(user); setActiveTab('dashboard'); };
  const handleViewArchive = () => { setManageOrdersInitialTab('archive'); setDashboardStatusFilter(null); setActiveTab('manage'); };
  const handleDashboardFilter = (status: OrderStatus | 'pending_all') => { setDashboardStatusFilter(status); setManageOrdersInitialTab('current'); setActiveTab('manage'); };

  if (!currentUser) return <Login onLogin={handleLogin} />;

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout} notifications={notifications} clearNotifications={() => setNotifications([])}>
      {loading && orders.length === 0 ? ( <div className="flex h-[50vh] items-center justify-center text-blue-600"><Loader2 size={48} className="animate-spin" /></div> ) : (
        <>
            {activeTab === 'dashboard' && <Dashboard orders={orders} onViewArchive={handleViewArchive} onFilterByStatus={handleDashboardFilter} />}
            {activeTab === 'create' && <CreateOrder onSuccess={handleOrderCreated} currentUser={currentUser} />}
            {activeTab === 'manage' && <ManageOrders orders={orders} refreshData={() => loadData(true)} currentUser={currentUser} initialTab={manageOrdersInitialTab} settings={settings} statusFilter={dashboardStatusFilter} />}
            {activeTab === 'trade' && <TradeModule currentUser={currentUser} />}
            {activeTab === 'users' && <ManageUsers />}
            {activeTab === 'settings' && <Settings />}
            {activeTab === 'chat' && <ChatRoom currentUser={currentUser} onNotification={addAppNotification} />}
        </>
      )}
    </Layout>
  );
}
export default App;
