
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
import CreateExitPermit from './components/CreateExitPermit'; // NEW
import ManageExitPermits from './components/ManageExitPermits'; // NEW
import { getOrders, getSettings } from './services/storageService';
import { getCurrentUser } from './services/authService';
import { PaymentOrder, User, OrderStatus, UserRole, AppNotification, SystemSettings, PaymentMethod } from './types';
import { Loader2 } from 'lucide-react';
import { sendNotification } from './services/notificationService';
import { generateUUID, parsePersianDate } from './constants';

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeTab, setActiveTabState] = useState('dashboard');
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [settings, setSettings] = useState<SystemSettings | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [manageOrdersInitialTab, setManageOrdersInitialTab] = useState<'current' | 'archive'>('current');
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState<OrderStatus | 'pending_all' | null>(null);
  const isFirstLoad = useRef(true);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IDLE_LIMIT = 60 * 60 * 1000; 
  const NOTIFICATION_CHECK_KEY = 'last_notification_check';

  // History API Management
  const safePushState = (state: any, title: string, url?: string) => { try { if (url) window.history.pushState(state, title, url); else window.history.pushState(state, title); } catch (e) { try { window.history.pushState(state, title); } catch(e2) {} } };
  const safeReplaceState = (state: any, title: string, url?: string) => { try { if (url) window.history.replaceState(state, title, url); else window.history.replaceState(state, title); } catch (e) { try { window.history.replaceState(state, title); } catch(e2) {} } };
  const setActiveTab = (tab: string, addToHistory = true) => { setActiveTabState(tab); if (addToHistory) safePushState({ tab }, '', `#${tab}`); };

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && ['dashboard', 'create', 'manage', 'chat', 'trade', 'users', 'settings', 'create-exit', 'manage-exit'].includes(hash)) {
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

  const handleLogout = () => { setCurrentUser(null); isFirstLoad.current = true; if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current); };

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

  const addAppNotification = (title: string, message: string) => { setNotifications(prev => [{ id: generateUUID(), title, message, timestamp: Date.now(), read: false }, ...prev]); };

  const loadData = async (silent = false) => {
    if (!currentUser) return;
    if (!silent) setLoading(true);
    try {
        const [ordersData, settingsData] = await Promise.all([getOrders(), getSettings()]);
        setSettings(settingsData);
        const lastCheck = parseInt(localStorage.getItem(NOTIFICATION_CHECK_KEY) || '0');
        checkForNotifications(ordersData, currentUser, lastCheck);
        if (isFirstLoad.current) { checkChequeAlerts(ordersData); }
        localStorage.setItem(NOTIFICATION_CHECK_KEY, Date.now().toString());
        setOrders(ordersData);
        isFirstLoad.current = false;
    } catch (error) { console.error("Failed to load data", error); } finally { if (!silent) setLoading(false); }
  };

  const checkChequeAlerts = (list: PaymentOrder[]) => {
      const now = new Date();
      let alertCount = 0;
      list.forEach(order => {
          order.paymentDetails.forEach(detail => {
              if (detail.method === PaymentMethod.CHEQUE && detail.chequeDate) {
                  const dueDate = parsePersianDate(detail.chequeDate);
                  if (dueDate) {
                      const diffTime = dueDate.getTime() - now.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      if (diffDays <= 2 && diffDays >= 0) { alertCount++; }
                  }
              }
          });
      });
      if (alertCount > 0) { addAppNotification('هشدار سررسید چک', `${alertCount} چک در ۲ روز آینده سررسید می‌شوند. لطفا داشبورد را بررسی کنید.`); }
  };

  const checkForNotifications = (newList: PaymentOrder[], user: User, lastCheckTime: number) => {
     const newEvents = newList.filter(o => o.updatedAt && o.updatedAt > lastCheckTime);
     newEvents.forEach(newItem => {
        const status = newItem.status;
        const isAdmin = user.role === UserRole.ADMIN;
        if (isAdmin) {
             const isAdminSelfChange = (status === OrderStatus.PENDING && newItem.requester === user.fullName); 
             if (!isAdminSelfChange) { addAppNotification(`تغییر وضعیت (${newItem.trackingNumber})`, `وضعیت جدید: ${status}`); }
        }
        if (status === OrderStatus.PENDING && user.role === UserRole.FINANCIAL) { addAppNotification('درخواست پرداخت جدید', `شماره: ${newItem.trackingNumber} | درخواست کننده: ${newItem.requester}`); }
        else if (status === OrderStatus.APPROVED_FINANCE && user.role === UserRole.MANAGER) { addAppNotification('تایید مالی شد', `درخواست ${newItem.trackingNumber} منتظر تایید مدیریت است.`); }
        else if (status === OrderStatus.APPROVED_MANAGER && user.role === UserRole.CEO) { addAppNotification('تایید مدیریت شد', `درخواست ${newItem.trackingNumber} منتظر تایید نهایی شماست.`); }
        else if (status === OrderStatus.APPROVED_CEO) { if (user.role === UserRole.FINANCIAL) { addAppNotification('تایید نهایی شد (پرداخت)', `درخواست ${newItem.trackingNumber} تایید شد. لطفا اقدام به پرداخت کنید.`); } if (newItem.requester === user.fullName) { addAppNotification('درخواست تایید شد', `درخواست شما (${newItem.trackingNumber}) تایید نهایی شد.`); } }
        else if (status === OrderStatus.REJECTED && newItem.requester === user.fullName) { addAppNotification('درخواست رد شد', `درخواست ${newItem.trackingNumber} رد شد. دلیل: ${newItem.rejectionReason || 'نامشخص'}`); }
     });
  };

  useEffect(() => { if (currentUser) { loadData(false); const intervalId = setInterval(() => loadData(true), 15000); return () => clearInterval(intervalId); } }, [currentUser]);

  const handleOrderCreated = () => { loadData(); setManageOrdersInitialTab('current'); setDashboardStatusFilter(null); setActiveTab('manage'); };
  const handleLogin = (user: User) => { setCurrentUser(user); setActiveTab('dashboard'); };
  const handleViewArchive = () => { setManageOrdersInitialTab('archive'); setDashboardStatusFilter(null); setActiveTab('manage'); };
  const handleDashboardFilter = (status: OrderStatus | 'pending_all') => { setDashboardStatusFilter(status); setManageOrdersInitialTab('current'); setActiveTab('manage'); };

  if (!currentUser) return <Login onLogin={handleLogin} />;

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout} notifications={notifications} clearNotifications={() => setNotifications([])}>
      {loading && orders.length === 0 ? ( <div className="flex h-[50vh] items-center justify-center text-blue-600"><Loader2 size={48} className="animate-spin" /></div> ) : (
        <>
            {activeTab === 'dashboard' && <Dashboard orders={orders} settings={settings} onViewArchive={handleViewArchive} onFilterByStatus={handleDashboardFilter} />}
            {activeTab === 'create' && <CreateOrder onSuccess={handleOrderCreated} currentUser={currentUser} />}
            {activeTab === 'manage' && <ManageOrders orders={orders} refreshData={() => loadData(true)} currentUser={currentUser} initialTab={manageOrdersInitialTab} settings={settings} statusFilter={dashboardStatusFilter} />}
            {activeTab === 'create-exit' && <CreateExitPermit onSuccess={() => setActiveTab('manage-exit')} currentUser={currentUser} />}
            {activeTab === 'manage-exit' && <ManageExitPermits currentUser={currentUser} settings={settings} />}
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
