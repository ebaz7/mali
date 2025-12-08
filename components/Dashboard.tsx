
import React, { useState, useMemo } from 'react';
import { PaymentOrder, OrderStatus, PaymentMethod, SystemSettings } from '../types';
import { formatCurrency, parsePersianDate, formatNumberString, getShamsiDateFromIso, jalaliToGregorian, getCurrentShamsiDate } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, Clock, CheckCircle, Activity, Building2, X, XCircle, Banknote, Calendar as CalendarIcon, Share2, Plus, CalendarDays, Loader2, Send, ShieldCheck, ArrowUpRight, List, ChevronLeft, ChevronRight, Briefcase, Settings } from 'lucide-react';
import { apiCall } from '../services/apiService';

interface DashboardProps {
  orders: PaymentOrder[];
  settings?: SystemSettings;
  onViewArchive?: () => void;
  onFilterByStatus?: (status: OrderStatus | 'pending_all') => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
const MONTHS = [ 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند' ];

const Dashboard: React.FC<DashboardProps> = ({ orders, settings, onViewArchive, onFilterByStatus }) => {
  const [showBankReport, setShowBankReport] = useState(false);
  const [bankReportTab, setBankReportTab] = useState<'summary' | 'timeline'>('summary');
  
  // Calendar State (Fallback)
  const currentShamsi = getCurrentShamsiDate();
  const [calendarMonth, setCalendarMonth] = useState({ year: currentShamsi.year, month: currentShamsi.month });

  const completedOrders = orders.filter(o => o.status === OrderStatus.APPROVED_CEO);
  const totalAmount = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);
  
  const countPending = orders.filter(o => o.status === OrderStatus.PENDING).length;
  const countFin = orders.filter(o => o.status === OrderStatus.APPROVED_FINANCE).length;
  const countMgr = orders.filter(o => o.status === OrderStatus.APPROVED_MANAGER).length;
  const countRejected = orders.filter(o => o.status === OrderStatus.REJECTED).length;

  // Active (Current) Cartable Logic
  const activeCartable = orders
    .filter(o => o.status !== OrderStatus.APPROVED_CEO && o.status !== OrderStatus.REJECTED)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10); // Show max 10 items

  // Status Widgets Data
  const statusWidgets = [
    { 
      key: OrderStatus.PENDING, 
      label: 'کارتابل مالی', 
      count: countPending, 
      icon: Clock, 
      color: 'text-amber-600', 
      bg: 'bg-amber-50', 
      border: 'border-amber-100',
      barColor: 'bg-amber-500'
    },
    { 
      key: OrderStatus.APPROVED_FINANCE, 
      label: 'کارتابل مدیریت', 
      count: countFin, 
      icon: Activity, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50', 
      border: 'border-blue-100',
      barColor: 'bg-blue-500'
    },
    { 
      key: OrderStatus.APPROVED_MANAGER, 
      label: 'کارتابل مدیرعامل', 
      count: countMgr, 
      icon: ShieldCheck, 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-50', 
      border: 'border-indigo-100',
      barColor: 'bg-indigo-500'
    },
    { 
      key: OrderStatus.REJECTED, 
      label: 'رد شده', 
      count: countRejected, 
      icon: XCircle, 
      color: 'text-red-600', 
      bg: 'bg-red-50', 
      border: 'border-red-100',
      barColor: 'bg-red-500'
    },
    { 
      key: OrderStatus.APPROVED_CEO, 
      label: 'بایگانی', 
      count: completedOrders.length, 
      icon: CheckCircle, 
      color: 'text-green-600', 
      bg: 'bg-green-50', 
      border: 'border-green-100',
      barColor: 'bg-green-500'
    }
  ];

  const methodDataRaw: Record<string, number> = {};
  orders.forEach(order => { order.paymentDetails.forEach(detail => { methodDataRaw[detail.method] = (methodDataRaw[detail.method] || 0) + detail.amount; }); });
  const methodData = Object.keys(methodDataRaw).map(key => ({ name: key, amount: methodDataRaw[key] }));

  // Bank Stats
  const bankStats = useMemo(() => {
    const stats: Record<string, number> = {};
    completedOrders.forEach(order => { order.paymentDetails.forEach(detail => { if (detail.bankName && detail.bankName.trim() !== '') { const normalizedName = detail.bankName.trim(); stats[normalizedName] = (stats[normalizedName] || 0) + detail.amount; } }); });
    return Object.entries(stats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [completedOrders]);

  // Bank Timeline
  const bankTimeline = useMemo(() => {
      const groups: Record<string, { label: string, total: number, count: number, days: Record<string, { total: number, items: any[] }> }> = {};
      completedOrders.forEach(order => {
          const dateParts = getShamsiDateFromIso(order.date);
          const monthKey = `${dateParts.year}/${String(dateParts.month).padStart(2, '0')}`;
          const monthLabel = `${MONTHS[dateParts.month - 1]} ${dateParts.year}`;
          if (!groups[monthKey]) { groups[monthKey] = { label: monthLabel, total: 0, count: 0, days: {} }; }
          order.paymentDetails.forEach(detail => {
              if (detail.bankName) {
                  const dayKey = String(dateParts.day).padStart(2, '0');
                  if (!groups[monthKey].days[dayKey]) { groups[monthKey].days[dayKey] = { total: 0, items: [] }; }
                  const amount = detail.amount;
                  groups[monthKey].total += amount;
                  groups[monthKey].count += 1;
                  groups[monthKey].days[dayKey].total += amount;
                  groups[monthKey].days[dayKey].items.push({ id: detail.id, bank: detail.bankName, payee: order.payee, amount: amount, desc: order.description, tracking: order.trackingNumber });
              }
          });
      });
      return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([key, data]) => ({ key, ...data, days: Object.entries(data.days).sort((a, b) => Number(b[0]) - Number(a[0])).map(([day, dayData]) => ({ day, ...dayData })) }));
  }, [completedOrders]);

  const topBank = bankStats.length > 0 ? bankStats[0] : { name: '-', value: 0 };
  const mostActiveMonth = bankTimeline.length > 0 ? bankTimeline[0] : { label: '-', total: 0 };

  // CALENDAR LOGIC (Fallback)
  const getDaysInMonth = (y: number, m: number) => {
      if (m <= 6) return 31;
      if (m <= 11) return 30;
      const isLeap = (y % 33 === 1 || y % 33 === 5 || y % 33 === 9 || y % 33 === 13 || y % 33 === 17 || y % 33 === 22 || y % 33 === 26 || y % 33 === 30);
      return isLeap ? 30 : 29;
  };

  const generateCalendarDays = () => {
      const days = [];
      const totalDays = getDaysInMonth(calendarMonth.year, calendarMonth.month);
      const gDate = jalaliToGregorian(calendarMonth.year, calendarMonth.month, 1);
      const startDayOfWeek = (gDate.getDay() + 1) % 7;

      for (let i = 0; i < startDayOfWeek; i++) {
          days.push(null);
      }
      for (let i = 1; i <= totalDays; i++) {
          days.push(i);
      }
      return days;
  };

  const changeMonth = (delta: number) => {
      let m = calendarMonth.month + delta;
      let y = calendarMonth.year;
      if (m > 12) { m = 1; y++; }
      else if (m < 1) { m = 12; y--; }
      setCalendarMonth({ year: y, month: m });
  };

  // Status Badge Helper
  const getStatusBadge = (status: OrderStatus) => {
      switch(status) {
          case OrderStatus.PENDING: return <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px]">مالی</span>;
          case OrderStatus.APPROVED_FINANCE: return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px]">مدیریت</span>;
          case OrderStatus.APPROVED_MANAGER: return <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px]">مدیرعامل</span>;
          default: return null;
      }
  };

  // Google Calendar Integration
  const googleCalendarId = settings?.googleCalendarId;

  return (
    <div className="space-y-6 animate-fade-in min-w-0 relative pb-10">
      
      {/* Top Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statusWidgets.map((widget) => {
            const Icon = widget.icon;
            return (
                <div 
                    key={widget.key} 
                    onClick={() => onFilterByStatus && onFilterByStatus(widget.key === OrderStatus.APPROVED_CEO ? 'pending_all' : widget.key as any)} 
                    className={`p-3 rounded-2xl shadow-sm border transition-all cursor-pointer group relative overflow-hidden bg-white hover:shadow-md ${widget.border}`}
                >
                    <div className={`absolute right-0 top-0 w-1 h-full ${widget.barColor} group-hover:w-1.5 transition-all`}></div>
                    <div className="flex justify-between items-start mb-1">
                        <div className={`p-2 rounded-xl ${widget.bg} ${widget.color}`}>
                            <Icon size={18} />
                        </div>
                        <span className="text-lg font-black text-gray-800">{widget.count}</span>
                    </div>
                    <h3 className="text-xs font-bold text-gray-600 truncate">{widget.label}</h3>
                </div>
            );
        })}
        
        {/* Bank Report Widget */}
        <div 
            onClick={() => setShowBankReport(true)} 
            className="p-3 rounded-2xl shadow-sm border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
        >
            <div className="absolute right-0 top-0 w-1 h-full bg-cyan-500 group-hover:w-1.5 transition-all"></div>
            <div className="flex justify-between items-start mb-1">
                <div className="p-2 rounded-xl bg-cyan-100 text-cyan-600">
                    <Building2 size={18} />
                </div>
            </div>
            <h3 className="text-xs font-bold text-gray-600">گزارش بانکی</h3>
            <span className="text-[10px] text-gray-400 font-mono mt-1 block">{formatNumberString(totalAmount)} Rls</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Right Column: Active Cartable & Charts */}
          <div className="lg:col-span-2 space-y-6">
              
              {/* Minimal Current Cartable */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2"><Briefcase size={20} className="text-blue-600"/> کارتابل جاری (در دست اقدام)</h3>
                      <button onClick={() => onFilterByStatus && onFilterByStatus('pending_all')} className="text-xs text-blue-600 hover:underline">مشاهده همه</button>
                  </div>
                  <div className="divide-y divide-gray-50">
                      {activeCartable.length === 0 ? (
                          <div className="p-8 text-center text-gray-400 text-sm">هیچ دستور پرداختی در جریان نیست.</div>
                      ) : (
                          activeCartable.map(order => (
                              <div key={order.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                                  <div className="flex items-center gap-3">
                                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${order.status === OrderStatus.PENDING ? 'bg-amber-100 text-amber-600' : order.status === OrderStatus.APPROVED_FINANCE ? 'bg-blue-100 text-blue-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                          {order.status === OrderStatus.PENDING ? '1' : order.status === OrderStatus.APPROVED_FINANCE ? '2' : '3'}
                                      </div>
                                      <div>
                                          <div className="flex items-center gap-2">
                                              <span className="font-bold text-gray-800 text-sm">{order.payee}</span>
                                              {getStatusBadge(order.status)}
                                          </div>
                                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                                              <span className="font-mono">#{order.trackingNumber}</span>
                                              <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                                              <span>{order.description.substring(0, 30)}...</span>
                                          </div>
                                      </div>
                                  </div>
                                  <div className="text-left">
                                      <div className="font-bold text-gray-800 font-mono text-sm">{formatCurrency(order.totalAmount)}</div>
                                      <div className="text-[10px] text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleDateString('fa-IR')}</div>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>

              {/* Chart */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="font-bold text-gray-800 mb-4 text-sm flex items-center gap-2"><TrendingUp size={18}/> نمودار روش‌های پرداخت</h3>
                  <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie data={methodData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="amount">
                                  {methodData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                              </Pie>
                              <Tooltip formatter={(value: number) => formatCurrency(value)} />
                              <Legend />
                          </PieChart>
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>

          {/* Left Column: Calendar & Quick Stats */}
          <div className="space-y-6">
              
              {/* Calendar Widget (Google Calendar or Fallback) */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-[380px] relative">
                  {googleCalendarId ? (
                      <iframe 
                          src={`https://calendar.google.com/calendar/embed?height=600&wkst=6&ctz=Asia%2FTehran&bgcolor=%23ffffff&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=0&showCalendars=0&showTz=0&src=${encodeURIComponent(googleCalendarId)}`} 
                          style={{border: 0}} 
                          width="100%" 
                          height="100%" 
                          frameBorder="0" 
                          scrolling="no"
                          title="Google Calendar"
                      ></iframe>
                  ) : (
                      <div className="p-5 h-full flex flex-col">
                          <div className="flex justify-between items-center mb-4">
                              <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={18}/></button>
                              <h3 className="font-bold text-gray-800">{MONTHS[calendarMonth.month - 1]} {calendarMonth.year}</h3>
                              <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={18}/></button>
                          </div>
                          <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-gray-500 font-bold">
                              <div>ش</div><div>ی</div><div>د</div><div>س</div><div>چ</div><div>پ</div><div>ج</div>
                          </div>
                          <div className="grid grid-cols-7 gap-1 text-center flex-1">
                              {generateCalendarDays().map((day, idx) => (
                                  <div 
                                    key={idx} 
                                    className={`aspect-square flex items-center justify-center rounded-lg text-xs font-medium 
                                        ${!day ? '' : 
                                          (day === currentShamsi.day && calendarMonth.month === currentShamsi.month && calendarMonth.year === currentShamsi.year) ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-gray-50 text-gray-700'
                                        }`}
                                  >
                                      {day}
                                  </div>
                              ))}
                          </div>
                          <div className="mt-4 p-2 bg-yellow-50 rounded border border-yellow-100 text-[10px] text-yellow-800 text-center">
                              برای مشاهده تقویم گوگل خود، لطفا «آیدی تقویم» را در بخش تنظیمات (سربرگ اتصالات) وارد کنید.
                          </div>
                      </div>
                  )}
              </div>

              {/* Quick Summary Cards */}
              <div className="grid grid-cols-1 gap-3">
                  <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-center justify-between">
                      <div><div className="text-xs text-emerald-600 font-bold mb-1">محبوب‌ترین بانک</div><div className="font-bold text-emerald-800 text-sm">{topBank.name}</div></div>
                      <Building2 className="text-emerald-300" size={24}/>
                  </div>
                  <div className="bg-violet-50 p-4 rounded-2xl border border-violet-100 flex items-center justify-between">
                      <div><div className="text-xs text-violet-600 font-bold mb-1">پرتراکنش‌ترین ماه</div><div className="font-bold text-violet-800 text-sm">{mostActiveMonth.label}</div></div>
                      <CalendarIcon className="text-violet-300" size={24}/>
                  </div>
              </div>
          </div>
      </div>

      {/* Bank Report Modal (Existing Code) */}
      {showBankReport && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowBankReport(false)}>
              <div id="bank-report-modal-content" className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-white/20" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-6 bg-white border-b sticky top-0 z-10">
                      <div className="flex items-center gap-4">
                          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-500/30"><Building2 size={28} /></div>
                          <div><h2 className="text-2xl font-black text-gray-800 tracking-tight">داشبورد بانکی</h2><p className="text-xs text-gray-500 font-medium mt-1">تحلیل جامع پرداخت‌های تایید شده</p></div>
                      </div>
                      <button onClick={() => setShowBankReport(false)} className="bg-gray-100 p-2 rounded-full hover:bg-red-50 hover:text-red-500 transition-all"><X size={20} /></button>
                  </div>
                  
                  {/* Summary Cards */}
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-white border-b">
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden group">
                          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full group-hover:scale-110 transition-transform"></div>
                          <div className="relative z-10">
                              <p className="text-emerald-100 text-xs font-bold mb-1">مجموع خروجی (کل)</p>
                              <h3 className="text-2xl font-black tracking-tight dir-ltr font-mono">{formatCurrency(totalAmount).replace('ریال', '')} <span className="text-sm opacity-80">IRR</span></h3>
                          </div>
                          <TrendingUp className="absolute left-4 bottom-4 text-white/20" size={40}/>
                      </div>
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden group">
                          <div className="relative z-10">
                              <p className="text-blue-100 text-xs font-bold mb-1">برترین بانک (حجم تراکنش)</p>
                              <h3 className="text-xl font-bold truncate">{topBank.name}</h3>
                              <p className="text-xs opacity-80 font-mono mt-1 dir-ltr">{formatCurrency(topBank.value)}</p>
                          </div>
                          <Building2 className="absolute left-4 bottom-4 text-white/20" size={40}/>
                      </div>
                      <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/20 relative overflow-hidden group">
                          <div className="relative z-10">
                              <p className="text-violet-100 text-xs font-bold mb-1">پرتراکنش‌ترین ماه</p>
                              <h3 className="text-xl font-bold">{mostActiveMonth.label}</h3>
                              <p className="text-xs opacity-80 font-mono mt-1 dir-ltr">{formatCurrency(mostActiveMonth.total)}</p>
                          </div>
                          <CalendarIcon className="absolute left-4 bottom-4 text-white/20" size={40}/>
                      </div>
                  </div>

                  {/* Tabs */}
                  <div className="px-6 pt-4 border-b bg-white flex gap-6">
                      <button onClick={() => setBankReportTab('summary')} className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${bankReportTab === 'summary' ? 'text-blue-600 border-blue-600' : 'text-gray-400 border-transparent hover:text-gray-600'}`}><PieChart size={18}/> نمودار عملکرد</button>
                      <button onClick={() => setBankReportTab('timeline')} className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${bankReportTab === 'timeline' ? 'text-indigo-600 border-indigo-600' : 'text-gray-400 border-transparent hover:text-gray-600'}`}><List size={18}/> ریز تراکنش‌ها</button>
                  </div>

                  <div className="p-6 overflow-y-auto bg-gray-50 flex-1 custom-scrollbar">
                      {bankStats.length === 0 ? (<div className="text-center py-12 text-gray-400 flex flex-col items-center"><Building2 size={48} className="mb-4 opacity-30" /><p>اطلاعات بانکی ثبت شده‌ای یافت نشد.</p></div>) : (
                          <>
                            {bankReportTab === 'summary' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                        <h4 className="font-bold text-gray-700 mb-4 text-sm">سهم بانک‌ها از پرداخت</h4>
                                        <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={bankStats} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" stroke="none">{bankStats.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Pie><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ fontFamily: 'Vazirmatn', borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)' }} /><Legend wrapperStyle={{ fontFamily: 'Vazirmatn', fontSize: '12px' }} /></PieChart></ResponsiveContainer></div>
                                    </div>
                                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                                        <h4 className="font-bold text-gray-700 mb-4 text-sm">جدول عملکرد بانک‌ها</h4>
                                        <div className="flex-1 overflow-auto">
                                            <table className="w-full text-sm">
                                                <thead className="text-gray-400 text-xs border-b"><tr><th className="pb-2 text-right">نام بانک</th><th className="pb-2 text-left pl-4">مبلغ (ریال)</th><th className="pb-2 text-center">سهم</th></tr></thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {bankStats.map((bank, idx) => (
                                                        <tr key={idx} className="group hover:bg-gray-50">
                                                            <td className="py-3 font-bold text-gray-700 flex items-center gap-2"><div className="w-2 h-8 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}}></div>{bank.name}</td>
                                                            <td className="py-3 text-left pl-4 font-mono font-bold text-gray-800 dir-ltr">{formatNumberString(bank.value)}</td>
                                                            <td className="py-3 text-center text-xs font-bold text-gray-500 bg-gray-50 rounded-lg">{((bank.value / totalAmount) * 100).toFixed(1)}%</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {bankReportTab === 'timeline' && (
                                <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
                                    {bankTimeline.map((month) => (
                                        <div key={month.key} className="relative pl-6 border-l-2 border-dashed border-indigo-200">
                                            <div className="absolute -left-[11px] top-0 w-6 h-6 bg-indigo-100 rounded-full border-4 border-white shadow-sm flex items-center justify-center"><div className="w-2 h-2 bg-indigo-500 rounded-full"></div></div>
                                            
                                            <div className="flex justify-between items-end mb-4">
                                                <div>
                                                    <h4 className="text-lg font-black text-gray-800">{month.label}</h4>
                                                    <p className="text-xs text-gray-500 mt-1">{month.count} تراکنش ثبت شده</p>
                                                </div>
                                                <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl text-sm font-bold font-mono border border-indigo-100 shadow-sm">{formatCurrency(month.total)}</div>
                                            </div>

                                            <div className="space-y-3">
                                                {month.days.map((day) => (
                                                    <div key={day.day} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                                                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-dashed border-gray-100">
                                                            <div className="flex items-center gap-2">
                                                                <span className="bg-gray-100 text-gray-600 font-bold text-xs w-8 h-8 flex items-center justify-center rounded-lg">{day.day}</span>
                                                                <span className="text-xs font-bold text-gray-400">روز {month.label.split(' ')[0]}</span>
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">جمع روز: {formatCurrency(day.total)}</span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {day.items.map((item: any, i: number) => (
                                                                <div key={i} className="flex justify-between items-center text-sm p-2 rounded-lg hover:bg-gray-50 transition-colors">
                                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                                        <div className="bg-blue-50 p-2 rounded-full text-blue-500 shrink-0"><ArrowUpRight size={14}/></div>
                                                                        <div className="flex flex-col overflow-hidden">
                                                                            <span className="font-bold text-gray-800 truncate">{item.payee}</span>
                                                                            <span className="text-[10px] text-gray-500 truncate flex items-center gap-1"><span className="font-bold text-blue-600">{item.bank}</span> • {item.desc}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <div className="font-mono font-bold text-gray-800">{formatCurrency(item.amount)}</div>
                                                                        <div className="text-[10px] text-gray-400 font-mono">#{item.tracking}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                          </>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
export default Dashboard;
