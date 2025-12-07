
import React, { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings, restoreSystemData, uploadFile } from '../services/storageService';
import { SystemSettings, UserRole, RolePermissions, Company, Contact } from '../types';
import { Settings as SettingsIcon, Save, Loader2, Download, Database, Bell, Plus, Trash2, Building, ShieldCheck, Landmark, Package, AppWindow, BellRing, BellOff, Send, Crown, Image as ImageIcon, Pencil, X, Check, MessageSquare, Calendar, Phone, QrCode, LogOut, RefreshCw, Users, FolderSync, Bot } from 'lucide-react';
import { apiCall } from '../services/apiService';
import { requestNotificationPermission, setNotificationPreference, isNotificationEnabledInApp } from '../services/notificationService';
import { generateUUID } from '../constants';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'permissions' | 'whatsapp'>('general');
  const [settings, setSettings] = useState<SystemSettings>({ currentTrackingNumber: 1000, companyNames: [], companies: [], defaultCompany: '', bankNames: [], commodityGroups: [], rolePermissions: {} as any, savedContacts: [], pwaIcon: '', telegramBotToken: '', telegramAdminId: '', smsApiKey: '', smsSenderNumber: '', googleCalendarId: '', whatsappNumber: '', n8nWebhookUrl: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // Company Management State
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyLogo, setNewCompanyLogo] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const companyLogoInputRef = useRef<HTMLInputElement>(null);

  // WhatsApp Session & Contacts State
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
          let safeData = { 
              ...data, 
              companyNames: data.companyNames || [], 
              companies: data.companies || [],
              defaultCompany: data.defaultCompany || '', 
              bankNames: data.bankNames || [], 
              commodityGroups: data.commodityGroups || [], 
              rolePermissions: data.rolePermissions || {}, 
              savedContacts: data.savedContacts || [],
              pwaIcon: data.pwaIcon || '', 
              telegramBotToken: data.telegramBotToken || '', 
              telegramAdminId: data.telegramAdminId || '',
              smsApiKey: data.smsApiKey || '',
              smsSenderNumber: data.smsSenderNumber || '',
              googleCalendarId: data.googleCalendarId || '',
              whatsappNumber: data.whatsappNumber || '',
              n8nWebhookUrl: data.n8nWebhookUrl || ''
          }; 
          
          // Migrate old string companies to object structure if empty
          if (safeData.companyNames.length > 0 && (!safeData.companies || safeData.companies.length === 0)) {
              safeData.companies = safeData.companyNames.map(name => ({ id: generateUUID(), name }));
          }

          setSettings(safeData); 
      } catch (e) { 
          console.error("Failed to load settings"); 
      } 
  };

  const checkWhatsappStatus = async () => {
      setRefreshingWA(true);
      try {
          const status = await apiCall<{ready: boolean, qr: string | null, user: string | null}>('/whatsapp/status');
          setWhatsappStatus(status);
      } catch (e) {
          console.error("Failed to check WA status");
      } finally {
          setRefreshingWA(false);
      }
  };

  const handleWhatsappLogout = async () => {
      if(!confirm('آیا از خروج حساب واتساپ مطمئن هستید؟ ربات غیرفعال خواهد شد.')) return;
      try {
          await apiCall('/whatsapp/logout', 'POST');
          setTimeout(checkWhatsappStatus, 2000); // Wait for re-init
      } catch (e) {
          alert('خطا در خروج');
      }
  };

  const handleFetchGroups = async () => {
      if (!whatsappStatus?.ready) {
          alert("واتساپ متصل نیست.");
          return;
      }
      setFetchingGroups(true);
      try {
          const response = await apiCall<{success: boolean, groups: {id: string, name: string}[]}>('/whatsapp/groups');
          if (response.success && response.groups) {
              // Merge with existing contacts, avoiding duplicates by ID (number)
              const existingIds = new Set((settings.savedContacts || []).map(c => c.number));
              const newGroups = response.groups
                  .filter(g => !existingIds.has(g.id))
                  .map(g => ({
                      id: generateUUID(),
                      name: g.name,
                      number: g.id,
                      isGroup: true
                  }));
              
              if (newGroups.length === 0) {
                  alert("گروه جدیدی یافت نشد یا قبلاً اضافه شده‌اند.");
              } else {
                  setSettings({ 
                      ...settings, 
                      savedContacts: [...(settings.savedContacts || []), ...newGroups] 
                  });
                  alert(`${newGroups.length} گروه جدید اضافه شد.`);
              }
          }
      } catch (e) {
          alert("خطا در دریافت لیست گروه‌ها.");
      } finally {
          setFetchingGroups(false);
      }
  };

  useEffect(() => {
      let interval: any;
      if (activeTab === 'whatsapp' && whatsappStatus && !whatsappStatus.ready) {
          interval = setInterval(checkWhatsappStatus, 3000); // Poll for QR updates or ready state
      }
      return () => clearInterval(interval);
  }, [activeTab, whatsappStatus]);

  const handleSave = async (e: React.FormEvent) => { 
      e.preventDefault(); 
      setLoading(true); 
      try { 
          // Sync companyNames (legacy) with companies (new)
          const syncedSettings = {
              ...settings,
              companyNames: settings.companies?.map(c => c.name) || []
          };
          
          await saveSettings(syncedSettings); 
          setSettings(syncedSettings);
          setMessage('تنظیمات با موفقیت ذخیره شد.'); 
          setTimeout(() => setMessage(''), 3000); 
      } catch (e) { 
          setMessage('خطا در ذخیره تنظیمات.'); 
      } finally { 
          setLoading(false); 
      } 
  };

  // Contacts Management
  const handleAddContact = () => {
      if (!contactName.trim() || !contactNumber.trim()) return;
      const newContact: Contact = {
          id: generateUUID(),
          name: contactName.trim(),
          number: contactNumber.trim(),
          isGroup: isGroupContact
      };
      setSettings({ ...settings, savedContacts: [...(settings.savedContacts || []), newContact] });
      setContactName('');
      setContactNumber('');
      setIsGroupContact(false);
  };

  const handleDeleteContact = (id: string) => {
      setSettings({ ...settings, savedContacts: (settings.savedContacts || []).filter(c => c.id !== id) });
  };

  // Company Management Handlers
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) { alert("حجم فایل لوگو نباید بیشتر از 2 مگابایت باشد"); return; }
      setIsUploadingLogo(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
          const base64 = ev.target?.result as string;
          try {
              const result = await uploadFile(file.name, base64);
              setNewCompanyLogo(result.url);
          } catch (error) { alert('خطا در آپلود لوگو'); } finally { setIsUploadingLogo(false); }
      };
      reader.readAsDataURL(file);
  };

  const handleSaveCompany = () => { 
      if (!newCompanyName.trim()) return;
      
      let updatedCompanies;
      if (editingCompanyId) {
          // Edit Mode
          updatedCompanies = (settings.companies || []).map(c => 
              c.id === editingCompanyId ? { ...c, name: newCompanyName.trim(), logo: newCompanyLogo } : c
          );
      } else {
          // Add Mode
          const newCo: Company = {
              id: generateUUID(),
              name: newCompanyName.trim(),
              logo: newCompanyLogo
          };
          updatedCompanies = [...(settings.companies || []), newCo];
      }
      
      setSettings({ 
          ...settings, 
          companies: updatedCompanies,
          companyNames: updatedCompanies.map(c => c.name)
      }); 
      
      handleCancelEditCompany();
  };

  const handleEditCompany = (company: Company) => {
      setNewCompanyName(company.name);
      setNewCompanyLogo(company.logo || '');
      setEditingCompanyId(company.id);
      window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top to see edit form
  };

  const handleCancelEditCompany = () => {
      setNewCompanyName('');
      setNewCompanyLogo('');
      setEditingCompanyId(null);
  };

  const handleRemoveCompany = (id: string) => { 
      if (!confirm("آیا از حذف این شرکت اطمینان دارید؟")) return;
      const updatedCompanies = (settings.companies || []).filter(c => c.id !== id);
      setSettings({ 
          ...settings, 
          companies: updatedCompanies,
          companyNames: updatedCompanies.map(c => c.name)
      }); 
      if (editingCompanyId === id) handleCancelEditCompany();
  };

  const handleAddBank = () => { if (newBank.trim() && !settings.bankNames.includes(newBank.trim())) { setSettings({ ...settings, bankNames: [...settings.bankNames, newBank.trim()] }); setNewBank(''); } };
  const handleRemoveBank = (name: string) => { setSettings({ ...settings, bankNames: settings.bankNames.filter(b => b !== name) }); };
  const handleAddCommodity = () => { if (newCommodity.trim() && !settings.commodityGroups.includes(newCommodity.trim())) { setSettings({ ...settings, commodityGroups: [...settings.commodityGroups, newCommodity.trim()] }); setNewCommodity(''); } };
  const handleRemoveCommodity = (name: string) => { setSettings({ ...settings, commodityGroups: settings.commodityGroups.filter(c => c !== name) }); };
  const handlePermissionChange = (role: string, field: keyof RolePermissions, value: boolean) => { setSettings({ ...settings, rolePermissions: { ...settings.rolePermissions, [role]: { ...settings.rolePermissions[role], [field]: value } } }); };
  const handleDownloadBackup = async () => { try { const backupData = await apiCall<any>('/backup'); const jsonString = JSON.stringify(backupData, null, 2); const blob = new Blob([jsonString], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; const dateStr = new Date().toISOString().split('T')[0]; a.download = `payment_system_backup_${dateStr}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) { alert('خطا در دریافت فایل پشتیبان'); } };
  const handleRestoreClick = () => { if (window.confirm('هشدار مهم: با بازگردانی فایل پشتیبان، تمام اطلاعات فعلی سیستم (کاربران و دستورها) حذف و با اطلاعات فایل جایگزین می‌شود. آیا مطمئن هستید؟')) { fileInputRef.current?.click(); } };
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (e) => { try { const content = e.target?.result as string; const json = JSON.parse(content); if (!json.orders || !json.users) { throw new Error("Invalid format"); } setLoading(true); await restoreSystemData(json); setMessage('اطلاعات با موفقیت بازگردانی شد. لطفا صفحه را رفرش کنید.'); if (fileInputRef.current) fileInputRef.current.value = ''; setTimeout(() => { window.location.reload(); }, 2000); } catch (error) { alert('فایل انتخاب شده نامعتبر است یا فرمت صحیح ندارد.'); setLoading(false); } }; reader.readAsText(file); };

  const handleToggleNotifications = async () => {
    if (!isSecure) { alert("⚠️ مرورگرها اجازه فعال‌سازی نوتیفیکیشن در شبکه غیرامن (HTTP) را نمی‌دهند."); return; }
    
    if (notificationsEnabled) {
        setNotificationPreference(false);
        setNotificationsEnabled(false);
    } else {
        const granted = await requestNotificationPermission();
        if (granted) {
            setNotificationPreference(true);
            setNotificationsEnabled(true);
            new Notification("تست اعلان", { body: "اعلان‌ها با موفقیت فعال شدند.", dir: "rtl" });
        } else {
            alert("دسترسی به اعلان‌ها توسط مرورگر مسدود شده است. لطفا از تنظیمات مرورگر اجازه دهید.");
        }
    }
  };

  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.size > 2 * 1024 * 1024) { alert("حجم فایل نباید بیشتر از 2 مگابایت باشد"); return; }
      setUploadingIcon(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
          const base64 = ev.target?.result as string;
          try {
              const result = await uploadFile(file.name, base64);
              setSettings({ ...settings, pwaIcon: result.url });
          } catch (error) { alert('خطا در آپلود آیکون'); } finally { setUploadingIcon(false); }
      };
      reader.readAsDataURL(file);
  };

  const roles = [ { id: UserRole.USER, label: 'کاربر عادی' }, { id: UserRole.FINANCIAL, label: 'مدیر مالی' }, { id: UserRole.MANAGER, label: 'مدیر داخلی' }, { id: UserRole.CEO, label: 'مدیر عامل' }, { id: UserRole.ADMIN, label: 'مدیر سیستم' }, ];
  const permissions = [ { id: 'canViewAll', label: 'مشاهده تمام دستورات' }, { id: 'canEditOwn', label: 'ویرایش دستور خود (در صورت عدم تایید)' }, { id: 'canDeleteOwn', label: 'حذف دستور خود (در صورت عدم تایید)' }, { id: 'canEditAll', label: 'ویرایش تمام دستورات' }, { id: 'canDeleteAll', label: 'حذف تمام دستورات' }, { id: 'canApproveFinancial', label: 'تایید مرحله مالی' }, { id: 'canApproveManager', label: 'تایید مرحله مدیریت' }, { id: 'canApproveCeo', label: 'تایید مرحله نهایی' }, { id: 'canManageTrade', label: 'دسترسی به بخش بازرگانی' }, { id: 'canManageSettings', label: 'دسترسی به تنظیمات سیستم' } ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 max-w-4xl mx-auto animate-fade-in space-y-6 mb-20 min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4"><div className="flex items-center gap-3"><div className="bg-gray-100 p-2 rounded-lg text-gray-600"><SettingsIcon size={24} /></div><h2 className="text-xl font-bold text-gray-800">تنظیمات سیستم</h2></div><div className="flex gap-2 overflow-x-auto"><button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'general' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>عمومی</button><button onClick={() => setActiveTab('whatsapp')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'whatsapp' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>اتصال واتساپ</button><button onClick={() => setActiveTab('permissions')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'permissions' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>سطوح دسترسی</button></div></div>
        
        {activeTab === 'whatsapp' ? (
            <div className="space-y-6">
                <form onSubmit={handleSave} className="space-y-6">
                    <div className="flex justify-between items-center bg-green-50 p-4 rounded-xl border border-green-200">
                        <div className="flex items-center gap-3">
                            <div className="bg-white p-2 rounded-full text-green-600 shadow-sm"><Phone size={24}/></div>
                            <div>
                                <h3 className="font-bold text-green-900">مدیریت حساب واتساپ</h3>
                                <p className="text-xs text-green-700">وضعیت اتصال ربات سرور به واتساپ</p>
                            </div>
                        </div>
                        <button type="button" onClick={checkWhatsappStatus} className="p-2 bg-white rounded-full hover:bg-gray-100 text-gray-600" title="بروزرسانی وضعیت"><RefreshCw size={20} className={refreshingWA ? "animate-spin" : ""} /></button>
                    </div>

                    <div className="bg-white border rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px]">
                        {whatsappStatus?.ready ? (
                            <div className="text-center space-y-4">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600 mb-2">
                                    <Check size={40} />
                                </div>
                                <h2 className="text-xl font-bold text-gray-800">واتساپ متصل است</h2>
                                <p className="text-gray-500">شماره متصل: <span className="font-mono dir-ltr">{whatsappStatus.user || 'نامشخص'}</span></p>
                                <button type="button" onClick={handleWhatsappLogout} className="bg-red-50 text-red-600 border border-red-200 px-6 py-2 rounded-lg hover:bg-red-100 flex items-center gap-2 mx-auto">
                                    <LogOut size={18}/> خروج از حساب (تغییر شماره)
                                </button>
                            </div>
                        ) : (
                            <div className="text-center space-y-4 w-full">
                                {whatsappStatus?.qr ? (
                                    <>
                                        <h2 className="text-lg font-bold text-gray-800 mb-2">اسکن کد QR</h2>
                                        <p className="text-xs text-gray-500 mb-4">لطفا با واتساپ گوشی خود اسکن کنید (Linked Devices)</p>
                                        <div className="bg-white p-2 inline-block border-4 border-gray-800 rounded-xl">
                                            {/* Use a public API to render QR to avoid adding heavy libs to frontend */}
                                            <img 
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(whatsappStatus.qr)}`} 
                                                alt="WhatsApp QR Code" 
                                                className="w-64 h-64 object-contain"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2">این کد هر چند ثانیه منقضی می‌شود. در صورت نیاز رفرش کنید.</p>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <Loader2 size={40} className="text-blue-500 animate-spin mb-4"/>
                                        <p className="text-gray-500">در حال دریافت وضعیت از سرور...</p>
                                        <p className="text-xs text-gray-400 mt-2">اگر طول کشید، سرور را ریستارت کنید.</p>
                                        <button type="button" onClick={checkWhatsappStatus} className="mt-4 bg-blue-100 text-blue-600 px-4 py-2 rounded text-xs font-bold hover:bg-blue-200">تلاش مجدد</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
                        <h4 className="font-bold mb-2 flex items-center gap-2"><Send size={16}/> تنظیمات ارسال</h4>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-700 block">شماره پیش‌فرض گیرنده گزارشات:</label>
                            <input 
                                type="text" 
                                className="w-full border border-blue-200 rounded-lg p-2 text-sm dir-ltr font-mono" 
                                placeholder="98912xxxxxxx"
                                value={settings.whatsappNumber}
                                onChange={(e) => setSettings({...settings, whatsappNumber: e.target.value})}
                            />
                            <p className="text-[10px] text-gray-500">این شماره به عنوان پیش‌فرض در فرم ارسال گزارش پر می‌شود.</p>
                        </div>
                    </div>

                    {/* Contacts Manager */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2"><Users size={20} className="text-purple-600"/> مدیریت مخاطبین و گروه‌ها</h4>
                            <button 
                                type="button"
                                onClick={handleFetchGroups} 
                                disabled={fetchingGroups || !whatsappStatus?.ready}
                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                            >
                                {fetchingGroups ? <Loader2 size={12} className="animate-spin"/> : <FolderSync size={14}/>} همگام‌سازی گروه‌ها
                            </button>
                        </div>
                        
                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 flex flex-wrap gap-2 items-end mb-4">
                            <div className="flex-1 min-w-[120px]">
                                <label className="text-xs font-bold text-gray-700 block mb-1">نام مخاطب/گروه</label>
                                <input className="w-full border rounded-lg p-2 text-sm" placeholder="نام..." value={contactName} onChange={e => setContactName(e.target.value)} />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                                <label className="text-xs font-bold text-gray-700 block mb-1">شماره/ID (با کد کشور)</label>
                                <input className="w-full border rounded-lg p-2 text-sm dir-ltr font-mono" placeholder="98912..." value={contactNumber} onChange={e => setContactNumber(e.target.value)} />
                            </div>
                            <div className="flex items-center pb-3 px-2">
                                <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                                    <input type="checkbox" checked={isGroupContact} onChange={e => setIsGroupContact(e.target.checked)} className="w-4 h-4 text-purple-600"/>
                                    گروه است
                                </label>
                            </div>
                            <button type="button" onClick={handleAddContact} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-purple-700 h-[38px] flex items-center justify-center"><Plus size={18} /></button>
                        </div>

                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {settings.savedContacts && settings.savedContacts.length > 0 ? (
                                settings.savedContacts.map(contact => (
                                    <div key={contact.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border text-sm">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-full border ${contact.isGroup ? 'bg-orange-100 text-orange-600' : 'bg-white text-gray-500'}`}>
                                                {contact.isGroup ? <Users size={16}/> : <Users size={16}/>}
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-800">{contact.name}</div>
                                                <div className="text-xs text-gray-500 font-mono">{contact.number}</div>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => handleDeleteContact(contact.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 size={16}/></button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center text-gray-400 py-4 text-xs">مخاطبی ثبت نشده است.</div>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end border-t border-gray-100 pt-6"><button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all disabled:opacity-70">{loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}ذخیره تنظیمات</button></div>
                </form>
            </div>
        ) : (
        <form onSubmit={handleSave} className="space-y-8">
            {activeTab === 'general' ? (
                <>
                {/* AI / n8n Settings */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2"><Bot className="text-indigo-600" size={20} /><h3 className="font-bold text-gray-800">تنظیمات هوش مصنوعی (n8n)</h3></div>
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-200">
                        <label className="text-xs font-bold text-gray-700 block mb-2">آدرس وب‌هوک n8n (Webhook URL)</label>
                        <input 
                            type="text" 
                            className="w-full border border-indigo-300 rounded-lg p-2 text-sm dir-ltr font-mono bg-white" 
                            placeholder="https://your-n8n-instance.com/webhook/..."
                            value={settings.n8nWebhookUrl}
                            onChange={(e) => setSettings({...settings, n8nWebhookUrl: e.target.value})}
                        />
                        <p className="text-xs text-gray-600 mt-2">
                            برای پردازش پیام‌های صوتی و متنی، سرور پیام‌ها را به این آدرس ارسال می‌کند.
                            <br/>
                            <span className="font-bold">نکته:</span> n8n باید طوری تنظیم شود که پاسخ JSON با فرمت مشخص شده در مستندات را برگرداند.
                        </p>
                    </div>
                </div>

                {/* NOTIFICATIONS SECTION */}
                <div className="space-y-4 border-t pt-6">
                    <div className="flex items-center gap-2 mb-2"><Bell className="text-purple-600" size={20} /><h3 className="font-bold text-gray-800">تنظیمات اعلان‌ها</h3></div>
                    <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${notificationsEnabled ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div>
                            <h4 className={`font-bold text-sm ${notificationsEnabled ? 'text-green-800' : 'text-red-800'}`}>
                                {notificationsEnabled ? 'اعلان‌ها مرورگر فعال هستند' : 'اعلان‌های مرورگر غیرفعال هستند'}
                            </h4>
                            <p className="text-xs text-gray-600 mt-1">با فعال‌سازی، پیام‌های جدید و تغییر وضعیت دستورات را دریافت خواهید کرد.</p>
                            {!isSecure && <p className="text-xs text-amber-600 mt-1 font-bold bg-amber-100 p-1 rounded w-fit">هشدار: ارتباط شما امن (HTTPS) نیست. مرورگرها اجازه اعلان نمی‌دهند.</p>}
                        </div>
                        <button type="button" onClick={handleToggleNotifications} className={`px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-transform active:scale-95 flex items-center gap-2 ${notificationsEnabled ? 'bg-white text-green-700 border border-green-200 hover:bg-green-100' : 'bg-red-600 text-white hover:bg-red-700'}`}>
                            {notificationsEnabled ? <><BellRing size={18}/> غیرفعال کردن</> : <><BellOff size={18}/> فعال‌سازی اعلان‌ها</>}
                        </button>
                    </div>
                </div>
                
                {/* TELEGRAM SECTION */}
                <div className="space-y-4 border-t pt-6">
                    <div className="flex items-center gap-2 mb-2"><Send className="text-blue-500" size={20} /><h3 className="font-bold text-gray-800">تنظیمات تلگرام</h3></div>
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Telegram */}
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-gray-700 block mb-2">توکن ربات تلگرام (Bot Token)</label>
                            <input 
                            type="text" 
                            className="w-full border border-blue-200 rounded-lg p-2 text-sm dir-ltr font-mono" 
                            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                            value={settings.telegramBotToken}
                            onChange={(e) => setSettings({...settings, telegramBotToken: e.target.value})}
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                برای دریافت توکن، به ربات <a href="https://t.me/BotFather" target="_blank" className="text-blue-600 underline font-bold">BotFather@</a> در تلگرام پیام دهید.
                            </p>
                        </div>
                        <div className="md:col-span-2 pt-1">
                             <label className="text-xs font-bold text-gray-700 flex items-center gap-1 mb-2"><Crown size={14}/> شناسه چت ادمین اصلی (جهت بک‌آپ)</label>
                             <input 
                                type="text" 
                                className="w-full border border-blue-200 rounded-lg p-2 text-sm dir-ltr font-mono" 
                                placeholder="Admin Chat ID"
                                value={settings.telegramAdminId}
                                onChange={(e) => setSettings({...settings, telegramAdminId: e.target.value})}
                             />
                        </div>
                    </div>
                </div>

                {/* GOOGLE CALENDAR SECTION */}
                <div className="space-y-4 border-t pt-6">
                    <div className="flex items-center gap-2 mb-2"><Calendar className="text-orange-500" size={20} /><h3 className="font-bold text-gray-800">تنظیمات تقویم گوگل</h3></div>
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                        <label className="text-xs font-bold text-gray-700 block mb-2">شناسه تقویم گوگل (Calendar ID)</label>
                        <input 
                            type="text" 
                            className="w-full border border-orange-200 rounded-lg p-2 text-sm dir-ltr font-mono" 
                            placeholder="example@gmail.com or ID..."
                            value={settings.googleCalendarId || ''}
                            onChange={(e) => setSettings({...settings, googleCalendarId: e.target.value})}
                        />
                        <p className="text-xs text-gray-600 mt-2">
                            برای نمایش تقویم گوگل در داشبورد، شناسه تقویم خود را وارد کنید. 
                            <br/>
                            (توجه: تقویم باید Public باشد یا مرورگر شما در گوگل لاگین باشد).
                        </p>
                    </div>
                </div>

                {/* SMS PANEL SECTION */}
                <div className="space-y-4 border-t pt-6">
                    <div className="flex items-center gap-2 mb-2"><MessageSquare className="text-green-500" size={20} /><h3 className="font-bold text-gray-800">تنظیمات پنل پیامک</h3></div>
                    <div className="bg-green-50 p-4 rounded-xl border border-green-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-700 block mb-2">کلید دسترسی (API Key)</label>
                            <input 
                                type="password" 
                                className="w-full border border-green-200 rounded-lg p-2 text-sm dir-ltr" 
                                placeholder="SMS Panel API Key"
                                value={settings.smsApiKey}
                                onChange={(e) => setSettings({...settings, smsApiKey: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-700 block mb-2">شماره خط ارسال کننده</label>
                            <input 
                                type="text" 
                                className="w-full border border-green-200 rounded-lg p-2 text-sm dir-ltr" 
                                placeholder="Example: 3000xxxx"
                                value={settings.smsSenderNumber}
                                onChange={(e) => setSettings({...settings, smsSenderNumber: e.target.value})}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2 border-t pt-6"><label className="text-sm font-bold text-gray-700">شماره شروع دستور پرداخت (کف)</label><p className="text-xs text-gray-500 mb-2">سیستم جاهای خالی بالاتر از این شماره را پر می‌کند.</p><input type="number" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dir-ltr text-left" value={settings.currentTrackingNumber} onChange={(e) => setSettings({...settings, currentTrackingNumber: Number(e.target.value)})} /></div>
                
                {/* PWA Icon Upload */}
                <div className="space-y-4 border-t pt-6">
                    <div className="flex items-center gap-2 mb-2"><AppWindow className="text-pink-600" size={20} /><h3 className="font-bold text-gray-800">آیکون برنامه (PWA)</h3></div>
                    <div className="bg-pink-50 p-4 rounded-xl border border-pink-100 flex items-center gap-4">
                        <div className="w-16 h-16 rounded-xl bg-white border flex items-center justify-center overflow-hidden shrink-0">
                            {settings.pwaIcon ? <img src={settings.pwaIcon} alt="App Icon" className="w-full h-full object-contain" /> : <div className="text-gray-300 text-xs text-center p-1">پیش‌فرض</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                             <p className="text-xs text-gray-600 mb-2 truncate">تصویر آیکون برنامه برای نمایش در موبایل.</p>
                             <input type="file" ref={iconInputRef} className="hidden" accept="image/png,image/jpeg" onChange={handleIconChange} />
                             <button type="button" onClick={() => iconInputRef.current?.click()} disabled={uploadingIcon} className="bg-white text-pink-600 border border-pink-200 px-3 py-1.5 rounded-lg text-xs hover:bg-pink-100">{uploadingIcon ? 'در حال آپلود...' : 'تغییر آیکون'}</button>
                        </div>
                    </div>
                </div>

                {/* COMPANY MANAGEMENT WITH EDIT */}
                <div className="space-y-4 border-t pt-6">
                    <div className="flex items-center gap-2 mb-2"><Building className="text-blue-600" size={20} /><h3 className="font-bold text-gray-800">مدیریت شرکت‌ها (سربرگ)</h3></div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                        <div className="space-y-2"><label className="text-xs font-bold text-gray-600">شرکت پیش‌فرض</label><select className="w-full border rounded-lg p-2 text-sm bg-white" value={settings.defaultCompany} onChange={(e) => setSettings({...settings, defaultCompany: e.target.value})}><option value="">-- انتخاب کنید --</option>{settings.companies?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                        
                        <div className={`p-3 rounded-lg border transition-colors ${editingCompanyId ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
                            <label className="text-xs font-bold text-gray-600 mb-2 block">{editingCompanyId ? 'ویرایش اطلاعات شرکت' : 'افزودن شرکت جدید'}</label>
                            <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                                <div className="flex-1 w-full sm:w-auto">
                                    <input className="w-full border rounded-lg p-2 text-sm mb-2" placeholder="نام شرکت..." value={newCompanyName} onChange={e => setNewCompanyName(e.target.value)} />
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => companyLogoInputRef.current?.click()} disabled={isUploadingLogo} className="bg-gray-100 text-gray-600 border px-3 py-1.5 rounded text-xs hover:bg-gray-200 flex items-center gap-1">
                                            {isUploadingLogo ? <Loader2 size={12} className="animate-spin"/> : <ImageIcon size={12}/>}
                                            {newCompanyLogo ? 'تغییر لوگو' : 'آپلود لوگو'}
                                        </button>
                                        <input type="file" ref={companyLogoInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                        {newCompanyLogo && (
                                            <div className="flex items-center gap-1 bg-white border px-2 py-1 rounded">
                                                <img src={newCompanyLogo} className="w-5 h-5 object-contain"/> 
                                                <button type="button" onClick={() => setNewCompanyLogo('')} className="text-red-500 hover:bg-red-50 rounded"><X size={12}/></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1 w-full sm:w-auto">
                                    {editingCompanyId && (
                                        <button type="button" onClick={handleCancelEditCompany} className="bg-gray-200 text-gray-700 w-10 h-10 rounded-lg flex items-center justify-center hover:bg-gray-300" title="انصراف"><X size={20}/></button>
                                    )}
                                    <button type="button" onClick={handleSaveCompany} className={`flex-1 sm:flex-none text-white w-10 h-10 rounded-lg flex items-center justify-center shadow-md ${editingCompanyId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700'}`}>
                                        {editingCompanyId ? <Check size={20}/> : <Plus size={20} />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-600">لیست شرکت‌های موجود</label>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {settings.companies?.map(c => (
                                    <div key={c.id} className={`flex justify-between items-center bg-white border p-2 rounded-lg text-sm shadow-sm ${editingCompanyId === c.id ? 'border-amber-400 bg-amber-50' : 'border-gray-200'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 border rounded bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                                                {c.logo ? <img src={c.logo} alt="Logo" className="w-full h-full object-contain" /> : <Building size={20} className="text-gray-300"/>}
                                            </div>
                                            <span className="font-bold text-gray-700">{c.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button type="button" onClick={() => handleEditCompany(c)} className="text-amber-500 hover:text-amber-700 p-1.5 hover:bg-amber-50 rounded transition-colors" title="ویرایش"><Pencil size={16}/></button>
                                            <button type="button" onClick={() => handleRemoveCompany(c.id)} className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded transition-colors" title="حذف"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                                {(!settings.companies || settings.companies.length === 0) && <span className="text-xs text-gray-400 block text-center py-2">لیست خالی است</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 border-t pt-6"><div className="flex items-center gap-2 mb-2"><Landmark className="text-teal-600" size={20} /><h3 className="font-bold text-gray-800">مدیریت نام بانک‌ها</h3></div><div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4"><div className="space-y-2"><label className="text-xs font-bold text-gray-600">افزودن نام بانک جدید</label><div className="flex gap-2"><input className="flex-1 border rounded-lg p-2 text-sm" placeholder="نام بانک..." value={newBank} onChange={e => setNewBank(e.target.value)} /><button type="button" onClick={handleAddBank} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-teal-700"><Plus size={16} /></button></div></div><div className="space-y-2"><label className="text-xs font-bold text-gray-600">لیست بانک‌های موجود</label><div className="space-y-1 max-h-40 overflow-y-auto">{settings.bankNames.map(b => (<div key={b} className="flex justify-between items-center bg-white border border-gray-200 p-2 rounded text-sm"><span>{b}</span><button type="button" onClick={() => handleRemoveBank(b)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button></div>))}{settings.bankNames.length === 0 && <span className="text-xs text-gray-400">لیست خالی است</span>}</div></div></div></div>
                <div className="space-y-4 border-t pt-6"><div className="flex items-center gap-2 mb-2"><Package className="text-amber-600" size={20} /><h3 className="font-bold text-gray-800">مدیریت گروه‌های کالایی (بازرگانی)</h3></div><div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4"><div className="space-y-2"><label className="text-xs font-bold text-gray-600">افزودن گروه کالایی جدید</label><div className="flex gap-2"><input className="flex-1 border rounded-lg p-2 text-sm" placeholder="مثال: مواد اولیه، قطعات یدکی..." value={newCommodity} onChange={e => setNewCommodity(e.target.value)} /><button type="button" onClick={handleAddCommodity} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-700"><Plus size={16} /></button></div></div><div className="space-y-2"><label className="text-xs font-bold text-gray-600">لیست گروه‌های موجود</label><div className="space-y-1 max-h-40 overflow-y-auto">{settings.commodityGroups.map(c => (<div key={c} className="flex justify-between items-center bg-white border border-gray-200 p-2 rounded text-sm"><span>{c}</span><button type="button" onClick={() => handleRemoveCommodity(c)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button></div>))}{(!settings.commodityGroups || settings.commodityGroups.length === 0) && <span className="text-xs text-gray-400">لیست خالی است</span>}</div></div></div></div>
                
                <div className="space-y-4 pt-6 border-t border-gray-100"><div className="flex items-center gap-2 mb-4"><Database className="text-purple-600" size={20} /><h3 className="font-bold text-gray-800">مدیریت داده‌ها</h3></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex items-center justify-between"><span className="text-sm font-medium text-purple-900">دانلود نسخه پشتیبان</span><button onClick={handleDownloadBackup} type="button" className="bg-white text-purple-700 px-3 py-1.5 rounded-lg text-sm border border-purple-200">دانلود</button></div><div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between"><div><input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" /><span className="text-sm font-medium text-blue-900">بازگردانی اطلاعات</span></div><button onClick={handleRestoreClick} type="button" className="bg-white text-blue-700 px-3 py-1.5 rounded-lg text-sm border border-blue-200">انتخاب فایل</button></div></div></div>
                </>
            ) : (
                <div className="overflow-x-auto"><div className="flex items-center gap-2 mb-4 text-purple-700 bg-purple-50 p-3 rounded-lg border border-purple-100"><ShieldCheck size={20} /><p className="text-sm font-medium">در این بخش می‌توانید مشخص کنید هر نقش چه مجوزهایی دارد.</p></div><table className="w-full text-sm text-center border-collapse"><thead><tr className="bg-gray-100 text-gray-700"><th className="p-3 border border-gray-200 text-right">عنوان مجوز / نقش</th>{roles.map(role => (<th key={role.id} className="p-3 border border-gray-200 w-24">{role.label}</th>))}</tr></thead><tbody>{permissions.map(perm => (<tr key={perm.id} className="hover:bg-gray-50"><td className="p-3 border border-gray-200 text-right font-medium text-gray-600">{perm.label}</td>{roles.map(role => { const rolePerms = settings.rolePermissions?.[role.id] || {}; /* @ts-ignore */ const isChecked = !!rolePerms[perm.id]; return (<td key={role.id} className="p-3 border border-gray-200"><input type="checkbox" checked={isChecked} onChange={(e) => handlePermissionChange(role.id, perm.id as keyof RolePermissions, e.target.checked)} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer" /></td>); })}</tr>))}</tbody></table><div className="text-xs text-gray-500 mt-4 space-y-1"><p>* مجوز "ویرایش/حذف دستور خود" فقط زمانی کار می‌کند که دستور هنوز تایید نشده باشد (یا تایید مراحل بالاتر نباشد).</p><p>* "مشاهده تمام دستورات" اگر غیرفعال باشد، کاربر فقط دستوراتی که خودش ثبت کرده را می‌بیند.</p><p>* مجوز "دسترسی به بخش بازرگانی" برای مشاهده و مدیریت پرونده‌های واردات/صادرات الزامی است.</p></div></div>
            )}
            <div className="flex justify-end border-t border-gray-100 pt-6"><button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all disabled:opacity-70">{loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}ذخیره تنظیمات</button></div>
        </form>
        )}
        {message && (<div className={`mt-6 p-3 rounded-lg text-sm text-center ${message.includes('خطا') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>)}
    </div>
  );
};
export default Settings;
