
import React, { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings, restoreSystemData, uploadFile } from '../services/storageService';
import { SystemSettings, UserRole, RolePermissions, Company, Contact } from '../types';
import { Settings as SettingsIcon, Save, Loader2, Download, Database, Bell, Plus, Trash2, Building, ShieldCheck, Landmark, Package, AppWindow, BellRing, BellOff, Send, Crown, Image as ImageIcon, Pencil, X, Check, MessageSquare, Calendar, Phone, QrCode, LogOut, RefreshCw, Users, FolderSync, Bot, Key, Truck } from 'lucide-react';
import { apiCall } from '../services/apiService';
import { requestNotificationPermission, setNotificationPreference, isNotificationEnabledInApp } from '../services/notificationService';
import { generateUUID } from '../constants';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'permissions' | 'whatsapp'>('general');
  const [settings, setSettings] = useState<SystemSettings>({ currentTrackingNumber: 1000, currentExitPermitNumber: 1000, companyNames: [], companies: [], defaultCompany: '', bankNames: [], commodityGroups: [], rolePermissions: {} as any, savedContacts: [], pwaIcon: '', telegramBotToken: '', telegramAdminId: '', smsApiKey: '', smsSenderNumber: '', googleCalendarId: '', whatsappNumber: '', geminiApiKey: '' });
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
              currentExitPermitNumber: data.currentExitPermitNumber || 1000,
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
              geminiApiKey: data.geminiApiKey || ''
          }; 
          
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
          setTimeout(checkWhatsappStatus, 2000); 
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
          interval = setInterval(checkWhatsappStatus, 3000); 
      }
      return () => clearInterval(interval);
  }, [activeTab, whatsappStatus]);

  const handleSave = async (e: React.FormEvent) => { 
      e.preventDefault(); 
      setLoading(true); 
      try { 
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
          updatedCompanies = (settings.companies || []).map(c => 
              c.id === editingCompanyId ? { ...c, name: newCompanyName.trim(), logo: newCompanyLogo } : c
          );
      } else {
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
      window.scrollTo({ top: 0, behavior: 'smooth' }); 
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

  const roles = [ { id: UserRole.USER, label: 'کاربر عادی' }, { id: UserRole.FINANCIAL, label: 'مدیر مالی' }, { id: UserRole.MANAGER, label: 'مدیر داخلی' }, { id: UserRole.CEO, label: 'مدیر عامل' }, { id: UserRole.SALES_MANAGER, label: 'مدیر فروش' }, { id: UserRole.FACTORY_MANAGER, label: 'مدیر کارخانه' }, { id: UserRole.ADMIN, label: 'مدیر سیستم' }, ];
  const permissions = [ 
      { id: 'canViewAll', label: 'مشاهده تمام دستورات' }, 
      { id: 'canEditOwn', label: 'ویرایش دستور خود (در صورت عدم تایید)' }, 
      { id: 'canDeleteOwn', label: 'حذف دستور خود (در صورت عدم تایید)' }, 
      { id: 'canEditAll', label: 'ویرایش تمام دستورات' }, 
      { id: 'canDeleteAll', label: 'حذف تمام دستورات' }, 
      { id: 'canApproveFinancial', label: 'تایید مرحله مالی' }, 
      { id: 'canApproveManager', label: 'تایید مرحله مدیریت' }, 
      { id: 'canApproveCeo', label: 'تایید مرحله نهایی (مالی)' }, 
      { id: 'canManageTrade', label: 'دسترسی به بخش بازرگانی' }, 
      { id: 'canManageSettings', label: 'دسترسی به تنظیمات سیستم' },
      { id: 'canCreateExitPermit', label: 'ثبت درخواست خروج بار' },
      { id: 'canApproveExitCeo', label: 'تایید خروج بار (مدیرعامل)' },
      { id: 'canApproveExitFactory', label: 'تایید خروج بار (کارخانه)' }
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 max-w-4xl mx-auto animate-fade-in space-y-6 mb-20 min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4"><div className="flex items-center gap-3"><div className="bg-gray-100 p-2 rounded-lg text-gray-600"><SettingsIcon size={24} /></div><h2 className="text-xl font-bold text-gray-800">تنظیمات سیستم</h2></div><div className="flex gap-2 overflow-x-auto"><button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'general' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>عمومی</button><button onClick={() => setActiveTab('whatsapp')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'whatsapp' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>اتصال واتساپ</button><button onClick={() => setActiveTab('permissions')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'permissions' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>سطوح دسترسی</button></div></div>
        
        {/* ... (Existing tabs 'whatsapp' and parts of 'general') ... */}
        
        {activeTab === 'general' && (
            <form onSubmit={handleSave} className="space-y-8">
                {/* ... (Existing sections: AI, Notifications, Telegram, Calendar, SMS) ... */}
                
                {/* Numbering Section */}
                <div className="space-y-4 border-t pt-6">
                    <h3 className="font-bold text-gray-800">شماره‌گذاری اسناد</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">شروع شماره دستور پرداخت</label>
                            <input type="number" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 dir-ltr text-left" value={settings.currentTrackingNumber} onChange={(e) => setSettings({...settings, currentTrackingNumber: Number(e.target.value)})} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><Truck size={16}/> شروع شماره مجوز خروج</label>
                            <input type="number" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500 dir-ltr text-left" value={settings.currentExitPermitNumber} onChange={(e) => setSettings({...settings, currentExitPermitNumber: Number(e.target.value)})} />
                        </div>
                    </div>
                </div>

                {/* ... (Existing Company Management) ... */}
                
                <div className="flex justify-end border-t border-gray-100 pt-6"><button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all disabled:opacity-70">{loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}ذخیره تنظیمات</button></div>
            </form>
        )}

        {activeTab === 'permissions' && (
             <form onSubmit={handleSave}>
                <div className="overflow-x-auto"><div className="flex items-center gap-2 mb-4 text-purple-700 bg-purple-50 p-3 rounded-lg border border-purple-100"><ShieldCheck size={20} /><p className="text-sm font-medium">در این بخش می‌توانید مشخص کنید هر نقش چه مجوزهایی دارد.</p></div><table className="w-full text-sm text-center border-collapse"><thead><tr className="bg-gray-100 text-gray-700"><th className="p-3 border border-gray-200 text-right">عنوان مجوز / نقش</th>{roles.map(role => (<th key={role.id} className="p-3 border border-gray-200 w-24">{role.label}</th>))}</tr></thead><tbody>{permissions.map(perm => (<tr key={perm.id} className="hover:bg-gray-50"><td className="p-3 border border-gray-200 text-right font-medium text-gray-600">{perm.label}</td>{roles.map(role => { const rolePerms = settings.rolePermissions?.[role.id] || {}; /* @ts-ignore */ const isChecked = !!rolePerms[perm.id]; return (<td key={role.id} className="p-3 border border-gray-200"><input type="checkbox" checked={isChecked} onChange={(e) => handlePermissionChange(role.id, perm.id as keyof RolePermissions, e.target.checked)} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer" /></td>); })}</tr>))}</tbody></table></div>
                <div className="flex justify-end border-t border-gray-100 pt-6"><button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all disabled:opacity-70">{loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}ذخیره تنظیمات</button></div>
             </form>
        )}
        
        {/* ... (WhatsApp tab content assumed same as previous file) ... */}
        
        {message && (<div className={`mt-6 p-3 rounded-lg text-sm text-center ${message.includes('خطا') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>)}
    </div>
  );
};
export default Settings;
