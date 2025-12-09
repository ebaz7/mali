
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
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  
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

  const getMonthData = () => {
      const daysInMonth = getDaysInMonth(calendarMonth.year, calendarMonth.month);
      // Find start day of week (0=Sat, ..., 6=Fri for Persian calendar perspective, although JS Date 0=Sun)
      // We need to find the Gregorian date of the 1st of this Jalali month
      const startGregorian = jalaliToGregorian(calendarMonth.year, calendarMonth.month, 1);
      // JS getDay(): 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
      // Persian week starts Saturday. So we map:
      // Sat(6) -> 0
      // Sun(0) -> 1
      // Mon(1) -> 2
      // ...
      // Fri(5) -> 6
      const jsDay = startGregorian.getDay();
      const startDayOfWeek = (jsDay + 1) % 7; 

      const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      return { startDayOfWeek, daysArray };
  };

  const { startDayOfWeek, daysArray } = getMonthData();

  const getEventsForDay = (d: number) => {
      return orders.filter(o => {
          const pDate = getShamsiDateFromIso(o.date);
          return pDate.year === calendarMonth.year && pDate.month === calendarMonth.month && pDate.day === d;
      });
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20 md:pb-0">
      
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-5 text-white shadow-lg shadow-blue-200">
            <div className="flex justify-between items-start mb-4">
                <div><p className="text-blue-100 text-xs font-bold mb-1">مجموع پرداختی (بایگانی)</p><h3 className="text-2xl font-black font-mono tracking-tight">{formatCurrency(totalAmount).replace('ریال', '')} <span className="text-xs font-normal opacity-80">ریال</span></h3></div>
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm"><TrendingUp size={24} className="text-white"/></div>
            </div>
            <div className="flex gap-2">
                <button onClick={() => setShowBankReport(true)} className="flex-1 bg-white/10 hover:bg-white/20 text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"><Banknote size={14}/> گزارش بانک</button>
                <button onClick={() => setShowCalendarModal(true)} className="flex-1 bg-white/10 hover:bg-white/20 text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1"><CalendarDays size={14}/> تقویم</button>
            </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div><p className="text-gray-500 text-xs font-bold mb-1">پرکارترین بانک</p><h3 className="text-lg font-bold text-gray-800">{topBank.name}</h3></div>
                <div className="bg-purple-50 p-2 rounded-lg"><Building2 size={24} className="text-purple-600"/></div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4 overflow-hidden"><div className="bg-purple-500 h-1.5 rounded-full" style={{ width: '75%' }}></div></div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div><p className="text-gray-500 text-xs font-bold mb-1">شلوغ‌ترین ماه</p><h3 className="text-lg font-bold text-gray-800">{mostActiveMonth.label}</h3></div>
                <div className="bg-orange-50 p-2 rounded-lg"><CalendarIcon size={24} className="text-orange-600"/></div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4 overflow-hidden"><div className="bg-orange-500 h-1.5 rounded-full" style={{ width: '60%' }}></div></div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col justify-between cursor-pointer hover:border-blue-300 transition-colors" onClick={onViewArchive}>
            <div className="flex justify-between items-start">
                <div><p className="text-gray-500 text-xs font-bold mb-1">تعداد کل اسناد</p><h3 className="text-3xl font-black text-gray-800">{completedOrders.length}</h3></div>
                <div className="bg-green-50 p-2 rounded-lg"><CheckCircle size={24} className="text-green-600"/></div>
            </div>
            <div className="flex items-center gap-1 text-xs text-blue-600 font-bold mt-2"><ArrowUpRight size={14}/> مشاهده آرشیو</div>
        </div>
      </div>

      {/* Cartable Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {statusWidgets.map((w) => {
              const Icon = w.icon;
              return (
                  <div key={w.key} onClick={() => onFilterByStatus && onFilterByStatus(w.key)} className={`p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${w.bg} ${w.border} relative overflow-hidden group`}>
                      <div className={`absolute top-0 right-0 w-1 h-full ${w.barColor}`}></div>
                      <div className="flex justify-between items-start mb-2">
                          <Icon className={`${w.color}`} size={24} />
                          <span className={`text-2xl font-black ${w.color}`}>{w.count}</span>
                      </div>
                      <span className={`text-xs font-bold ${w.color} opacity-80`}>{w.label}</span>
                  </div>
              );
          })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Cartable List */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><List size={20} className="text-blue-600"/> کارتابل جاری (۱۰ مورد اخیر)</h3>
            <div className="overflow-y-auto max-h-[300px] pr-1">
                {activeCartable.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 text-sm">هیچ دستور پرداختی در جریان نیست.</div>
                ) : (
                    <div className="space-y-3">
                        {activeCartable.map(order => (
                            <div key={order.id} className="flex items-center p-3 rounded-xl bg-gray-50 border hover:border-blue-200 transition-colors">
                                <div className={`p-2 rounded-full shrink-0 ml-3 ${order.status === OrderStatus.REJECTED ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {order.status === OrderStatus.REJECTED ? <XCircle size={20}/> : <Clock size={20}/>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between mb-1">
                                        <span className="font-bold text-gray-800 text-sm truncate">{order.payee}</span>
                                        <span className="font-mono text-gray-500 text-xs bg-white px-2 rounded border">#{order.trackingNumber}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-500 truncate max-w-[150px]">{order.description}</span>
                                        <span className="font-bold text-gray-700">{formatCurrency(order.totalAmount)}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-1">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${order.status === OrderStatus.REJECTED ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {order.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Payment Methods Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col">
            <h3 className="font-bold text-gray-800 mb-4 text-center text-sm">تفکیک روش‌های پرداخت</h3>
            <div className="flex-1 min-h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={methodData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="amount">
                            {methodData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
      </div>

      {/* Bank Report Modal */}
      {showBankReport && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col animate-fade-in">
                  <div className="p-4 border-b flex justify-between items-center">
                      <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2"><Banknote size={20}/> گزارش تفکیکی بانک‌ها</h3>
                      <button onClick={() => setShowBankReport(false)} className="p-1 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-500"><X size={24}/></button>
                  </div>
                  <div className="flex p-2 bg-gray-50 gap-2 border-b">
                      <button onClick={() => setBankReportTab('summary')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${bankReportTab === 'summary' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:bg-gray-200'}`}>خلاصه عملکرد</button>
                      <button onClick={() => setBankReportTab('timeline')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${bankReportTab === 'timeline' ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:bg-gray-200'}`}>ریز تراکنش (تایم‌لاین)</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                      {bankReportTab === 'summary' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="bg-white p-4 rounded-xl border shadow-sm">
                                  <h4 className="font-bold text-gray-700 mb-4 border-b pb-2">نمودار توزیع بانک‌ها</h4>
                                  <div className="h-[300px]">
                                      <ResponsiveContainer width="100%" height="100%">
                                          <BarChart data={bankStats} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                              <XAxis type="number" hide />
                                              <YAxis dataKey="name" type="category" width={100} style={{ fontSize: '11px', fontWeight: 'bold' }} />
                                              <Tooltip cursor={{fill: 'transparent'}} formatter={(val: number) => formatCurrency(val)} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                                          </BarChart>
                                      </ResponsiveContainer>
                                  </div>
                              </div>
                              <div className="space-y-3">
                                  {bankStats.map((bank, idx) => (
                                      <div key={idx} className="bg-white p-3 rounded-xl border flex justify-between items-center shadow-sm">
                                          <div className="flex items-center gap-3">
                                              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                                              <span className="font-bold text-gray-700">{bank.name}</span>
                                          </div>
                                          <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{formatCurrency(bank.value)}</span>
                                      </div>
                                  ))}
                              </div>
                          </div>
                      ) : (
                          <div className="space-y-8 relative before:absolute before:right-8 before:top-0 before:h-full before:w-0.5 before:bg-gray-300">
                              {bankTimeline.map((month) => (
                                  <div key={month.key} className="relative pr-16">
                                      <div className="absolute right-6 top-0 w-4 h-4 bg-purple-600 rounded-full ring-4 ring-purple-100 transform translate-x-1/2"></div>
                                      <div className="bg-white p-4 rounded-xl border shadow-sm mb-4">
                                          <div className="flex justify-between items-center mb-4 border-b pb-2">
                                              <h4 className="font-bold text-purple-700 text-lg">{month.label}</h4>
                                              <div className="text-xs bg-purple-50 text-purple-800 px-3 py-1 rounded-full font-bold">جمع: {formatCurrency(month.total)} ({month.count} تراکنش)</div>
                                          </div>
                                          <div className="space-y-4">
                                              {month.days.map((day) => (
                                                  <div key={day.day}>
                                                      <div className="text-xs font-bold text-gray-400 mb-2">{day.day} {month.label.split(' ')[0]}</div>
                                                      <div className="space-y-2 border-r-2 border-gray-100 pr-2 mr-1">
                                                          {day.items.map((item: any, i: number) => (
                                                              <div key={i} className="flex justify-between items-center text-sm p-2 hover:bg-gray-50 rounded transition-colors">
                                                                  <div>
                                                                      <span className="font-bold block">{item.bank}</span>
                                                                      <span className="text-xs text-gray-500">{item.payee} - {item.desc}</span>
                                                                  </div>
                                                                  <div className="text-left">
                                                                      <span className="block font-mono font-bold text-gray-700">{formatCurrency(item.amount)}</span>
                                                                      <span className="text-[10px] text-gray-400 font-mono">#{item.tracking}</span>
                                                                  </div>
                                                              </div>
                                                          ))}
                                                      </div>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Calendar Modal - UPDATED FOR GOOGLE CALENDAR SUPPORT */}
      {showCalendarModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className={`bg-white rounded-2xl shadow-2xl w-full ${settings?.googleCalendarId ? 'max-w-4xl h-[80vh]' : 'max-w-lg'} p-6 animate-fade-in relative`}>
                  <button onClick={() => setShowCalendarModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><X size={24}/></button>
                  
                  {settings?.googleCalendarId ? (
                      <div className="w-full h-full flex flex-col">
                          <h3 className="font-bold text-lg mb-4 text-center">تقویم گوگل (Gmail)</h3>
                          <div className="flex-1 bg-white border rounded-xl overflow-hidden">
                              <iframe 
                                  src={`https://calendar.google.com/calendar/embed?src=${encodeURIComponent(settings.googleCalendarId)}&ctz=Asia/Tehran`} 
                                  style={{border: 0}} 
                                  width="100%" 
                                  height="100%" 
                                  frameBorder="0" 
                                  scrolling="no"
                              ></iframe>
                          </div>
                      </div>
                  ) : (
                      // Fallback Internal Calendar
                      <>
                          <div className="flex justify-between items-center mb-6 mt-6">
                              <div className="flex gap-2 items-center mx-auto">
                                  <button onClick={() => { if(calendarMonth.month===1) setCalendarMonth({year: calendarMonth.year-1, month: 12}); else setCalendarMonth({...calendarMonth, month: calendarMonth.month-1})}} className="p-1 hover:bg-gray-100 rounded"><ChevronRight/></button>
                                  <h3 className="font-bold text-lg w-32 text-center">{MONTHS[calendarMonth.month - 1]} {calendarMonth.year}</h3>
                                  <button onClick={() => { if(calendarMonth.month===12) setCalendarMonth({year: calendarMonth.year+1, month: 1}); else setCalendarMonth({...calendarMonth, month: calendarMonth.month+1})}} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft/></button>
                              </div>
                          </div>
                          <div className="grid grid-cols-7 gap-1 text-center mb-2">
                              {['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(d => <div key={d} className="text-xs font-bold text-gray-500">{d}</div>)}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                              {Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`empty-${i}`}></div>)}
                              {daysArray.map(d => {
                                  const events = getEventsForDay(d);
                                  const hasEvent = events.length > 0;
                                  const total = events.reduce((sum, e) => sum + e.totalAmount, 0);
                                  return (
                                      <div key={d} className={`aspect-square rounded-lg flex flex-col items-center justify-center border relative ${hasEvent ? 'bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100' : 'bg-white border-gray-100'}`} title={hasEvent ? `${events.length} پرداخت: ${formatCurrency(total)}` : ''}>
                                          <span className={`text-sm ${hasEvent ? 'font-bold text-blue-600' : 'text-gray-600'}`}>{d}</span>
                                          {hasEvent && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1"></div>}
                                      </div>
                                  );
                              })}
                          </div>
                          <div className="mt-6 text-center">
                              <p className="text-xs text-gray-500">نکته: برای مشاهده تقویم گوگل، شناسه تقویم (Calendar ID) را در تنظیمات وارد کنید.</p>
                          </div>
                      </>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;
