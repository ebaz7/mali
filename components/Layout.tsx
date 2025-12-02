

import React, { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, PlusCircle, ListChecks, FileText, Users, LogOut, User as UserIcon, Settings, Bell, BellOff, MessageSquare, X, Check, Container, KeyRound, Save, Upload, Camera, Download, Share } from 'lucide-react';
import { User, UserRole, AppNotification, SystemSettings } from '../types';
import { logout, hasPermission, getRolePermissions, updateUser } from '../services/authService';
import { requestNotificationPermission, setNotificationPreference, isNotificationEnabledInApp } from '../services/notificationService';
import { getSettings, uploadFile } from '../services/storageService';

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
  const mobileNotifRef = useRef<HTMLDivElement>(null);
  
  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Profile/Password Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSettings().then(data => {
        setSettings(data);
        if (data.pwaIcon) {
            const link = document.querySelector("link[rel*='apple-touch-icon']") as HTMLLinkElement;
            if (link) link.href = data.pwaIcon;
        }
    });
    setNotifEnabled(isNotificationEnabledInApp());
    const handleClickOutside = (event: MouseEvent) => { 
        if (notifRef.current && !notifRef.current.contains(event.target as Node)) setShowNotifDropdown(false); 
        if (mobileNotifRef.current && !mobileNotifRef.current.contains(event.target as Node)) setShowNotifDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    
    // Capture PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
    });

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => { logout(); onLogout(); };
  const handleToggleNotif = async () => {
    if (!isSecure) { alert("⚠️ مرورگرها اجازه فعال‌سازی نوتیفیکیشن در شبکه غیرامن (HTTP) را نمی‌دهند.\n\nبرای رفع این مشکل به بخش «تنظیمات» نرم‌افزار مراجعه کنید."); return; }
    if (notifEnabled) { 
        setNotifEnabled(false); 
        setNotificationPreference(false); 
    } else { 
        const granted = await requestNotificationPermission(); 
        if (granted) { 
            setNotifEnabled(true); 
            setNotificationPreference(true); 
            new Notification("سیستم دستور پرداخت", { body: "نوتیفیکیشن‌ها فعال شدند.", dir: 'rtl' }); 
        } 
    }
  };

  const handleInstallClick = () => {
      if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then((choiceResult: any) => {
              if (choiceResult.outcome === 'accepted') {
                  setDeferredPrompt(null);
              }
          });
      }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const updates: Partial<User> = {};
      
      if (newPassword) {
          if (newPassword !== confirmPassword) { alert('رمز عبور و تکرار آن مطابقت ندارند.'); return; }
          if (newPassword.length < 4) { alert('رمز عبور باید حداقل ۴ کاراکتر باشد.'); return; }
          updates.password = newPassword;
      }

      try {
          if (Object.keys(updates).length > 0) {
            await updateUser({ ...currentUser, ...updates });
            alert('اطلاعات با موفقیت بروزرسانی شد.');
            setNewPassword('');
            setConfirmPassword('');
          }
          setShowProfileModal(false);
      } catch (err) {
          alert('خطا در بروزرسانی اطلاعات');
      }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { alert('حجم تصویر نباید بیشتر از 10 مگابایت باشد.'); return; }
      
      setUploadingAvatar(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
          const base64 = ev.target?.result as string;
          try {
              const result = await uploadFile(file.name, base64);
              await updateUser({ ...currentUser, avatar: result.url });
              window.location.reload(); 
          } catch (error) {
              alert('خطا در آپلود تصویر');
          } finally {
              setUploadingAvatar(false);
          }
      };
      reader.readAsDataURL(file);
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const perms = settings ? getRolePermissions(currentUser.role, settings, currentUser) : null;
  const canSeeTrade = perms?.canManageTrade ?? false;
  const canSeeSettings = currentUser.role === UserRole.ADMIN || (perms?.canManageSettings ?? false);

  const navItems = [
    { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard },
    { id: 'create', label: 'ثبت دستور', icon: PlusCircle },
    { id: 'manage', label: 'مدیریت', icon: ListChecks },
    { id: 'chat', label: 'گفتگو', icon: MessageSquare },
  ];
  if (canSeeTrade) navItems.push({ id: 'trade', label: 'بازرگانی', icon: Container });
  if (hasPermission(currentUser, 'manage_users')) navItems.push({ id: 'users', label: 'کاربران', icon: Users });
  if (canSeeSettings) navItems.push({ id: 'settings', label: 'تنظیمات', icon: Settings });

  // Notification Dropdown Component
  const NotificationDropdown = () => (
      <div className="absolute top-12 left-2 right-2 md:bottom-12 md:top-auto md:left-0 md:right-auto md:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 text-gray-800 z-50 overflow-hidden origin-top md:origin-bottom-left animate-fade-in">
          
          {/* Explicit Notification Toggle Row */}
          <div className="bg-blue-50 p-3 flex justify-between items-center border-b border-blue-100">
              <div className="flex items-center gap-2">
                 {notifEnabled ? <Bell size={16} className="text-blue-600"/> : <BellOff size={16} className="text-gray-500"/>}
                 <span className="text-xs font-bold text-blue-800">وضعیت اعلان‌ها:</span>
              </div>
              <button 
                onClick={handleToggleNotif} 
                className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${notifEnabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700 hover:bg-red-200 animate-pulse'}`}
              >
                  {notifEnabled ? 'فعال است' : 'فعال‌سازی'}
              </button>
          </div>

          <div className="bg-gray-50 p-2 flex justify-between items-center border-b">
              <span className="text-xs font-bold text-gray-600">پیام‌های سیستم</span>
              {notifications.length > 0 && (<button onClick={clearNotifications} className="text-gray-400 hover:text-red-500 flex items-center gap-1 text-[10px]"><X size={12} /> پاک کردن همه</button>)}
          </div>
          
          <div className="max-h-60 overflow-y-auto">
              {notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400 flex flex-col items-center">
                      <BellOff size={24} className="mb-2 opacity-20"/>
                      هیچ پیامی نیست
                  </div>
              ) : (
                  notifications.map(n => (
                      <div key={n.id} className="p-3 border-b hover:bg-gray-50 text-right last:border-0">
                          <div className="text-xs font-bold text-gray-800 mb-1">{n.title}</div>
                          <div className="text-xs text-gray-600 leading-tight">{n.message}</div>
                          <div className="text-[10px] text-gray-400 mt-1 text-left">{new Date(n.timestamp).toLocaleTimeString('fa-IR')}</div>
                      </div>
                  ))
              )}
          </div>
      </div>
  );

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-800 font-sans">
      
      {/* Profile/Password Modal */}
      {showProfileModal && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg">تنظیمات کاربری</h3>
                      <button onClick={() => setShowProfileModal(false)}><X size={20} className="text-gray-400"/></button>
                  </div>
                  
                  <div className="flex flex-col items-center mb-6">
                      <div className="w-20 h-20 rounded-full bg-gray-200 mb-2 relative overflow-hidden group">
                          {currentUser.avatar ? (
                              <img src={currentUser.avatar} alt="Profile" className="w-full h-full object-cover" />
                          ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-400"><UserIcon size={40} /></div>
                          )}
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                              <Camera className="text-white" size={24} />
                          </div>
                      </div>
                      <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={handleAvatarChange} />
                      <button type="button" onClick={() => avatarInputRef.current?.click()} className="text-xs text-blue-600 hover:underline" disabled={uploadingAvatar}>
                          {uploadingAvatar ? 'در حال آپلود...' : 'تغییر تصویر پروفایل'}
                      </button>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="space-y-4 border-t pt-4">
                      <p className="text-xs text-gray-500 font-bold mb-2">تغییر رمز عبور (اختیاری)</p>
                      <div><label className="text-sm font-medium text-gray-700 block mb-1">رمز عبور جدید</label><input type="password" className="w-full border rounded-lg p-2 text-left dir-ltr" value={newPassword} onChange={e => setNewPassword(e.target.value)} /></div>
                      <div><label className="text-sm font-medium text-gray-700 block mb-1">تکرار رمز عبور جدید</label><input type="password" className="w-full border rounded-lg p-2 text-left dir-ltr" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></div>
                      <div className="flex justify-end pt-2">
                          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"><Save size={16}/> ذخیره تغییرات</button>
                      </div>
                  </form>
              </div>
          </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="w-64 bg-slate-800 text-white flex-shrink-0 hidden md:flex flex-col no-print shadow-xl relative h-screen sticky top-0">
        <div className="p-6 border-b border-slate-700 flex items-center gap-3"><div className="bg-blue-500 p-2 rounded-lg"><FileText className="w-6 h-6 text-white" /></div><div><h1 className="text-lg font-bold tracking-wide">سیستم مالی</h1><span className="text-xs text-slate-400">پنل کاربری</span></div></div>
        
        {/* Clickable User Info Section */}
        <div 
            className="p-4 bg-slate-700/50 mx-4 mt-4 rounded-xl flex items-center gap-3 border border-slate-600 relative group cursor-pointer hover:bg-slate-600 transition-colors"
            onClick={() => setShowProfileModal(true)}
            title="تنظیمات کاربری"
        >
            <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center overflow-hidden shrink-0">
                {currentUser.avatar ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover"/> : <UserIcon size={20} className="text-blue-300" />}
            </div>
            <div className="overflow-hidden flex-1"><p className="text-sm font-bold truncate">{currentUser.fullName}</p><p className="text-xs text-slate-400 truncate">نقش: {currentUser.role}</p></div>
            <div className="absolute right-2 top-2 bg-slate-500 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"><Settings size={14} /></div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => { const Icon = item.icon; return (<button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}><Icon size={20} /><span className="font-medium">{item.label}</span></button>); })}
          
          {deferredPrompt && (
              <button onClick={handleInstallClick} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-teal-300 hover:bg-slate-700 hover:text-white transition-colors">
                  <Download size={20} />
                  <span className="font-medium">نصب برنامه (PWA)</span>
              </button>
          )}

          <div className="pt-4 mt-2 border-t border-slate-700 relative" ref={notifRef}>
             <button onClick={() => setShowNotifDropdown(!showNotifDropdown)} className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-sm relative ${unreadCount > 0 ? 'text-white bg-slate-700' : 'text-slate-400 hover:bg-slate-700'}`}><div className="relative"><Bell size={18} />{unreadCount > 0 && (<span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{unreadCount}</span>)}</div><span>مرکز اعلان‌ها</span></button>
             {showNotifDropdown && <NotificationDropdown />}
          </div>
        </nav>
        <div className="p-4 border-t border-slate-700"><button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors"><LogOut size={20} /><span>خروج از سیستم</span></button></div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t p-2 flex justify-around z-50 no-print shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] overflow-x-auto safe-pb">
        {navItems.map((item) => { const Icon = item.icon; return (<button key={item.id} onClick={() => setActiveTab(item.id)} className={`p-2 rounded-lg flex flex-col items-center text-xs min-w-[60px] ${activeTab === item.id ? 'text-blue-600 font-bold' : 'text-gray-500'}`}><Icon size={22} /><span className="mt-1 whitespace-nowrap text-[10px]">{item.label}</span></button>); })}
        <button onClick={handleLogout} className="p-2 rounded-lg flex flex-col items-center text-xs text-red-500 min-w-[60px]"><LogOut size={22} /><span className="mt-1 text-[10px]">خروج</span></button>
      </div>

      <main className="flex-1 flex flex-col h-[100dvh] overflow-hidden relative min-w-0">
          {/* Mobile Header */}
          <header className="bg-white shadow-sm p-4 md:hidden no-print flex items-center justify-between shrink-0 relative z-40">
              <div className="flex items-center gap-2" onClick={() => setShowProfileModal(true)}>
                 <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden border border-gray-300">
                    {currentUser.avatar ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover"/> : <UserIcon size={16} className="text-gray-500 m-2" />}
                 </div>
                 <div>
                     <h1 className="font-bold text-gray-800 text-sm">سیستم مالی</h1>
                     <div className="text-[10px] text-gray-500">{currentUser.fullName}</div>
                 </div>
              </div>
              <div className="flex items-center gap-2">
                  {deferredPrompt && (
                      <button onClick={handleInstallClick} className="p-2 bg-teal-50 text-teal-600 rounded-lg text-xs font-bold flex items-center gap-1">
                          <Download size={16} />
                          <span className="hidden xs:inline">نصب</span>
                      </button>
                  )}
                  <div className="relative" ref={mobileNotifRef}>
                      <button onClick={() => setShowNotifDropdown(!showNotifDropdown)} className="relative p-2 rounded-full hover:bg-gray-100">
                          <Bell size={20} className="text-gray-600" />
                          {unreadCount > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>}
                      </button>
                      {showNotifDropdown && <NotificationDropdown />}
                  </div>
              </div>
          </header>
          
          <div className="flex-1 overflow-auto bg-gray-50 pb-20 md:pb-0 min-w-0">
             <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-full min-w-0">
                 {children}
             </div>
          </div>
      </main>
    </div>
  );
};
export default Layout;
