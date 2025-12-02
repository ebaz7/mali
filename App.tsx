





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
  const [activeTab, setActiveTabState] = useState('dashboard');
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

  // History API Management
  const safePushState = (state: any, title: string, url?: string) => {
      try { if (url) window.history.pushState(state, title, url); else window.history.pushState(state, title); } catch (e) { try { window.history.pushState(state, title); } catch(e2) {} }
  };
  const safeReplaceState = (state: any, title: string, url?: string) => {
      try { if (url) window.history.replaceState(state, title, url); else window.history.replaceState(state, title); } catch (e) { try { window.history.replaceState(state, title); } catch(e2) {} }
  };
  const setActiveTab = (tab: string, addToHistory = true) => {
      setActiveTabState(tab);
      if (addToHistory) safePushState({ tab }, '', `#${tab}`);
  };

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && ['dashboard', 'create', 'manage', 'chat', 'trade', 'users', 'settings'].includes(hash)) {
        setActiveTabState(hash);
        safeReplaceState({ tab: hash }, '', `#${hash}`);
    } else {
        safeReplaceState({ tab: 'dashboard' }, '', '#dashboard');
    }
    const handlePopState = (event: PopStateEvent) => { if (event.state && event.state.tab) setActiveTabState(event.state.tab); else setActiveTabState('dashboard'); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => { const user = getCurrentUser(); if (user) setCurrentUser(user); }, []);

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
        if (!isFirstLoad.current && silent) {
            checkForNotifications(prevOrdersRef.current, ordersData, currentUser);
        }
        prevOrdersRef.current = ordersData;
        setOrders(ordersData);
        isFirstLoad.current = false;
    } catch (error) { console.error("Failed to load data", error); } finally { if (!silent) setLoading(false); }
  };

  const checkForNotifications = (oldList: PaymentOrder[], newList: PaymentOrder[], user: User) => {
     // 1. Detect New Orders
     const newOrders = newList.filter(n => !oldList.find(o => o.id === n.id));
     newOrders.forEach(order => {
        if (user.role === UserRole.FINANCIAL || user.role === UserRole.ADMIN) {
             const title = 'درخواست پرداخت جدید'; 
             const body = `شماره: ${order.trackingNumber} | درخواست کننده: ${order.requester}`; 
             sendNotification(title, body); 
             addAppNotification(title, body);
        }
     });

     // 2. Detect Status Changes
     newList.forEach(newItem => {
        const oldItem = oldList.find(o => o.id === newItem.id);
        if (oldItem && oldItem.status !== newItem.status) {
           const newStatus = newItem.status;
           const isAdmin = user.role === UserRole.ADMIN;
           
           // Notify Admin of ANY change
           if (isAdmin) {
               addAppNotification(`تغییر وضعیت (${newItem.trackingNumber})`, `وضعیت جدید: ${newStatus}`);
           }

           // Specific Role Notifications
           if (newStatus === OrderStatus.APPROVED_FINANCE) {
               if (user.role === UserRole.MANAGER) {
                   const title = 'تایید مالی شد';
                   const body = `درخواست ${newItem.trackingNumber} منتظر تایید مدیریت است.`;
                   sendNotification(title, body);
                   addAppNotification(title, body);
               }
           }
           else if (newStatus === OrderStatus.APPROVED_MANAGER) {
               if (user.role === UserRole.CEO) {
                   const title = 'تایید مدیریت شد';
                   const body = `درخواست ${newItem.trackingNumber} منتظر تایید نهایی شماست.`;
                   sendNotification(title, body);
                   addAppNotification(title, body);
               }
           }
           else if (newStatus === OrderStatus.APPROVED_CEO) {
               if (user.role === UserRole.FINANCIAL) {
                   const title = 'تایید نهایی شد (پرداخت)';
                   const body = `درخواست ${newItem.trackingNumber} تایید شد. لطفا اقدام به پرداخت کنید.`;
                   sendNotification(title, body);
                   addAppNotification(title, body);
               }
               if (newItem.requester === user.fullName) {
                   const title = 'درخواست تایید شد';
                   const body = `درخواست شما (${newItem.trackingNumber}) تایید نهایی شد.`;
                   sendNotification(title, body);
                   addAppNotification(title, body);
               }
           }
           else if (newStatus === OrderStatus.REJECTED) {
               if (newItem.requester === user.fullName) {
                   const title = 'درخواست رد شد';
                   const body = `درخواست ${newItem.trackingNumber} رد شد. دلیل: ${newItem.rejectionReason || 'نامشخص'}`;
                   sendNotification(title, body);
                   addAppNotification(title, body);
               }
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
