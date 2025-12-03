
import React, { useState, useMemo } from 'react';
import { PaymentOrder, OrderStatus, PaymentMethod } from '../types';
import { formatCurrency, parsePersianDate } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, Clock, CheckCircle, Archive, Activity, Building2, X, XCircle, AlertCircle, Banknote } from 'lucide-react';

interface DashboardProps {
  orders: PaymentOrder[];
  onViewArchive?: () => void;
  onFilterByStatus?: (status: OrderStatus | 'pending_all') => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const Dashboard: React.FC<DashboardProps> = ({ orders, onViewArchive, onFilterByStatus }) => {
  const [showBankReport, setShowBankReport] = useState(false);
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
      // Sort by Due Date (Ascending)
      return allCheques.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [orders]);

  return (
    <div className="space-y-6 animate-fade-in min-w-0">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">داشبورد وضعیت مالی</h2>
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
