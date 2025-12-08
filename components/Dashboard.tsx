
import React, { useState, useMemo } from 'react';
import { PaymentOrder, OrderStatus, PaymentMethod, SystemSettings } from '../types';
import { formatCurrency, parsePersianDate, formatNumberString } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, Clock, CheckCircle, Archive, Activity, Building2, X, XCircle, AlertCircle, Banknote, Calendar as CalendarIcon, ExternalLink, Share2, Plus, CalendarDays, Loader2, Send, Camera } from 'lucide-react';
import { apiCall } from '../services/apiService';

interface DashboardProps {
  orders: PaymentOrder[];
  settings?: SystemSettings;
  onViewArchive?: () => void;
  onFilterByStatus?: (status: OrderStatus | 'pending_all') => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Dashboard: React.FC<DashboardProps> = ({ orders, settings, onViewArchive, onFilterByStatus }) => {
  const [showBankReport, setShowBankReport] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  
  // WhatsApp Modal State
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppTarget, setWhatsAppTarget] = useState('');
  const [whatsAppMessage, setWhatsAppMessage] = useState('');
  const [sendAsImage, setSendAsImage] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  
  // Calendar Internal Logic (If no Google ID)
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const pendingOrders = orders.filter(o => o.status !== OrderStatus.APPROVED_CEO && o.status !== OrderStatus.REJECTED);
  const completedOrders = orders.filter(o => o.status === OrderStatus.APPROVED_CEO);
  const totalAmount = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  const countPending = orders.filter(o => o.status === OrderStatus.PENDING).length;
  const countFin = orders.filter(o => o.status === OrderStatus.APPROVED_FINANCE).length;
  const countMgr = orders.filter(o => o.status === OrderStatus.APPROVED_MANAGER).length;
  const countRejected = orders.filter(o => o.status === OrderStatus.REJECTED).length;

  const statusData = [
    { name: 'در انتظار مالی', value: countPending, color: '#fbbf24' },
    { name: 'در انتظار مدیریت', value: countFin, color: '#f59e0b' },
    { name: 'در انتظار مدیرعامل', value: countMgr, color: '#d97706' },
    { name: 'تایید نهایی', value: completedOrders.length, color: '#10b981' },
    { name: 'رد شده', value: countRejected, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const methodDataRaw: Record<string, number> = {};
  orders.forEach(order => { order.paymentDetails.forEach(detail => { methodDataRaw[detail.method] = (methodDataRaw[detail.method] || 0) + detail.amount; }); });
  const methodData = Object.keys(methodDataRaw).map(key => ({ name: key, amount: methodDataRaw[key] }));

  const bankStats = useMemo(() => {
    const stats: Record<string, number> = {};
    completedOrders.forEach(order => { order.paymentDetails.forEach(detail => { if (detail.bankName && detail.bankName.trim() !== '') { const normalizedName = detail.bankName.trim(); stats[normalizedName] = (stats[normalizedName] || 0) + detail.amount; } }); });
    return Object.entries(stats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [completedOrders]);

  // Cheque Report Logic
  const chequeData = useMemo(() => {
      const allCheques: any[] = [];
      orders.forEach(order => {
          order.paymentDetails.forEach(detail => {
              if (detail.method === PaymentMethod.CHEQUE && detail.chequeDate) {
                  const dueDate = parsePersianDate(detail.chequeDate);
                  if (dueDate) {
                      const now = new Date();
                      const diffTime = dueDate.getTime() - now.getTime();
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      
                      allCheques.push({
                          id: detail.id,
                          bank: detail.bankName || 'نامشخص',
                          number: detail.chequeNumber,
                          date: detail.chequeDate,
                          amount: detail.amount,
                          payee: order.payee,
                          daysLeft: diffDays,
                          isPassed: diffDays < 0
                      });
                  }
              }
          });
      });
      return allCheques.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [orders]);

  const handleOpenWhatsAppModal = () => {
      let text = `📊 *گزارش وضعیت مالی* 📊\n`;
      text += `📅 تاریخ: ${new Date().toLocaleDateString('fa-IR')}\n`;
      text += `----------------------\n`;
      text += `🟡 در انتظار: ${pendingOrders.length} مورد\n`;
      text += `✅ تایید شده: ${completedOrders.length} مورد\n`;
      text += `💰 مجموع پرداختی: ${formatNumberString(totalAmount)} ریال\n`;
      text += `----------------------\n`;
      
      if (chequeData.length > 0) {
          const upcoming = chequeData.filter(c => c.daysLeft <= 3 && !c.isPassed).length;
          if (upcoming > 0) text += `⚠️ *هشدار چک:* ${upcoming} چک در ۳ روز آینده سررسید می‌شوند.\n`;
      }

      setWhatsAppMessage(text);
      setWhatsAppTarget(settings?.whatsappNumber || '');
      setSendAsImage(false);
      setShowWhatsAppModal(true);
  };

  const handleSendWhatsApp = async () => {
      if (!whatsAppTarget.trim()) {
          alert("لطفا شماره گیرنده یا آیدی گروه را وارد کنید.");
          return;
      }

      setSendingReport(true);
      try {
          let mediaData = null;
          if (sendAsImage) {
              const element = document.getElementById('dashboard-content-area');
              if (element) {
                  // @ts-ignore
                  const canvas = await window.html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#f3f4f6' });
                  const base64 = canvas.toDataURL('image/png').split(',')[1];
                  mediaData = {
                      data: base64,
                      mimeType: 'image/png',
                      filename: 'dashboard_report.png'
                  };
              }
          }

          const response = await apiCall<{success: boolean, message?: string}>('/send-whatsapp', 'POST', { 
              number: whatsAppTarget, 
              message: whatsAppMessage,
              mediaData: mediaData 
          });
          
          if (response.success) {
              alert(response.message || 'پیام با موفقیت ارسال شد.');
          } else {
              alert(response.message || 'خطا در ارسال پیام');
          }
          setShowWhatsAppModal(false);
      } catch (e: any) {
          console.error("WhatsApp Send Error:", e);
          alert(`خطا: ${e.message || 'مشکل در ارتباط با سرور'}`);
      } finally {
          setSendingReport(false);
      }
  };

  // Internal Calendar Renderer
  const renderInternalCalendar = () => {
        const year = calendarMonth.getFullYear(); 
        const month = calendarMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDay = firstDay.getDay(); 
        const shamsiTitle = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long' }).format(calendarMonth);

        // Map events to dates (simplified matching)
        const events = chequeData.map(c => ({
            date: c.date, 
            title: `چک: ${c.payee} (${formatNumberString(c.amount)})`,
            type: 'cheque'
        }));

        const days = [];
        for (let i = 0; i < startingDay; i++) { days.push(<div key={`empty-${i}`} className="h-20 bg-gray-50 border-r border-b"></div>); }
        for (let d = 1; d <= daysInMonth; d++) {
            const shamsiDateStr = new Date(year, month, d).toLocaleDateString('fa-IR-u-nu-latn').replace(/\//g, '/');
            const parts = shamsiDateStr.split('/');
            const shamsiFormatted = `${parts[0]}/${parts[1].padStart(2,'0')}/${parts[2].padStart(2,'0')}`;
            const dayEvents = events.filter(e => e.date === shamsiFormatted || e.date === shamsiDateStr);

            days.push(
                <div key={d} className="h-20 border-r border-b p-1 relative hover:bg-blue-50 transition-colors group">
                    <div className="font-bold text-xs text-gray-700">{d}</div>
                    <div className="mt-1 space-y-1 overflow-y-auto max-h-14">
                        {dayEvents.map((ev, idx) => (
                            <div key={idx} className="text-[9px] bg-red-100 text-red-700 p-1 rounded truncate" title={ev.title}>{ev.title}</div>
                        ))}
                    </div>
                </div>
            );
        }

        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mt-6">
                <div className="flex justify-between items-center p-3 border-b">
                    <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="p-1 hover:bg-gray-100 rounded">قبل</button>
                    <h3 className="font-bold">{shamsiTitle}</h3>
                    <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="p-1 hover:bg-gray-100 rounded">بعد</button>
                </div>
                <div className="grid grid-cols-7 text-center text-xs font-bold bg-gray-50 border-b"><div className="p-2">1ش</div><div className="p-2">2ش</div><div className="p-2">3ش</div><div className="p-2">4ش</div><div className="p-2">5ش</div><div className="p-2">جمعه</div><div className="p-2">شنبه</div></div>
                <div className="grid grid-cols-7 dir-ltr">{days}</div>
            </div>
        );
  };

  return (
    <div id="dashboard-content-area" className="space-y-6 animate-fade-in min-w-0 relative">
      
      {/* WhatsApp Modal */}
      {showWhatsAppModal && (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-lg flex items-center gap-2"><Share2 size={20} className="text-green-600"/> ارسال گزارش به واتساپ</h3>
                      <button onClick={() => setShowWhatsAppModal(false)} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-sm font-bold text-gray-700 block mb-1">انتخاب مخاطب / گروه</label>
                          
                          {/* Saved Contacts Dropdown */}
                          <div className="mb-2">
                              <select 
                                className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                onChange={(e) => {
                                    if(e.target.value) setWhatsAppTarget(e.target.value);
                                }}
                              >
                                  <option value="">-- انتخاب از مخاطبین ذخیره شده --</option>
                                  {settings?.savedContacts && settings.savedContacts.length > 0 ? (
                                      settings.savedContacts.map(c => (
                                          <option key={c.id} value={c.number}>
                                              {c.isGroup ? `[گروه] ${c.name}` : c.name}
                                          </option>
                                      ))
                                  ) : (
                                      <option disabled>لیست مخاطبین خالی است (از تنظیمات اضافه کنید)</option>
                                  )}
                              </select>
                          </div>

                          <input 
                            type="text" 
                            className="w-full border border-green-200 rounded-lg p-2 text-sm dir-ltr font-mono bg-green-50" 
                            placeholder="98912xxxxxxx or 1234@g.us"
                            value={whatsAppTarget}
                            onChange={(e) => setWhatsAppTarget(e.target.value)}
                          />
                          <p className="text-[10px] text-gray-500 mt-1">شماره را بدون + یا 00 وارد کنید (مثال: 98912...). برای گروه از ID استفاده کنید.</p>
                      </div>

                      <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-lg">
                          <input 
                            type="checkbox" 
                            id="sendAsImage" 
                            checked={sendAsImage} 
                            onChange={e => setSendAsImage(e.target.checked)} 
                            className="w-4 h-4 text-green-600 rounded"
                          />
                          <label htmlFor="sendAsImage" className="text-sm font-bold flex items-center gap-1 cursor-pointer">
                              <Camera size={16}/> ارسال به صورت تصویر (اسکرین‌شات)
                          </label>
                      </div>

                      <div>
                          <label className="text-sm font-bold text-gray-700 block mb-1">متن گزارش (قابل ویرایش)</label>
                          <textarea 
                            rows={8} 
                            className="w-full border rounded-lg p-2 text-xs leading-relaxed resize-none" 
                            value={whatsAppMessage}
                            onChange={(e) => setWhatsAppMessage(e.target.value)}
                          />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                          <button onClick={() => setShowWhatsAppModal(false)} className="px-4 py-2 rounded-lg border text-gray-600 text-sm hover:bg-gray-50">انصراف</button>
                          <button 
                            onClick={handleSendWhatsApp} 
                            disabled={sendingReport || !whatsAppTarget} 
                            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                          >
                              {sendingReport ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} ارسال پیام
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold text-gray-800">داشبورد وضعیت مالی</h2>
          <div className="flex gap-2">
              <button onClick={() => setShowCalendar(!showCalendar)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${showCalendar ? 'bg-indigo-100 text-indigo-700' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
                  <CalendarIcon size={18}/> {showCalendar ? 'مخفی کردن تقویم' : 'مشاهده تقویم'}
              </button>
              <button onClick={handleOpenWhatsAppModal} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm">
                  <Share2 size={18}/> ارسال گزارش
              </button>
          </div>
      </div>

      {/* Calendar Section */}
      {showCalendar && (
          <div className="animate-fade-in mb-8">
              {settings?.googleCalendarId ? (
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200">
                      <div className="flex justify-between items-center mb-4">
                          <h3 className="font-bold text-gray-800 flex items-center gap-2"><CalendarIcon className="text-blue-600"/> تقویم گوگل</h3>
                          <a href="https://calendar.google.com" target="_blank" className="text-xs text-blue-600 flex items-center gap-1 hover:underline"><ExternalLink size={12}/> باز کردن در گوگل</a>
                      </div>
                      <iframe src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(settings.googleCalendarId)}&ctz=Asia%2FTehran`} style={{border: 0}} width="100%" height="600" frameBorder="0" scrolling="no" className="rounded-lg"></iframe>
                  </div>
              ) : (
                  renderInternalCalendar()
              )}
          </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
         <div onClick={() => onFilterByStatus && onFilterByStatus(OrderStatus.PENDING)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md hover:border-yellow-300 transition-all"><div><p className="text-xs text-gray-500 mb-1">در انتظار مالی</p><p className="text-xl font-bold text-yellow-600">{countPending}</p></div><div className="bg-yellow-50 p-2 rounded-lg text-yellow-500"><Clock size={20}/></div></div>
         <div onClick={() => onFilterByStatus && onFilterByStatus(OrderStatus.APPROVED_FINANCE)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md hover:border-orange-300 transition-all"><div><p className="text-xs text-gray-500 mb-1">در انتظار مدیریت</p><p className="text-xl font-bold text-orange-600">{countFin}</p></div><div className="bg-orange-50 p-2 rounded-lg text-orange-500"><Activity size={20}/></div></div>
         <div onClick={() => onFilterByStatus && onFilterByStatus(OrderStatus.APPROVED_MANAGER)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md hover:border-amber-400 transition-all"><div><p className="text-xs text-gray-500 mb-1">در انتظار مدیرعامل</p><p className="text-xl font-bold text-amber-700">{countMgr}</p></div><div className="bg-amber-50 p-2 rounded-lg text-amber-600"><CheckCircle size={20}/></div></div>
         <div onClick={onViewArchive} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md hover:border-green-300 transition-all"><div><p className="text-xs text-gray-500 mb-1">تایید نهایی شده</p><p className="text-xl font-bold text-green-600">{completedOrders.length}</p></div><div className="bg-green-50 p-2 rounded-lg text-green-500"><Archive size={20}/></div></div>
         <div onClick={() => onFilterByStatus && onFilterByStatus(OrderStatus.REJECTED)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer hover:shadow-md hover:border-red-300 transition-all"><div><p className="text-xs text-gray-500 mb-1">درخواست‌های رد شده</p><p className="text-xl font-bold text-red-600">{countRejected}</p></div><div className="bg-red-50 p-2 rounded-lg text-red-500"><XCircle size={20}/></div></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div onClick={() => onFilterByStatus && onFilterByStatus('pending_all')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all group relative overflow-hidden"><div className="absolute right-0 top-0 w-1 h-full bg-amber-400 group-hover:w-1.5 transition-all"></div><div className="p-3 bg-amber-100 text-amber-600 rounded-xl"><Clock size={24} /></div><div><p className="text-sm text-gray-500 mb-1">کل سفارشات در جریان</p><p className="text-2xl font-bold text-gray-900">{pendingOrders.length}</p></div></div>
        <div onClick={() => setShowBankReport(true)} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group relative overflow-hidden"><div className="absolute right-0 top-0 w-1 h-full bg-blue-500 group-hover:w-1.5 transition-all"></div><div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors"><TrendingUp size={24} /></div><div><div className="flex items-center gap-2"><p className="text-sm text-gray-500 mb-1">مجموع پرداختی (نهایی)</p><span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded border border-blue-100">گزارش بانک</span></div><p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p></div></div>
      </div>

      {/* Cheque Report Widget */}
      {chequeData.length > 0 && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 w-full min-w-0">
              <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2"><Banknote size={20} className="text-purple-600"/> گزارش چک‌های صادره و سررسید</h3>
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-right">
                      <thead className="bg-gray-50 text-gray-600 text-xs">
                          <tr>
                              <th className="px-4 py-3">نام بانک</th>
                              <th className="px-4 py-3">شماره چک</th>
                              <th className="px-4 py-3">در وجه (گیرنده)</th>
                              <th className="px-4 py-3">تاریخ سررسید</th>
                              <th className="px-4 py-3">مبلغ</th>
                              <th className="px-4 py-3 text-center">وضعیت</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {chequeData.slice(0, 10).map((c) => (
                              <tr key={c.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-gray-700">{c.bank}</td>
                                  <td className="px-4 py-3 font-mono text-gray-600">{c.number}</td>
                                  <td className="px-4 py-3 font-bold text-gray-800">{c.payee}</td>
                                  <td className="px-4 py-3 dir-ltr text-right">{c.date}</td>
                                  <td className="px-4 py-3 font-mono font-bold text-gray-900 dir-ltr">{formatCurrency(c.amount)}</td>
                                  <td className="px-4 py-3 text-center">
                                      {c.isPassed ? (
                                          <span className="text-gray-400 text-xs bg-gray-100 px-2 py-1 rounded">پاس شده / گذشته</span>
                                      ) : c.daysLeft <= 2 ? (
                                          <span className="text-red-600 text-xs bg-red-50 px-2 py-1 rounded font-bold animate-pulse">⚠️ {c.daysLeft} روز مانده</span>
                                      ) : (
                                          <span className="text-green-600 text-xs bg-green-50 px-2 py-1 rounded">{c.daysLeft} روز مانده</span>
                                      )}
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
                  {chequeData.length > 10 && <div className="text-center text-xs text-gray-400 mt-2">... و {chequeData.length - 10} مورد دیگر</div>}
              </div>
          </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] w-full min-w-0"><h3 className="text-lg font-bold text-gray-700 mb-4">وضعیت درخواست‌ها</h3><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">{statusData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}</Pie><Tooltip contentStyle={{ fontFamily: 'Vazirmatn', borderRadius: '8px' }} /><Legend wrapperStyle={{ fontFamily: 'Vazirmatn' }} /></PieChart></ResponsiveContainer></div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-[400px] w-full min-w-0"><h3 className="text-lg font-bold text-gray-700 mb-4">هزینه بر اساس روش پرداخت</h3><ResponsiveContainer width="100%" height="100%"><BarChart data={methodData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" /><XAxis dataKey="name" tick={{ fontFamily: 'Vazirmatn', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(val) => `${val / 1000000}M`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ fontFamily: 'Vazirmatn', borderRadius: '8px', direction: 'rtl' }} cursor={{fill: '#f3f4f6'}} /><Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} /></BarChart></ResponsiveContainer></div>
      </div>
      {showBankReport && (<div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowBankReport(false)}><div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between p-6 border-b bg-gray-50"><div className="flex items-center gap-3"><div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Building2 size={24} /></div><div><h2 className="text-xl font-bold text-gray-800">گزارش تفکیکی بانک‌ها</h2><p className="text-xs text-gray-500 mt-1">فقط شامل دستور پرداخت‌های تایید نهایی شده</p></div></div><button onClick={() => setShowBankReport(false)} className="text-gray-400 hover:text-red-500 transition-colors bg-white p-2 rounded-lg border border-gray-200 shadow-sm"><X size={20} /></button></div><div className="p-6 overflow-y-auto">{bankStats.length === 0 ? (<div className="text-center py-12 text-gray-400 flex flex-col items-center"><Building2 size={48} className="mb-4 opacity-50" /><p>اطلاعات بانکی ثبت شده‌ای یافت نشد.</p></div>) : (<div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="border rounded-xl overflow-hidden"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-600"><tr><th className="px-4 py-3">نام بانک</th><th className="px-4 py-3">مجموع پرداختی</th><th className="px-4 py-3">درصد</th></tr></thead><tbody className="divide-y divide-gray-100">{bankStats.map((bank, idx) => (<tr key={idx} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium text-gray-800">{bank.name}</td><td className="px-4 py-3 text-gray-600 dir-ltr text-right font-mono">{formatCurrency(bank.value)}</td><td className="px-4 py-3 text-gray-400 text-xs">{((bank.value / totalAmount) * 100).toFixed(1)}%</td></tr>))}<tr className="bg-blue-50/50 font-bold border-t-2 border-blue-100"><td className="px-4 py-3 text-blue-800">جمع کل بانکی</td><td className="px-4 py-3 text-blue-800 dir-ltr text-right font-mono">{formatCurrency(bankStats.reduce((acc, curr) => acc + curr.value, 0))}</td><td></td></tr></tbody></table></div><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={bankStats} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">{bankStats.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ fontFamily: 'Vazirmatn', borderRadius: '8px' }} /><Legend wrapperStyle={{ fontFamily: 'Vazirmatn' }} /></PieChart></ResponsiveContainer></div></div>)}</div></div></div>)}
    </div>
  );
};
export default Dashboard;
