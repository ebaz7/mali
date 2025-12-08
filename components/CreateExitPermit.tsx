
import React, { useState, useEffect } from 'react';
import { ExitPermit, ExitPermitStatus, User, ExitPermitItem, ExitPermitDestination } from '../types';
import { saveExitPermit, getNextExitPermitNumber } from '../services/storageService';
import { generateUUID, getCurrentShamsiDate, jalaliToGregorian } from '../constants';
import { Save, Loader2, Truck, Package, MapPin, Hash, Plus, Trash2, User as UserIcon, Phone } from 'lucide-react';

interface Props {
  onSuccess: () => void;
  currentUser: User;
}

const CreateExitPermit: React.FC<Props> = ({ onSuccess, currentUser }) => {
  const currentShamsi = getCurrentShamsiDate();
  const [shamsiDate, setShamsiDate] = useState({ year: currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day });
  const [permitNumber, setPermitNumber] = useState('');
  
  // Lists for Items and Destinations
  const [items, setItems] = useState<ExitPermitItem[]>([
      { id: generateUUID(), goodsName: '', cartonCount: 0, weight: 0 }
  ]);
  const [destinations, setDestinations] = useState<ExitPermitDestination[]>([
      { id: generateUUID(), recipientName: '', address: '', phone: '' }
  ]);

  const [driverInfo, setDriverInfo] = useState({
      plateNumber: '',
      driverName: '',
      description: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
      getNextExitPermitNumber().then(num => setPermitNumber(num.toString()));
  }, []);

  const getIsoDate = () => {
    try { 
        const date = jalaliToGregorian(shamsiDate.year, shamsiDate.month, shamsiDate.day); 
        return date.toISOString().split('T')[0]; 
    } catch (e) { return new Date().toISOString().split('T')[0]; }
  };

  // Item Handlers
  const handleAddItem = () => {
      setItems([...items, { id: generateUUID(), goodsName: '', cartonCount: 0, weight: 0 }]);
  };
  const handleRemoveItem = (id: string) => {
      if (items.length > 1) setItems(items.filter(i => i.id !== id));
  };
  const handleUpdateItem = (id: string, field: keyof ExitPermitItem, value: string | number) => {
      setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  // Destination Handlers
  const handleAddDestination = () => {
      setDestinations([...destinations, { id: generateUUID(), recipientName: '', address: '', phone: '' }]);
  };
  const handleRemoveDestination = (id: string) => {
      if (destinations.length > 1) setDestinations(destinations.filter(d => d.id !== id));
  };
  const handleUpdateDestination = (id: string, field: keyof ExitPermitDestination, value: string) => {
      setDestinations(destinations.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Basic Validation
      if (items.some(i => !i.goodsName)) { alert('لطفا نام کالا را برای تمام ردیف‌ها وارد کنید.'); return; }
      if (destinations.some(d => !d.recipientName || !d.address)) { alert('لطفا گیرنده و آدرس را برای تمام مقصدها وارد کنید.'); return; }

      setIsSubmitting(true);
      try {
          const permit: ExitPermit = {
              id: generateUUID(),
              permitNumber: Number(permitNumber),
              date: getIsoDate(),
              requester: currentUser.fullName,
              
              // New Array Fields
              items: items,
              destinations: destinations,
              
              // Helper fields for legacy view (can be empty or summary)
              goodsName: items.map(i => i.goodsName).join('، '),
              recipientName: destinations.map(d => d.recipientName).join('، '),
              
              plateNumber: driverInfo.plateNumber,
              driverName: driverInfo.driverName,
              description: driverInfo.description,
              status: ExitPermitStatus.PENDING_CEO,
              createdAt: Date.now()
          };
          await saveExitPermit(permit);
          onSuccess();
      } catch (e) {
          alert('خطا در ثبت درخواست');
      } finally {
          setIsSubmitting(false);
      }
  };

  const years = Array.from({ length: 11 }, (_, i) => 1400 + i);
  const months = [ 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند' ];
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  // Calculations
  const totalCartons = items.reduce((acc, i) => acc + (Number(i.cartonCount) || 0), 0);
  const totalWeight = items.reduce((acc, i) => acc + (Number(i.weight) || 0), 0);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in max-w-4xl mx-auto">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3"><div className="bg-orange-50 p-2 rounded-lg text-orange-600"><Truck size={24} /></div><h2 className="text-xl font-bold text-gray-800">ثبت درخواست خروج بار (چند ردیفه)</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-8">
            
            {/* Header Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div><label className="text-sm font-bold block mb-1 flex items-center gap-1"><Hash size={16}/> شماره مجوز</label><input type="number" className="w-full border rounded-xl p-3 bg-white text-left dir-ltr font-bold text-orange-600" value={permitNumber} onChange={e => setPermitNumber(e.target.value)} required /></div>
                <div><label className="text-sm font-bold block mb-1">تاریخ خروج</label><div className="flex gap-2"><select className="border rounded-xl p-2 bg-white flex-1" value={shamsiDate.day} onChange={e => setShamsiDate({...shamsiDate, day: Number(e.target.value)})}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select><select className="border rounded-xl p-2 bg-white flex-1" value={shamsiDate.month} onChange={e => setShamsiDate({...shamsiDate, month: Number(e.target.value)})}>{months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}</select><select className="border rounded-xl p-2 bg-white flex-1" value={shamsiDate.year} onChange={e => setShamsiDate({...shamsiDate, year: Number(e.target.value)})}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div></div>
            </div>

            {/* Items Section */}
            <div className="space-y-4">
                <div className="flex justify-between items-center"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Package size={20} className="text-blue-600"/> مشخصات اقلام و کالاها</h3><button type="button" onClick={handleAddItem} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-100 font-bold"><Plus size={14}/> افزودن کالا</button></div>
                <div className="bg-blue-50/50 rounded-xl border border-blue-100 overflow-hidden">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-blue-100 text-blue-800">
                            <tr>
                                <th className="p-3 w-10 text-center">#</th>
                                <th className="p-3">نام کالا / محصول</th>
                                <th className="p-3 w-32">تعداد کارتن</th>
                                <th className="p-3 w-32">وزن (KG)</th>
                                <th className="p-3 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-blue-100">
                            {items.map((item, index) => (
                                <tr key={item.id}>
                                    <td className="p-2 text-center text-gray-500 font-bold">{index + 1}</td>
                                    <td className="p-2"><input className="w-full border border-blue-200 rounded p-2" placeholder="شرح کالا..." value={item.goodsName} onChange={e => handleUpdateItem(item.id, 'goodsName', e.target.value)} required /></td>
                                    <td className="p-2"><input type="number" className="w-full border border-blue-200 rounded p-2 dir-ltr text-center" placeholder="0" value={item.cartonCount || ''} onChange={e => handleUpdateItem(item.id, 'cartonCount', Number(e.target.value))} /></td>
                                    <td className="p-2"><input type="number" className="w-full border border-blue-200 rounded p-2 dir-ltr text-center" placeholder="0" value={item.weight || ''} onChange={e => handleUpdateItem(item.id, 'weight', Number(e.target.value))} /></td>
                                    <td className="p-2 text-center"><button type="button" onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button></td>
                                </tr>
                            ))}
                            <tr className="bg-blue-100/50 font-bold text-blue-900">
                                <td colSpan={2} className="p-3 text-left pl-4">جمع کل:</td>
                                <td className="p-3 text-center dir-ltr">{totalCartons} کارتن</td>
                                <td className="p-3 text-center dir-ltr">{totalWeight} کیلوگرم</td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Destinations Section */}
            <div className="space-y-4 border-t pt-6">
                <div className="flex justify-between items-center"><h3 className="font-bold text-gray-800 flex items-center gap-2"><MapPin size={20} className="text-green-600"/> مشخصات گیرنده و مقصد (ها)</h3><button type="button" onClick={handleAddDestination} className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-green-100 font-bold"><Plus size={14}/> افزودن مقصد</button></div>
                <div className="space-y-3">
                    {destinations.map((dest, index) => (
                        <div key={dest.id} className="p-4 bg-green-50 rounded-xl border border-green-200 relative group">
                            {destinations.length > 1 && <button type="button" onClick={() => handleRemoveDestination(dest.id)} className="absolute top-2 left-2 text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>}
                            <div className="text-xs font-bold text-green-800 mb-2 flex items-center gap-1"><span className="bg-green-200 px-1.5 rounded text-green-900">{index + 1}</span> اطلاعات گیرنده</div>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                <div className="md:col-span-4"><input className="w-full border border-green-300 rounded p-2 text-sm" placeholder="نام گیرنده..." value={dest.recipientName} onChange={e => handleUpdateDestination(dest.id, 'recipientName', e.target.value)} required /></div>
                                <div className="md:col-span-3"><input className="w-full border border-green-300 rounded p-2 text-sm dir-ltr" placeholder="شماره تماس..." value={dest.phone} onChange={e => handleUpdateDestination(dest.id, 'phone', e.target.value)} /></div>
                                <div className="md:col-span-5"><input className="w-full border border-green-300 rounded p-2 text-sm" placeholder="آدرس کامل..." value={dest.address} onChange={e => handleUpdateDestination(dest.id, 'address', e.target.value)} required /></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Driver & Footer */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4 mt-6">
                <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2"><Truck size={18}/> اطلاعات راننده (اختیاری)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold block mb-1">نام راننده</label><input className="w-full border rounded-lg p-2 text-sm" value={driverInfo.driverName} onChange={e => setDriverInfo({...driverInfo, driverName: e.target.value})} /></div>
                    <div><label className="text-xs font-bold block mb-1">شماره پلاک</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" placeholder="12 A 345 67" value={driverInfo.plateNumber} onChange={e => setDriverInfo({...driverInfo, plateNumber: e.target.value})} /></div>
                </div>
                <div><label className="text-xs font-bold block mb-1">توضیحات تکمیلی</label><textarea className="w-full border rounded-lg p-2 text-sm h-20 resize-none" value={driverInfo.description} onChange={e => setDriverInfo({...driverInfo, description: e.target.value})} /></div>
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all">{isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}ثبت نهایی درخواست خروج</button>
        </form>
    </div>
  );
};

export default CreateExitPermit;
