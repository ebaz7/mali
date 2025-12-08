
import React, { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings, restoreSystemData, uploadFile } from '../services/storageService';
import { SystemSettings, UserRole, RolePermissions, Company, Contact } from '../types';
import { Settings as SettingsIcon, Save, Loader2, Database, Bell, Plus, Trash2, Building, ShieldCheck, Landmark, Package, AppWindow, BellRing, BellOff, Send, Image as ImageIcon, Pencil, X, Check, MessageCircle, Calendar, Phone, LogOut, RefreshCw, Users, FolderSync, BrainCircuit, Smartphone, Link, Truck, MessageSquare, DownloadCloud, UploadCloud } from 'lucide-react';
import { apiCall } from '../services/apiService';
import { requestNotificationPermission, setNotificationPreference, isNotificationEnabledInApp } from '../services/notificationService';
import { generateUUID } from '../constants';

const Settings: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<'system' | 'data' | 'integrations' | 'whatsapp' | 'permissions'>('system');
  const [settings, setSettings] = useState<SystemSettings>({ 
      currentTrackingNumber: 1000, 
      currentExitPermitNumber: 1000, 
      companyNames: [], 
      companies: [], 
      defaultCompany: '', 
      bankNames: [], 
      commodityGroups: [], 
      rolePermissions: {} as any, 
      savedContacts: [], 
      pwaIcon: '', 
      telegramBotToken: '', 
      telegramAdminId: '', 
      smsApiKey: '', 
      smsSenderNumber: '', 
      googleCalendarId: '', 
      whatsappNumber: '', 
      geminiApiKey: '' 
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [restoring, setRestoring] = useState(false);
  
  // ... (Keep existing state variables for Company, WA, Lists, etc.) ...
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyLogo, setNewCompanyLogo] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const companyLogoInputRef = useRef<HTMLInputElement>(null);
  const [whatsappStatus, setWhatsappStatus] = useState<{ready: boolean, qr: string | null, user: string | null} | null>(null);
  const [refreshingWA, setRefreshingWA] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [isGroupContact, setIsGroupContact] = useState(false);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  const [newBank, setNewBank] = useState('');
  const [newCommodity, setNewCommodity] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const isSecure = window.isSecureContext;

  useEffect(() => { 
      loadSettings(); 
      setNotificationsEnabled(isNotificationEnabledInApp()); 
      checkWhatsappStatus();
  }, []);

  const loadSettings = async () => { 
      try { 
          const data = await getSettings(); 
          let safeData = { ...data };
          safeData.currentExitPermitNumber = safeData.currentExitPermitNumber || 1000;
          safeData.companies = safeData.companies || [];
          if (safeData.companyNames?.length > 0 && safeData.companies.length === 0) {
              safeData.companies = safeData.companyNames.map(name => ({ id: generateUUID(), name }));
          }
          setSettings(safeData); 
      } catch (e) { console.error("Failed to load settings"); } 
  };

  const checkWhatsappStatus = async () => {
      setRefreshingWA(true);
      try {
          const status = await apiCall<{ready: boolean, qr: string | null, user: string | null}>('/whatsapp/status');
          setWhatsappStatus(status);
      } catch (e) { console.error("Failed to check WA status"); } finally { setRefreshingWA(false); }
  };

  const handleWhatsappLogout = async () => {
      if(!confirm('آیا مطمئن هستید؟')) return;
      try { await apiCall('/whatsapp/logout', 'POST'); setTimeout(checkWhatsappStatus, 2000); } catch (e) { alert('خطا'); }
  };

  const handleFetchGroups = async () => {
      if (!whatsappStatus?.ready) { alert("واتساپ متصل نیست."); return; }
      setFetchingGroups(true);
      try {
          const response = await apiCall<{success: boolean, groups: {id: string, name: string}[]}>('/whatsapp/groups');
          if (response.success && response.groups) {
              const existingIds = new Set((settings.savedContacts || []).map(c => c.number));
              const newGroups = response.groups.filter(g => !existingIds.has(g.id)).map(g => ({ id: generateUUID(), name: g.name, number: g.id, isGroup: true }));
              if (newGroups.length > 0) {
                  setSettings({ ...settings, savedContacts: [...(settings.savedContacts || []), ...newGroups] });
                  alert(`${newGroups.length} گروه اضافه شد.`);
              } else alert("گروه جدیدی یافت نشد.");
          }
      } catch (e) { alert("خطا در دریافت."); } finally { setFetchingGroups(false); }
  };

  useEffect(() => {
      let interval: any;
      if (activeCategory === 'whatsapp' && whatsappStatus && !whatsappStatus.ready) {
          interval = setInterval(checkWhatsappStatus, 3000); 
      }
      return () => clearInterval(interval);
  }, [activeCategory, whatsappStatus]);

  const handleSave = async (e: React.FormEvent) => { 
      e.preventDefault(); setLoading(true); 
      try { 
          const syncedSettings = { ...settings, companyNames: settings.companies?.map(c => c.name) || [] };
          await saveSettings(syncedSettings); 
          setSettings(syncedSettings);
          setMessage('ذخیره شد ✅'); setTimeout(() => setMessage(''), 3000); 
      } catch (e) { setMessage('خطا ❌'); } finally { setLoading(false); } 
  };

  // Contacts & Companies & Lists Logic (Kept same)
  const handleAddContact = () => { if (!contactName.trim() || !contactNumber.trim()) return; const newContact: Contact = { id: generateUUID(), name: contactName.trim(), number: contactNumber.trim(), isGroup: isGroupContact }; setSettings({ ...settings, savedContacts: [...(settings.savedContacts || []), newContact] }); setContactName(''); setContactNumber(''); setIsGroupContact(false); };
  const handleDeleteContact = (id: string) => { setSettings({ ...settings, savedContacts: (settings.savedContacts || []).filter(c => c.id !== id) }); };
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setIsUploadingLogo(true); const reader = new FileReader(); reader.onload = async (ev) => { try { const result = await uploadFile(file.name, ev.target?.result as string); setNewCompanyLogo(result.url); } catch (error) { alert('خطا در آپلود'); } finally { setIsUploadingLogo(false); } }; reader.readAsDataURL(file); };
  const handleSaveCompany = () => { if (!newCompanyName.trim()) return; let updatedCompanies = settings.companies || []; if (editingCompanyId) updatedCompanies = updatedCompanies.map(c => c.id === editingCompanyId ? { ...c, name: newCompanyName.trim(), logo: newCompanyLogo } : c); else updatedCompanies = [...updatedCompanies, { id: generateUUID(), name: newCompanyName.trim(), logo: newCompanyLogo }]; setSettings({ ...settings, companies: updatedCompanies, companyNames: updatedCompanies.map(c => c.name) }); setNewCompanyName(''); setNewCompanyLogo(''); setEditingCompanyId(null); };
  const handleEditCompany = (c: Company) => { setNewCompanyName(c.name); setNewCompanyLogo(c.logo || ''); setEditingCompanyId(c.id); };
  const handleRemoveCompany = (id: string) => { if(confirm("حذف؟")) { const updated = (settings.companies || []).filter(c => c.id !== id); setSettings({ ...settings, companies: updated, companyNames: updated.map(c => c.name) }); } };
  const handleAddBank = () => { if (newBank.trim() && !settings.bankNames.includes(newBank.trim())) { setSettings({ ...settings, bankNames: [...settings.bankNames, newBank.trim()] }); setNewBank(''); } };
  const handleRemoveBank = (name: string) => { setSettings({ ...settings, bankNames: settings.bankNames.filter(b => b !== name) }); };
  const handleAddCommodity = () => { if (newCommodity.trim() && !settings.commodityGroups.includes(newCommodity.trim())) { setSettings({ ...settings, commodityGroups: [...settings.commodityGroups, newCommodity.trim()] }); setNewCommodity(''); } };
  const handleRemoveCommodity = (name: string) => { setSettings({ ...settings, commodityGroups: settings.commodityGroups.filter(c => c !== name) }); };
  const handlePermissionChange = (role: string, field: keyof RolePermissions, value: boolean) => { setSettings({ ...settings, rolePermissions: { ...settings.rolePermissions, [role]: { ...settings.rolePermissions[role], [field]: value } } }); };
  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingIcon(true); const reader = new FileReader(); reader.onload = async (ev) => { try { const res = await uploadFile(file.name, ev.target?.result as string); setSettings({ ...settings, pwaIcon: res.url }); } catch (error) { alert('خطا'); } finally { setUploadingIcon(false); } }; reader.readAsDataURL(file); };
  const handleToggleNotifications = async () => { if (!isSecure) { alert("HTTPS لازم است"); return; } if (notificationsEnabled) { setNotificationPreference(false); setNotificationsEnabled(false); } else { const granted = await requestNotificationPermission(); if (granted) { setNotificationPreference(true); setNotificationsEnabled(true); } } };

  // --- NEW BACKUP & RESTORE LOGIC ---
  const handleDownloadFullBackup = () => {
      // Direct download link to the new endpoint
      window.location.href = '/api/full-backup';
  };

  const handleRestoreClick = () => { if (confirm('بازگردانی اطلاعات کامل (شامل عکس‌ها)؟ همه اطلاعات فعلی پاک می‌شود.')) fileInputRef.current?.click(); };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { 
      const file = e.target.files?.[0]; 
      if (!file) return; 
      
      setRestoring(true);
      const reader = new FileReader(); 
      reader.onload = async (ev) => { 
          const base64 = ev.target?.result as string; 
          try { 
              const response = await apiCall<{success: boolean}>('/full-restore', 'POST', { fileData: base64 }); 
              if (response.success) {
                  alert('بازگردانی کامل با موفقیت انجام شد. سیستم رفرش می‌شود.'); 
                  window.location.reload(); 
              }
          } catch (error) { 
              alert('خطا در بازگردانی فایل Zip'); 
          } finally {
              setRestoring(false);
          }
      }; 
      reader.readAsDataURL(file); 
  };

  const roles = [ { id: UserRole.USER, label: 'کاربر عادی' }, { id: UserRole.FINANCIAL, label: 'مدیر مالی' }, { id: UserRole.MANAGER, label: 'مدیر داخلی' }, { id: UserRole.CEO, label: 'مدیر عامل' }, { id: UserRole.SALES_MANAGER, label: 'مدیر فروش' }, { id: UserRole.FACTORY_MANAGER, label: 'مدیر کارخانه' }, { id: UserRole.ADMIN, label: 'مدیر سیستم' }, ];
  const permissionsList = [ 
      { id: 'canViewPaymentOrders', label: 'مشاهده کارتابل پرداخت' },
      { id: 'canViewExitPermits', label: 'مشاهده کارتابل خروج بار' },
      { id: 'canViewAll', label: 'مشاهده تمام دستورات (همه کاربران)' }, 
      { id: 'canEditOwn', label: 'ویرایش دستور خود' }, 
      { id: 'canDeleteOwn', label: 'حذف دستور خود' }, 
      { id: 'canEditAll', label: 'ویرایش تمام دستورات' }, 
      { id: 'canDeleteAll', label: 'حذف تمام دستورات' }, 
      { id: 'canApproveFinancial', label: 'تایید مرحله مالی' }, 
      { id: 'canApproveManager', label: 'تایید مرحله مدیریت' }, 
      { id: 'canApproveCeo', label: 'تایید مرحله نهایی' }, 
      { id: 'canManageTrade', label: 'دسترسی به بخش بازرگانی' }, 
      { id: 'canManageSettings', label: 'دسترسی به تنظیمات سیستم' },
      { id: 'canCreateExitPermit', label: 'ثبت درخواست خروج بار' },
      { id: 'canApproveExitCeo', label: 'تایید خروج بار (مدیرعامل)' },
      { id: 'canApproveExitFactory', label: 'تایید خروج بار (کارخانه)' }
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row min-h-[600px] mb-20 animate-fade-in">
        
        {/* Sidebar (Existing) */}
        <div className="w-full md:w-64 bg-gray-50 border-b md:border-b-0 md:border-l border-gray-200 p-4">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2 px-2"><SettingsIcon size={24} className="text-blue-600"/> تنظیمات</h2>
            <nav className="space-y-1">
                <button onClick={() => setActiveCategory('system')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeCategory === 'system' ? 'bg-white shadow text-blue-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}><AppWindow size={18}/> عمومی و سیستم</button>
                <button onClick={() => setActiveCategory('data')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeCategory === 'data' ? 'bg-white shadow text-indigo-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}><Database size={18}/> اطلاعات پایه</button>
                <button onClick={() => setActiveCategory('integrations')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeCategory === 'integrations' ? 'bg-white shadow text-purple-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}><Link size={18}/> اتصالات (API)</button>
                <button onClick={() => setActiveCategory('whatsapp')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeCategory === 'whatsapp' ? 'bg-white shadow text-green-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}><MessageCircle size={18}/> مدیریت واتساپ</button>
                <button onClick={() => setActiveCategory('permissions')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeCategory === 'permissions' ? 'bg-white shadow text-amber-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}><ShieldCheck size={18}/> دسترسی‌ها</button>
            </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto max-h-[calc(100vh-100px)]">
            <form onSubmit={handleSave} className="space-y-8 max-w-4xl mx-auto">
                
                {activeCategory === 'system' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 border-b pb-2">تنظیمات ظاهری و اعلان‌ها</h3>
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-xl border border-gray-200 overflow-hidden flex items-center justify-center bg-gray-50">{settings.pwaIcon ? <img src={settings.pwaIcon} className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-300" />}</div>
                                <div>
                                    <input type="file" ref={iconInputRef} className="hidden" accept="image/*" onChange={handleIconChange} />
                                    <button type="button" onClick={() => iconInputRef.current?.click()} className="text-blue-600 text-sm hover:underline font-bold" disabled={uploadingIcon}>{uploadingIcon ? '...' : 'تغییر آیکون برنامه'}</button>
                                    <p className="text-xs text-gray-500 mt-1">این آیکون در صفحه اصلی موبایل و فاکتورها نمایش داده می‌شود.</p>
                                </div>
                            </div>
                            <button type="button" onClick={handleToggleNotifications} className={`w-full md:w-auto px-4 py-2 rounded-lg border flex items-center justify-center gap-2 transition-colors ${notificationsEnabled ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 text-gray-600'}`}>{notificationsEnabled ? <BellRing size={18} /> : <BellOff size={18} />}<span>{notificationsEnabled ? 'نوتیفیکیشن‌ها فعال است' : 'فعال‌سازی نوتیفیکیشن'}</span></button>
                        </div>

                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2"><Truck size={20}/> شماره‌گذاری اسناد</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="text-sm font-bold text-gray-700 block mb-1">شروع شماره دستور پرداخت</label><input type="number" className="w-full border rounded-lg p-2 dir-ltr text-left" value={settings.currentTrackingNumber} onChange={(e) => setSettings({...settings, currentTrackingNumber: Number(e.target.value)})} /></div>
                                <div><label className="text-sm font-bold text-gray-700 block mb-1">شروع شماره مجوز خروج</label><input type="number" className="w-full border rounded-lg p-2 dir-ltr text-left" value={settings.currentExitPermitNumber} onChange={(e) => setSettings({...settings, currentExitPermitNumber: Number(e.target.value)})} /></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 border-b pb-2">پشتیبان‌گیری کامل (دیتابیس + فایل‌ها)</h3>
                            <p className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                ℹ️ سیستم به صورت خودکار هر شب (۲۳:۳۰) بک‌آپ کامل را به تلگرام ارسال می‌کند (در صورت تنظیم ربات). در اینجا می‌توانید به صورت دستی بک‌آپ بگیرید.
                            </p>
                            <div className="flex gap-4">
                                <button type="button" onClick={handleDownloadFullBackup} className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 flex items-center gap-2 shadow-lg shadow-indigo-200 transition-transform hover:scale-105">
                                    <DownloadCloud size={20} /> دانلود بک‌آپ کامل (Zip)
                                </button>
                                <button type="button" onClick={handleRestoreClick} disabled={restoring} className="bg-gray-800 text-white px-6 py-3 rounded-xl hover:bg-gray-900 flex items-center gap-2 shadow-lg shadow-gray-300 transition-transform hover:scale-105 disabled:opacity-70">
                                    {restoring ? <Loader2 size={20} className="animate-spin"/> : <UploadCloud size={20} />} بازگردانی فایل Zip
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept=".zip" onChange={handleFileChange} />
                            </div>
                        </div>
                    </div>
                )}

                {/* ... (Keep other categories: data, integrations, whatsapp, permissions same as before) ... */}
                {activeCategory === 'data' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2"><Building size={20}/> مدیریت شرکت‌ها</h3>
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div className="flex gap-2 items-center mb-4">
                                    <input type="text" className="flex-1 border rounded-lg p-2 text-sm" placeholder="نام شرکت..." value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} />
                                    <div className="w-10 h-10 border rounded bg-white flex items-center justify-center overflow-hidden cursor-pointer" onClick={() => companyLogoInputRef.current?.click()}>{newCompanyLogo ? <img src={newCompanyLogo} className="w-full h-full object-cover"/> : <ImageIcon size={16} className="text-gray-300"/>}</div>
                                    <input type="file" ref={companyLogoInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload}/>
                                    <button type="button" onClick={handleSaveCompany} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">{editingCompanyId ? 'ویرایش' : 'افزودن'}</button>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {settings.companies?.map(c => (
                                        <div key={c.id} className="flex justify-between items-center bg-white p-2 rounded border shadow-sm">
                                            <div className="flex items-center gap-2">{c.logo && <img src={c.logo} className="w-6 h-6 object-contain"/>}<span className="text-sm">{c.name}</span></div>
                                            <div className="flex gap-1"><button type="button" onClick={() => handleEditCompany(c)} className="text-blue-500 p-1"><Pencil size={14}/></button><button type="button" onClick={() => handleRemoveCompany(c.id)} className="text-red-500 p-1"><Trash2 size={14}/></button></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2"><Landmark size={18}/> لیست بانک‌ها</h3>
                                <div className="flex gap-2"><input className="flex-1 border rounded-lg p-2 text-sm" placeholder="نام بانک..." value={newBank} onChange={(e) => setNewBank(e.target.value)} /><button type="button" onClick={handleAddBank} className="bg-emerald-600 text-white p-2 rounded-lg"><Plus size={18} /></button></div>
                                <div className="flex flex-wrap gap-2">{settings.bankNames.map((bank, idx) => (<div key={idx} className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs flex items-center gap-1 border border-emerald-100"><span>{bank}</span><button type="button" onClick={() => handleRemoveBank(bank)} className="hover:text-red-500"><X size={12} /></button></div>))}</div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2"><Package size={18}/> گروه‌های کالایی</h3>
                                <div className="flex gap-2"><input className="flex-1 border rounded-lg p-2 text-sm" placeholder="نام گروه..." value={newCommodity} onChange={(e) => setNewCommodity(e.target.value)} /><button type="button" onClick={handleAddCommodity} className="bg-amber-600 text-white p-2 rounded-lg"><Plus size={18} /></button></div>
                                <div className="flex flex-wrap gap-2">{settings.commodityGroups.map((group, idx) => (<div key={idx} className="bg-amber-50 text-amber-700 px-2 py-1 rounded text-xs flex items-center gap-1 border border-amber-100"><span>{group}</span><button type="button" onClick={() => handleRemoveCommodity(group)} className="hover:text-red-500"><X size={12} /></button></div>))}</div>
                            </div>
                        </div>
                    </div>
                )}

                {activeCategory === 'integrations' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2"><BrainCircuit size={20} className="text-purple-600"/> هوش مصنوعی (Gemini)</h3>
                            <div><label className="text-sm text-gray-600 block mb-1">کلید دسترسی (API Key)</label><input type="password" className="w-full border rounded-lg p-2 dir-ltr text-left" value={settings.geminiApiKey || ''} onChange={(e) => setSettings({...settings, geminiApiKey: e.target.value})} /></div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2"><Send size={20} className="text-blue-500"/> تلگرام و پیامک</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-600 block mb-1">توکن ربات تلگرام</label><input className="w-full border rounded-lg p-2 dir-ltr text-left text-sm" value={settings.telegramBotToken || ''} onChange={(e) => setSettings({...settings, telegramBotToken: e.target.value})} /></div>
                                <div><label className="text-xs font-bold text-gray-600 block mb-1">آیدی عددی مدیر (تلگرام)</label><input className="w-full border rounded-lg p-2 dir-ltr text-left text-sm" value={settings.telegramAdminId || ''} onChange={(e) => setSettings({...settings, telegramAdminId: e.target.value})} /></div>
                                <div><label className="text-xs font-bold text-gray-600 block mb-1">کلید پنل پیامک</label><input className="w-full border rounded-lg p-2 dir-ltr text-left text-sm" value={settings.smsApiKey || ''} onChange={(e) => setSettings({...settings, smsApiKey: e.target.value})} /></div>
                                <div><label className="text-xs font-bold text-gray-600 block mb-1">شماره فرستنده پیامک</label><input className="w-full border rounded-lg p-2 dir-ltr text-left text-sm" value={settings.smsSenderNumber || ''} onChange={(e) => setSettings({...settings, smsSenderNumber: e.target.value})} /></div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-800 border-b pb-2 flex items-center gap-2"><Calendar size={20} className="text-orange-500"/> تقویم گوگل</h3>
                            <div><label className="text-sm text-gray-600 block mb-1">آیدی تقویم (Calendar ID)</label><input className="w-full border rounded-lg p-2 dir-ltr text-left" value={settings.googleCalendarId || ''} onChange={(e) => setSettings({...settings, googleCalendarId: e.target.value})} /></div>
                        </div>
                    </div>
                )}

                {activeCategory === 'whatsapp' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6">
                            <div className="bg-white p-4 rounded-xl shadow-sm border">
                                {whatsappStatus?.qr ? <QRCode value={whatsappStatus.qr} size={150} /> : whatsappStatus?.ready ? <div className="w-[150px] h-[150px] flex flex-col items-center justify-center text-green-600"><Check size={48}/><span className="font-bold mt-2">متصل</span></div> : <div className="w-[150px] h-[150px] flex items-center justify-center text-gray-400"><Loader2 size={32} className="animate-spin"/></div>}
                            </div>
                            <div className="flex-1 space-y-3">
                                <h3 className="font-bold text-lg text-green-800">وضعیت اتصال واتساپ</h3>
                                <p className="text-sm text-gray-600">برای ارسال خودکار پیام‌ها و ربات، اسکن کنید. وضعیت: <strong>{whatsappStatus?.ready ? 'متصل' : 'قطع'}</strong></p>
                                {whatsappStatus?.user && <div className="text-xs font-mono bg-white px-2 py-1 rounded inline-block border">{whatsappStatus.user}</div>}
                                <div className="flex gap-2 flex-wrap">
                                    <button type="button" onClick={checkWhatsappStatus} disabled={refreshingWA} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1">{refreshingWA ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} وضعیت</button>
                                    {whatsappStatus?.ready && <button type="button" onClick={handleFetchGroups} disabled={fetchingGroups} className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1">{fetchingGroups ? <Loader2 size={14} className="animate-spin"/> : <Users size={14}/>} دریافت گروه‌ها</button>}
                                    {whatsappStatus?.ready && <button type="button" onClick={handleWhatsappLogout} className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"><LogOut size={14}/> خروج</button>}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center"><h3 className="font-bold text-gray-800">مخاطبین ذخیره شده</h3><div className="flex gap-2"><input className="border rounded px-2 py-1 text-xs w-24" placeholder="نام" value={contactName} onChange={e => setContactName(e.target.value)} /><input className="border rounded px-2 py-1 text-xs w-24 dir-ltr" placeholder="شماره" value={contactNumber} onChange={e => setContactNumber(e.target.value)} /><label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={isGroupContact} onChange={e => setIsGroupContact(e.target.checked)}/> گروه</label><button type="button" onClick={handleAddContact} className="bg-green-600 text-white px-2 py-1 rounded"><Plus size={16}/></button></div></div>
                            <div className="max-h-60 overflow-y-auto border rounded-lg bg-gray-50">{settings.savedContacts?.map(contact => (<div key={contact.id} className="p-2 flex justify-between items-center hover:bg-white border-b last:border-0"><div className="flex items-center gap-2"><span className={`p-1 rounded-full ${contact.isGroup ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-600'}`}>{contact.isGroup ? <Users size={12}/> : <Smartphone size={12}/>}</span><span className="text-sm font-bold">{contact.name}</span><span className="text-xs text-gray-500 font-mono">{contact.number}</span></div><button type="button" onClick={() => handleDeleteContact(contact.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div>))}</div>
                        </div>
                    </div>
                )}

                {activeCategory === 'permissions' && (
                    <div className="overflow-x-auto animate-fade-in">
                        <div className="mb-4 bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-sm text-yellow-800 flex items-center gap-2"><ShieldCheck size={18}/> تعیین کنید هر نقش چه دسترسی‌هایی داشته باشد.</div>
                        <table className="w-full text-sm text-center border-collapse">
                            <thead><tr className="bg-gray-100 text-gray-700"><th className="p-3 border border-gray-200 text-right min-w-[200px]">عنوان مجوز</th>{roles.map(role => (<th key={role.id} className="p-3 border border-gray-200 w-24 vertical-text md:vertical-text-none">{role.label}</th>))}</tr></thead>
                            <tbody>{permissionsList.map(perm => (<tr key={perm.id} className="hover:bg-gray-50"><td className="p-3 border border-gray-200 text-right font-medium text-gray-600">{perm.label}</td>{roles.map(role => { const rolePerms = settings.rolePermissions?.[role.id] || {}; /* @ts-ignore */ const isChecked = !!rolePerms[perm.id]; return (<td key={role.id} className="p-3 border border-gray-200"><input type="checkbox" checked={isChecked} onChange={(e) => handlePermissionChange(role.id, perm.id as keyof RolePermissions, e.target.checked)} className="w-5 h-5 text-blue-600 rounded cursor-pointer" /></td>); })}</tr>))}</tbody>
                        </table>
                    </div>
                )}

                <div className="flex justify-end pt-4 border-t sticky bottom-0 bg-white p-4 shadow-inner md:shadow-none md:static">
                    <button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-70">
                        {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} ذخیره تنظیمات
                    </button>
                </div>
            </form>
        </div>
        
        {message && (<div className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-white text-sm font-bold shadow-2xl z-[100] animate-bounce ${message.includes('خطا') ? 'bg-red-600' : 'bg-green-600'}`}>{message}</div>)}
    </div>
  );
};

const QRCode = ({ value, size }: { value: string, size: number }) => { return <img src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`} alt="QR Code" width={size} height={size} className="mix-blend-multiply" />; };

export default Settings;
