
import React, { useState, useEffect } from 'react';
import { ExitPermit, ExitPermitStatus, User } from '../types';
import { saveExitPermit, getNextExitPermitNumber } from '../services/storageService';
import { generateUUID, getCurrentShamsiDate, jalaliToGregorian } from '../constants';
import { Save, Loader2, Truck, Package, MapPin, Hash, User as UserIcon } from 'lucide-react';

interface Props {
  onSuccess: () => void;
  currentUser: User;
}

const CreateExitPermit: React.FC<Props> = ({ onSuccess, currentUser }) => {
  const currentShamsi = getCurrentShamsiDate();
  const [shamsiDate, setShamsiDate] = useState({ year: currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day });
  const [permitNumber, setPermitNumber] = useState('');
  const [formData, setFormData] = useState({
      goodsName: '',
      cartonCount: '',
      weight: '',
      recipientName: '',
      destinationAddress: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.goodsName || !formData.recipientName) { alert('لطفا فیلدهای ضروری را پر کنید.'); return; }
      
      setIsSubmitting(true);
      try {
          const permit: ExitPermit = {
              id: generateUUID(),
              permitNumber: Number(permitNumber),
              date: getIsoDate(),
              requester: currentUser.fullName,
              goodsName: formData.goodsName,
              cartonCount: Number(formData.cartonCount),
              weight: Number(formData.weight),
              recipientName: formData.recipientName,
              destinationAddress: formData.destinationAddress,
              plateNumber: formData.plateNumber,
              driverName: formData.driverName,
              description: formData.description,
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

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in max-w-3xl mx-auto">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3"><div className="bg-orange-50 p-2 rounded-lg text-orange-600"><Truck size={24} /></div><h2 className="text-xl font-bold text-gray-800">ثبت درخواست خروج بار</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div><label className="text-sm font-bold block mb-1 flex items-center gap-1"><Hash size={16}/> شماره مجوز</label><input type="number" className="w-full border rounded-xl p-3 bg-gray-50 text-left dir-ltr font-bold text-orange-600" value={permitNumber} onChange={e => setPermitNumber(e.target.value)} required /></div>
                <div><label className="text-sm font-bold block mb-1">تاریخ خروج</label><div className="flex gap-2"><select className="border rounded-xl p-2 bg-white flex-1" value={shamsiDate.day} onChange={e => setShamsiDate({...shamsiDate, day: Number(e.target.value)})}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select><select className="border rounded-xl p-2 bg-white flex-1" value={shamsiDate.month} onChange={e => setShamsiDate({...shamsiDate, month: Number(e.target.value)})}>{months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}</select><select className="border rounded-xl p-2 bg-white flex-1" value={shamsiDate.year} onChange={e => setShamsiDate({...shamsiDate, year: Number(e.target.value)})}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div></div>
            </div>

            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-4">
                <h3 className="font-bold text-orange-800 text-sm flex items-center gap-2"><Package size={18}/> مشخصات محموله</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold block mb-1">نام کالا / محصول</label><input className="w-full border rounded-lg p-2 text-sm" value={formData.goodsName} onChange={e => setFormData({...formData, goodsName: e.target.value})} required /></div>
                    <div><label className="text-xs font-bold block mb-1">گیرنده کالا</label><input className="w-full border rounded-lg p-2 text-sm" value={formData.recipientName} onChange={e => setFormData({...formData, recipientName: e.target.value})} required /></div>
                    <div><label className="text-xs font-bold block mb-1">تعداد کارتن/بسته</label><input type="number" className="w-full border rounded-lg p-2 text-sm dir-ltr" value={formData.cartonCount} onChange={e => setFormData({...formData, cartonCount: e.target.value})} /></div>
                    <div><label className="text-xs font-bold block mb-1">وزن تقریبی (کیلوگرم)</label><input type="number" className="w-full border rounded-lg p-2 text-sm dir-ltr" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} /></div>
                </div>
                <div><label className="text-xs font-bold block mb-1 flex items-center gap-1"><MapPin size={14}/> آدرس مقصد</label><input className="w-full border rounded-lg p-2 text-sm" value={formData.destinationAddress} onChange={e => setFormData({...formData, destinationAddress: e.target.value})} required /></div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <h3 className="font-bold text-gray-700 text-sm flex items-center gap-2"><Truck size={18}/> اطلاعات راننده (اختیاری)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold block mb-1">نام راننده</label><input className="w-full border rounded-lg p-2 text-sm" value={formData.driverName} onChange={e => setFormData({...formData, driverName: e.target.value})} /></div>
                    <div><label className="text-xs font-bold block mb-1">شماره پلاک</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" placeholder="12 A 345 67" value={formData.plateNumber} onChange={e => setFormData({...formData, plateNumber: e.target.value})} /></div>
                </div>
                <div><label className="text-xs font-bold block mb-1">توضیحات تکمیلی</label><textarea className="w-full border rounded-lg p-2 text-sm h-20" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all">{isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}ثبت نهایی درخواست خروج</button>
        </form>
    </div>
  );
};

export default CreateExitPermit;
