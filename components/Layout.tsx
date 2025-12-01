
import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, PlusCircle, ListChecks, FileText, Users, LogOut, User as UserIcon, Settings, Bell, BellOff, MessageSquare, X, Check, Container } from 'lucide-react';
import { User, UserRole, AppNotification, SystemSettings } from '../types';
import { logout, hasPermission, getRolePermissions } from '../services/authService';
import { requestNotificationPermission, setNotificationPreference, isNotificationEnabledInApp } from '../services/notificationService';
import { getSettings } from '../services/storageService';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User;
  onLogout: () => void;
  notifications: AppNotification[];
  clearNotifications: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, currentUser, onLogout, notifications, clearNotifications }) => {
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const isSecure = window.isSecureContext;
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    setNotifEnabled(isNotificationEnabledInApp());
    const handleClickOutside = (event: MouseEvent) => { if (notifRef.current && !notifRef.current.contains(event.target as Node)) setShowNotifDropdown(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => { logout(); onLogout(); };
  const handleToggleNotif = async () => {
    if (!isSecure) { alert("⚠️ مرورگرها اجازه فعال‌سازی نوتیفیکیشن در شبکه غیرامن (HTTP) را نمی‌دهند.\n\nبرای رفع این مشکل به بخش «تنظیمات» نرم‌افزار مراجعه کنید."); return; }
    if (notifEnabled) { setNotifEnabled(false); setNotificationPreference(false); } else { const granted = await requestNotificationPermission(); if (granted) { setNotifEnabled(true); setNotificationPreference(true); new Notification("سیستم دستور پرداخت", { body: "نوتیفیکیشن‌ها فعال شدند.", dir: 'rtl' }); } }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const perms = settings ? getRolePermissions(currentUser.role, settings, currentUser) : null;
  const canSeeTrade = perms?.canManageTrade ?? false;

  const navItems = [
    { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
    { id: 'create', label: 'ثبت دستور پرداخت', icon: PlusCircle },
    { id: 'manage', label: 'مدیریت و تایید', icon: ListChecks },
    { id: 'chat', label: 'اتاق گفتگو', icon: MessageSquare },
  ];
  if (canSeeTrade) navItems.push({ id: 'trade', label: 'بازرگانی', icon: Container });
  if (hasPermission(currentUser, 'manage_users')) navItems.push({ id: 'users', label: 'مدیریت کاربران', icon: Users });
  if (currentUser.role === UserRole.ADMIN) navItems.push({ id: 'settings', label: 'تنظیمات سیستم', icon: Settings });

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-800 font-sans">
      <aside className="w-64 bg-slate-800 text-white flex-shrink-0 hidden md:flex flex-col no-print shadow-xl relative">
        <div className="p-6 border-b border-slate-700 flex items-center gap-3"><div className="bg-blue-500 p-2 rounded-lg"><FileText className="w-6 h-6 text-white" /></div><div><h1 className="text-lg font-bold tracking-wide">سیستم مالی</h1><span className="text-xs text-slate-400">پنل کاربری</span></div></div>
        <div className="p-4 bg-slate-700/50 mx-4 mt-4 rounded-xl flex items-center gap-3 border border-slate-600"><div className="bg-slate-600 p-2 rounded-full"><UserIcon size={20} className="text-blue-300" /></div><div className="overflow-hidden"><p className="text-sm font-bold truncate">{currentUser.fullName}</p><p className="text-xs text-slate-400 truncate">نقش: {currentUser.role}</p></div></div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => { const Icon = item.icon; return (<button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}><Icon size={20} /><span className="font-medium">{item.label}</span></button>); })}
          <div className="pt-4 mt-2 border-t border-slate-700 relative" ref={notifRef}>
             <button onClick={() => setShowNotifDropdown(!showNotifDropdown)} className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm relative ${unreadCount > 0 ? 'text-white bg-slate-700' : 'text-slate-400 hover:bg-slate-700'}`}><div className="relative"><Bell size={18} />{unreadCount > 0 && (<span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{unreadCount}</span>)}</div><span>مرکز اعلان‌ها</span></button>
             {showNotifDropdown && (<div className="absolute bottom-12 left-2 right-2 bg-white rounded-xl shadow-2xl border border-gray-200 text-gray-800 z-50 overflow-hidden w-64 origin-bottom-left"><div className="bg-gray-100 p-3 flex justify-between items-center border-b"><span className="text-xs font-bold text-gray-600">اعلان‌های اخیر</span><div className="flex gap-2"><button onClick={handleToggleNotif} className={!isSecure ? "text-amber-500 animate-pulse" : ""}>{notifEnabled ? <Bell size={14} className="text-green-600"/> : <BellOff size={14} className={!isSecure ? "text-amber-500" : "text-gray-400"}/>}</button>{notifications.length > 0 && (<button onClick={clearNotifications} className="text-gray-400 hover:text-red-500"><X size={14} /></button>)}</div></div><div className="max-h-60 overflow-y-auto">{notifications.length === 0 ? (<div className="p-4 text-center text-xs text-gray-400">هیچ پیامی نیست</div>) : (notifications.map(n => (<div key={n.id} className="p-3 border-b hover:bg-gray-50 text-right"><div className="text-xs font-bold text-gray-800 mb-1">{n.title}</div><div className="text-xs text-gray-600 leading-tight">{n.message}</div><div className="text-[10px] text-gray-400 mt-1 text-left">{new Date(n.timestamp).toLocaleTimeString('fa-IR')}</div></div>)))}</div></div>)}
          </div>
        </nav>
        <div className="p-4 border-t border-slate-700"><button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors"><LogOut size={20} /><span>خروج از سیستم</span></button></div>
      </aside>
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t p-2 flex justify-around z-50 no-print shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] overflow-x-auto">
        {navItems.map((item) => { const Icon = item.icon; return (<button key={item.id} onClick={() => setActiveTab(item.id)} className={`p-2 rounded-lg flex flex-col items-center text-xs min-w-[60px] ${activeTab === item.id ? 'text-blue-600' : 'text-gray-500'}`}><Icon size={24} /><span className="mt-1 whitespace-nowrap">{item.label}</span></button>); })}
        <button onClick={handleLogout} className="p-2 rounded-lg flex flex-col items-center text-xs text-red-500 min-w-[60px]"><LogOut size={24} /><span className="mt-1">خروج</span></button>
      </div>
      <main className="flex-1 overflow-auto"><header className="bg-white shadow-sm p-4 md:hidden no-print flex items-center justify-between"><div className="flex items-center gap-2"><div className="bg-blue-600 p-1.5 rounded text-white"><FileText size={18} /></div><h1 className="font-bold text-gray-800">سیستم دستور پرداخت</h1></div><div className="text-xs text-gray-500">{currentUser.fullName}</div></header><div className="p-4 md:p-8 max-w-7xl mx-auto">{children}</div></main>
    </div>
  );
};
export default Layout;
