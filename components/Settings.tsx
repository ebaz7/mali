







import React, { useState, useEffect, useRef } from 'react';
import { getSettings, saveSettings, restoreSystemData, uploadFile } from '../services/storageService';
import { SystemSettings, UserRole, RolePermissions } from '../types';
import { Settings as SettingsIcon, Save, Loader2, Download, UploadCloud, Database, AlertTriangle, Bell, Info, Plus, Trash2, Building, ShieldCheck, Landmark, Package, AppWindow, BellRing, BellOff, Send, Crown } from 'lucide-react';
import { apiCall } from '../services/apiService';
import { requestNotificationPermission, setNotificationPreference, isNotificationEnabledInApp } from '../services/notificationService';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'permissions'>('general');
  const [settings, setSettings] = useState<SystemSettings>({ currentTrackingNumber: 1000, companyNames: [], defaultCompany: '', bankNames: [], commodityGroups: [], rolePermissions: {} as any, pwaIcon: '', telegramBotToken: '', telegramAdminId: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newBank, setNewBank] = useState('');
  const [newCommodity, setNewCommodity] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const isSecure = window.isSecureContext;

  useEffect(() => { loadSettings(); setNotificationsEnabled(isNotificationEnabledInApp()); }, []);

  const loadSettings = async () => { try { const data = await getSettings(); const safeData = { ...data, companyNames: data.companyNames || [], defaultCompany: data.defaultCompany || '', bankNames: data.bankNames || [], commodityGroups: data.commodityGroups || [], rolePermissions: data.rolePermissions || {}, pwaIcon: data.pwaIcon || '', telegramBotToken: data.telegramBotToken || '', telegramAdminId: data.telegramAdminId || '' }; setSettings(safeData); } catch (e) { console.error("Failed to load settings"); } };
  const handleSave = async (e: React.FormEvent) => { e.preventDefault(); setLoading(true); try { await saveSettings(settings); setMessage('تنظیمات با موفقیت ذخیره شد.'); setTimeout(() => setMessage(''), 3000); } catch (e) { setMessage('خطا در ذخیره تنظیمات.'); } finally { setLoading(false); } };
  const handleAddCompany = () => { if (newCompany.trim() && !settings.companyNames.includes(newCompany.trim())) { setSettings({ ...settings, companyNames: [...settings.companyNames, newCompany.trim()] }); setNewCompany(''); } };
  const handleRemoveCompany = (name: string) => { setSettings({ ...settings, companyNames: settings.companyNames.filter(c => c !== name) }); };
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
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b pb-4 gap-4"><div className="flex items-center gap-3"><div className="bg-gray-100 p-2 rounded-lg text-gray-600"><SettingsIcon size={24} /></div><h2 className="text-xl font-bold text-gray-800">تنظیمات سیستم</h2></div><div className="flex gap-2"><button onClick={() => setActiveTab('general')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'general' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>عمومی</button><button onClick={() => setActiveTab('permissions')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'permissions' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>سطوح دسترسی</button></div></div>
        <form onSubmit={handleSave} className="space-y-8">
            {activeTab === 'general' ? (
                <>
                {/* NOTIFICATIONS SECTION */}
                <div className="space-y-4">
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
                
                {/* TELEGRAM BOT SECTION */}
                <div className="space-y-4 border-t pt-6">
                    <div className="flex items-center gap-2 mb-2"><Send className="text-blue-500" size={20} /><h3 className="font-bold text-gray-800">ربات تلگرام (اعلان‌های کارتابل)</h3></div>
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                برای دریافت توکن، به ربات <a href="https://t.me/BotFather" target="_blank" className="text-blue-600 underline font-bold">BotFather@</a> در تلگرام پیام دهید و یک ربات جدید بسازید.
                                <br/>
                                توجه: کاربران باید Chat ID خود را در پروفایلشان وارد کنند تا پیام دریافت کنند.
                            </p>
                        </div>
                        <div className="md:col-span-2 border-t border-blue-200 pt-3">
                             <label className="text-xs font-bold text-gray-700 flex items-center gap-1 mb-2"><Crown size={14}/> شناسه چت ادمین اصلی (جهت بک‌آپ)</label>
                             <input 
                                type="text" 
                                className="w-full border border-blue-200 rounded-lg p-2 text-sm dir-ltr font-mono" 
                                placeholder="Admin Chat ID"
                                value={settings.telegramAdminId}
                                onChange={(e) => setSettings({...settings, telegramAdminId: e.target.value})}
                             />
                             <p className="text-[10px] text-gray-500 mt-1">فایل‌های بک‌آپ خودکار (هر ۸ ساعت) به این آیدی ارسال می‌شود. خودتان به ربات پیام دهید و /id را بزنید.</p>
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

                <div className="space-y-4 border-t pt-6"><div className="flex items-center gap-2 mb-2"><Building className="text-blue-600" size={20} /><h3 className="font-bold text-gray-800">مدیریت شرکت‌ها (سربرگ)</h3></div><div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4"><div className="space-y-2"><label className="text-xs font-bold text-gray-600">شرکت پیش‌فرض</label><select className="w-full border rounded-lg p-2 text-sm bg-white" value={settings.defaultCompany} onChange={(e) => setSettings({...settings, defaultCompany: e.target.value})}><option value="">-- انتخاب کنید --</option>{settings.companyNames.map(c => <option key={c} value={c}>{c}</option>)}</select></div><div className="space-y-2"><label className="text-xs font-bold text-gray-600">افزودن نام شرکت جدید</label><div className="flex gap-2"><input className="flex-1 border rounded-lg p-2 text-sm" placeholder="نام شرکت..." value={newCompany} onChange={e => setNewCompany(e.target.value)} /><button type="button" onClick={handleAddCompany} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700"><Plus size={16} /></button></div></div><div className="space-y-2"><label className="text-xs font-bold text-gray-600">لیست شرکت‌های موجود</label><div className="space-y-1 max-h-40 overflow-y-auto">{settings.companyNames.map(c => (<div key={c} className="flex justify-between items-center bg-white border border-gray-200 p-2 rounded text-sm"><span>{c}</span><button type="button" onClick={() => handleRemoveCompany(c)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button></div>))}{settings.companyNames.length === 0 && <span className="text-xs text-gray-400">لیست خالی است</span>}</div></div></div></div>
                <div className="space-y-4 border-t pt-6"><div className="flex items-center gap-2 mb-2"><Landmark className="text-teal-600" size={20} /><h3 className="font-bold text-gray-800">مدیریت نام بانک‌ها</h3></div><div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4"><div className="space-y-2"><label className="text-xs font-bold text-gray-600">افزودن نام بانک جدید</label><div className="flex gap-2"><input className="flex-1 border rounded-lg p-2 text-sm" placeholder="نام بانک..." value={newBank} onChange={e => setNewBank(e.target.value)} /><button type="button" onClick={handleAddBank} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-teal-700"><Plus size={16} /></button></div></div><div className="space-y-2"><label className="text-xs font-bold text-gray-600">لیست بانک‌های موجود</label><div className="space-y-1 max-h-40 overflow-y-auto">{settings.bankNames.map(b => (<div key={b} className="flex justify-between items-center bg-white border border-gray-200 p-2 rounded text-sm"><span>{b}</span><button type="button" onClick={() => handleRemoveBank(b)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button></div>))}{settings.bankNames.length === 0 && <span className="text-xs text-gray-400">لیست خالی است</span>}</div></div></div></div>
                <div className="space-y-4 border-t pt-6"><div className="flex items-center gap-2 mb-2"><Package className="text-amber-600" size={20} /><h3 className="font-bold text-gray-800">مدیریت گروه‌های کالایی (بازرگانی)</h3></div><div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4"><div className="space-y-2"><label className="text-xs font-bold text-gray-600">افزودن گروه کالایی جدید</label><div className="flex gap-2"><input className="flex-1 border rounded-lg p-2 text-sm" placeholder="مثال: مواد اولیه، قطعات یدکی..." value={newCommodity} onChange={e => setNewCommodity(e.target.value)} /><button type="button" onClick={handleAddCommodity} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-700"><Plus size={16} /></button></div></div><div className="space-y-2"><label className="text-xs font-bold text-gray-600">لیست گروه‌های موجود</label><div className="space-y-1 max-h-40 overflow-y-auto">{settings.commodityGroups.map(c => (<div key={c} className="flex justify-between items-center bg-white border border-gray-200 p-2 rounded text-sm"><span>{c}</span><button type="button" onClick={() => handleRemoveCommodity(c)} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button></div>))}{(!settings.commodityGroups || settings.commodityGroups.length === 0) && <span className="text-xs text-gray-400">لیست خالی است</span>}</div></div></div></div>
                
                <div className="space-y-4 pt-6 border-t border-gray-100"><div className="flex items-center gap-2 mb-4"><Database className="text-purple-600" size={20} /><h3 className="font-bold text-gray-800">مدیریت داده‌ها</h3></div><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex items-center justify-between"><span className="text-sm font-medium text-purple-900">دانلود نسخه پشتیبان</span><button onClick={handleDownloadBackup} type="button" className="bg-white text-purple-700 px-3 py-1.5 rounded-lg text-sm border border-purple-200">دانلود</button></div><div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-center justify-between"><div><input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" /><span className="text-sm font-medium text-blue-900">بازگردانی اطلاعات</span></div><button onClick={handleRestoreClick} type="button" className="bg-white text-blue-700 px-3 py-1.5 rounded-lg text-sm border border-blue-200">انتخاب فایل</button></div></div></div>
                </>
            ) : (
                <div className="overflow-x-auto"><div className="flex items-center gap-2 mb-4 text-purple-700 bg-purple-50 p-3 rounded-lg border border-purple-100"><ShieldCheck size={20} /><p className="text-sm font-medium">در این بخش می‌توانید مشخص کنید هر نقش چه مجوزهایی دارد.</p></div><table className="w-full text-sm text-center border-collapse"><thead><tr className="bg-gray-100 text-gray-700"><th className="p-3 border border-gray-200 text-right">عنوان مجوز / نقش</th>{roles.map(role => (<th key={role.id} className="p-3 border border-gray-200 w-24">{role.label}</th>))}</tr></thead><tbody>{permissions.map(perm => (<tr key={perm.id} className="hover:bg-gray-50"><td className="p-3 border border-gray-200 text-right font-medium text-gray-600">{perm.label}</td>{roles.map(role => { const rolePerms = settings.rolePermissions?.[role.id] || {}; /* @ts-ignore */ const isChecked = !!rolePerms[perm.id]; return (<td key={role.id} className="p-3 border border-gray-200"><input type="checkbox" checked={isChecked} onChange={(e) => handlePermissionChange(role.id, perm.id as keyof RolePermissions, e.target.checked)} className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer" /></td>); })}</tr>))}</tbody></table><div className="text-xs text-gray-500 mt-4 space-y-1"><p>* مجوز "ویرایش/حذف دستور خود" فقط زمانی کار می‌کند که دستور هنوز تایید نشده باشد (یا تایید مراحل بالاتر نباشد).</p><p>* "مشاهده تمام دستورات" اگر غیرفعال باشد، کاربر فقط دستوراتی که خودش ثبت کرده را می‌بیند.</p><p>* مجوز "دسترسی به بخش بازرگانی" برای مشاهده و مدیریت پرونده‌های واردات/صادرات الزامی است.</p></div></div>
            )}
            <div className="flex justify-end border-t border-gray-100 pt-6"><button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all disabled:opacity-70">{loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}ذخیره تنظیمات</button></div>
        </form>
        {message && (<div className={`mt-6 p-3 rounded-lg text-sm text-center ${message.includes('خطا') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{message}</div>)}
    </div>
  );
};
export default Settings;
