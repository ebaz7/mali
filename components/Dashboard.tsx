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

  return (
    <div className="space-y-6 animate-fade-in">
        {/* Status Widgets */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {statusWidgets.map(w => {
                const Icon = w.icon;
                return (
                    <div key={w.key} onClick={() => onFilterByStatus && onFilterByStatus(w.key)} className={`bg-white p-4 rounded-xl shadow-sm border ${w.border} cursor-pointer hover:shadow-md transition-all`}>
                        <div className="flex justify-between items-start mb-2">
                            <div className={`p-2 rounded-lg ${w.bg} ${w.color}`}><Icon size={20}/></div>
                            <span className="text-2xl font-bold text-gray-800">{w.count}</span>
                        </div>
                        <div className="text-xs text-gray-500 font-bold">{w.label}</div>
                        <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div className={`h-full ${w.barColor}`} style={{width: `${(w.count / (orders.length || 1)) * 100}%`}}></div>
                        </div>
                    </div>
                );
            })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Active Cartable */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><List size={20} className="text-blue-600"/> آخرین درخواست‌های فعال</h3>
                    <button onClick={() => onFilterByStatus && onFilterByStatus('pending_all')} className="text-xs text-blue-600 hover:underline">مشاهده همه</button>
                </div>
                <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                    {activeCartable.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">موردی برای نمایش وجود ندارد</div>
                    ) : (
                        activeCartable.map(order => (
                            <div key={order.id} className="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center group">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">#{order.trackingNumber}</span>
                                        <span className="font-bold text-sm text-gray-800">{order.payee}</span>
                                    </div>
                                    <div className="text-xs text-gray-500">{order.description}</div>
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-blue-600 font-mono">{formatCurrency(order.totalAmount)}</div>
                                    <div className="text-[10px] text-gray-400 mt-1">{new Date(order.createdAt).toLocaleDateString('fa-IR')}</div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Charts Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><PieChart size={20} className="text-purple-600"/> آمار پرداخت‌ها</h3>
                <div className="flex-1 min-h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={methodData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="amount"
                            >
                                {methodData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-center text-sm mb-2">
                        <span className="text-gray-500">جمع کل پرداخت‌ها:</span>
                        <span className="font-bold text-gray-800 font-mono">{formatCurrency(totalAmount)}</span>
                    </div>
                    {topBank.name !== '-' && (
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">بانک برتر:</span>
                            <span className="font-bold text-blue-600">{topBank.name}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Bank Report (Expandable) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 cursor-pointer" onClick={() => setShowBankReport(!showBankReport)}>
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Banknote size={20} className="text-green-600"/> گزارش عملکرد بانکی</h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{showBankReport ? 'بستن' : 'مشاهده جزئیات'}</span>
                    {showBankReport ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
                </div>
            </div>
            
            {showBankReport && (
                <div className="p-4 animate-fade-in">
                    <div className="flex gap-2 mb-4 border-b">
                        <button onClick={() => setBankReportTab('summary')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${bankReportTab === 'summary' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>خلاصه وضعیت</button>
                        <button onClick={() => setBankReportTab('timeline')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${bankReportTab === 'timeline' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>تایم‌لاین پرداخت</button>
                    </div>

                    {bankReportTab === 'summary' && (
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={bankStats} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" width={100} tick={{fontSize: 12}} />
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{fill: 'transparent'}} />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {bankReportTab === 'timeline' && (
                        <div className="space-y-4 max-h-[400px] overflow-y-auto">
                            {bankTimeline.map(month => (
                                <div key={month.key} className="border rounded-xl overflow-hidden">
                                    <div className="bg-gray-50 p-3 flex justify-between items-center border-b">
                                        <span className="font-bold text-gray-800">{month.label}</span>
                                        <div className="flex gap-4 text-xs">
                                            <span className="text-gray-600">تعداد: {month.count}</span>
                                            <span className="text-blue-600 font-bold">جمع: {formatCurrency(month.total)}</span>
                                        </div>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        {month.days.map(day => (
                                            <div key={day.day} className="flex gap-2 text-sm border-b last:border-0 pb-2 last:pb-0">
                                                <div className="w-8 font-bold text-gray-400 pt-1">{day.day}</div>
                                                <div className="flex-1 space-y-1">
                                                    {day.items.map((item: any, i: number) => (
                                                        <div key={i} className="flex justify-between items-center bg-gray-50 p-2 rounded hover:bg-gray-100 transition-colors">
                                                            <div>
                                                                <div className="font-bold text-gray-700">{item.payee}</div>
                                                                <div className="text-xs text-gray-500">{item.bank} - {item.desc}</div>
                                                            </div>
                                                            <div className="font-mono font-bold text-blue-600">{formatCurrency(item.amount)}</div>
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
                </div>
            )}
        </div>
    </div>
  );
};

export default Dashboard;