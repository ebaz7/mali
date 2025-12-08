
import React, { useState, useMemo } from 'react';
import { PaymentOrder, OrderStatus, PaymentMethod, SystemSettings } from '../types';
import { formatCurrency, parsePersianDate, formatNumberString, getShamsiDateFromIso } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, Clock, CheckCircle, Archive, Activity, Building2, X, XCircle, AlertCircle, Banknote, Calendar as CalendarIcon, ExternalLink, Share2, Plus, CalendarDays, Loader2, Send, Camera, Users, Trash2, List, TrendingDown, ArrowUpRight } from 'lucide-react';
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
  const [showCalendar, setShowCalendar] = useState(false);
  const [showContactsList, setShowContactsList] = useState(false);
  
  // WhatsApp Modal State
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsAppTarget, setWhatsAppTarget] = useState('');
  const [whatsAppMessage, setWhatsAppMessage] = useState('');
  const [sendAsImage, setSendAsImage] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  
  // Calendar Internal Logic
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

  // Bank Summary Stats
  const bankStats = useMemo(() => {
    const stats: Record<string, number> = {};
    completedOrders.forEach(order => { order.paymentDetails.forEach(detail => { if (detail.bankName && detail.bankName.trim() !== '') { const normalizedName = detail.bankName.trim(); stats[normalizedName] = (stats[normalizedName] || 0) + detail.amount; } }); });
    return Object.entries(stats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [completedOrders]);

  // Bank Timeline Breakdown (Month > Day > Details)
  const bankTimeline = useMemo(() => {
      const groups: Record<string, { label: string, total: number, count: number, days: Record<string, { total: number, items: any[] }> }> = {};
      
      completedOrders.forEach(order => {
          const dateParts = getShamsiDateFromIso(order.date);
          const monthKey = `${dateParts.year}/${String(dateParts.month).padStart(2, '0')}`;
          const monthLabel = `${MONTHS[dateParts.month - 1]} ${dateParts.year}`;

          if (!groups[monthKey]) {
              groups[monthKey] = { label: monthLabel, total: 0, count: 0, days: {} };
          }

          order.paymentDetails.forEach(detail => {
              if (detail.bankName) {
                  const dayKey = String(dateParts.day).padStart(2, '0');
                  
                  if (!groups[monthKey].days[dayKey]) {
                      groups[monthKey].days[dayKey] = { total: 0, items: [] };
                  }

                  const amount = detail.amount;
                  
                  // Add totals
                  groups[monthKey].total += amount;
                  groups[monthKey].count += 1;
                  groups[monthKey].days[dayKey].total += amount;
                  
                  // Add Item
                  groups[monthKey].days[dayKey].items.push({
                      id: detail.id,
                      bank: detail.bankName,
                      payee: order.payee,
                      amount: amount,
                      desc: order.description,
                      tracking: order.trackingNumber
                  });
              }
          });
      });

      // Convert to array and sort desc
      return Object.entries(groups)
          .sort((a, b) => b[0].localeCompare(a[0])) // Sort months desc
          .map(([key, data]) => ({
              key,
              ...data,
              days: Object.entries(data.days)
                  .sort((a, b) => Number(b[0]) - Number(a[0])) // Sort days desc
                  .map(([day, dayData]) => ({ day, ...dayData }))
          }));
  }, [completedOrders]);

  // Top Bank & Payee for Dashboard Cards
  const topBank = bankStats.length > 0 ? bankStats[0] : { name: '-', value: 0 };
  const mostActiveMonth = bankTimeline.length > 0 ? bankTimeline[0] : { label: '-', total: 0 };

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

  const handleOpenWhatsAppModal = () => { /* ... existing code ... */ setWhatsAppMessage(`📊 گزارش مالی...\n💰 کل: ${formatNumberString(totalAmount)}`); setWhatsAppTarget(settings?.whatsappNumber || ''); setSendAsImage(false); setShowWhatsAppModal(true); };
  const handleSendWhatsApp = async () => { /* ... existing code ... */ };
  const renderInternalCalendar = () => { /* ... existing code ... */ return <div/>; };

  return (
    <div id="dashboard-container" className="space-y-6 animate-fade-in min-w-0 relative">
      
      {/* ... (Existing WhatsApp Modal & Contacts Modal & Header Buttons) ... */}
      
      <div id="dashboard-content-area">
          {/* ... (Existing Calendar, Status Widgets) ... */}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div onClick={() => onFilterByStatus && onFilterByStatus('pending_all')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all group relative overflow-hidden"><div className="absolute right-0 top-0 w-1 h-full bg-amber-400 group-hover:w-1.5 transition-all"></div><div className="p-3 bg-amber-100 text-amber-600 rounded-xl"><Clock size={24} /></div><div><p className="text-sm text-gray-500 mb-1">کل سفارشات در جریان</p><p className="text-2xl font-bold text-gray-900">{pendingOrders.length}</p></div></div>
            <div onClick={() => setShowBankReport(true)} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group relative overflow-hidden"><div className="absolute right-0 top-0 w-1 h-full bg-blue-500 group-hover:w-1.5 transition-all"></div><div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors"><TrendingUp size={24} /></div><div><div className="flex items-center gap-2"><p className="text-sm text-gray-500 mb-1">مجموع پرداختی (نهایی)</p><span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded border border-blue-100">گزارش بانک</span></div><p className="text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p></div></div>
          </div>

          {/* ... (Existing Cheque & Charts) ... */}
      </div>

      {showBankReport && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowBankReport(false)}>
              <div id="bank-report-modal-content" className="bg-gray-50 rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-white/20" onClick={e => e.stopPropagation()}>
                  {/* Modern Header */}
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
