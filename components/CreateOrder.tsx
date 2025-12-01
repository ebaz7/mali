
import React, { useState, useEffect } from 'react';
import { PaymentMethod, OrderStatus, PaymentOrder, User, PaymentDetail, SystemSettings } from '../types';
import { saveOrder, getNextTrackingNumber, uploadFile, getSettings } from '../services/storageService';
import { enhanceDescription } from '../services/geminiService';
import { jalaliToGregorian, getCurrentShamsiDate, formatCurrency, generateUUID, normalizeInputNumber, formatNumberString, deformatNumberString } from '../constants';
import { Wand2, Save, Loader2, CheckCircle2, Calendar, Plus, Trash2, Paperclip, X } from 'lucide-react';

interface CreateOrderProps {
  onSuccess: () => void;
  currentUser: User;
}

const MONTHS = [ 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند' ];

const CreateOrder: React.FC<CreateOrderProps> = ({ onSuccess, currentUser }) => {
  const currentShamsi = getCurrentShamsiDate();
  const [shamsiDate, setShamsiDate] = useState({ year: currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day });
  const [formData, setFormData] = useState({ payee: '', description: '', });
  const [payingCompany, setPayingCompany] = useState('');
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentDetail[]>([]);
  const [newLine, setNewLine] = useState<{ method: PaymentMethod; amount: string; chequeNumber: string; bankName: string; }>({ method: PaymentMethod.TRANSFER, amount: '', chequeNumber: '', bankName: '' });
  const [attachments, setAttachments] = useState<{ fileName: string, data: string }[]>([]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
      getSettings().then((settings: SystemSettings) => {
          setAvailableCompanies(settings.companyNames || []);
          setPayingCompany(settings.defaultCompany || '');
          setAvailableBanks(settings.bankNames || []);
      });
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        const form = e.currentTarget.form; 
        if (!form) return; 
        const index = Array.prototype.indexOf.call(form, e.currentTarget); 
        const nextElement = form.elements[index + 1] as HTMLElement; 
        if (nextElement) nextElement.focus(); 
    }
  };

  const getIsoDate = () => {
    try { const date = jalaliToGregorian(shamsiDate.year, shamsiDate.month, shamsiDate.day); const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; } catch (e) { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
  };

  const handleEnhance = async () => { if (!formData.description) return; setIsEnhancing(true); const improved = await enhanceDescription(formData.description); setFormData(prev => ({ ...prev, description: improved })); setIsEnhancing(false); };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 150 * 1024 * 1024) { alert("حجم فایل نباید بیشتر از 150 مگابایت باشد."); return; } setUploading(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setAttachments([...attachments, { fileName: result.fileName, data: result.url }]); } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploading(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
  const removeAttachment = (index: number) => { setAttachments(attachments.filter((_, i) => i !== index)); };
  const addPaymentLine = () => { const amt = deformatNumberString(newLine.amount); if (!amt || amt <= 0) return; const detail: PaymentDetail = { id: generateUUID(), method: newLine.method, amount: amt, chequeNumber: newLine.method === PaymentMethod.CHEQUE ? normalizeInputNumber(newLine.chequeNumber) : undefined, bankName: (newLine.method === PaymentMethod.TRANSFER || newLine.method === PaymentMethod.CHEQUE) ? newLine.bankName : undefined }; setPaymentLines([...paymentLines, detail]); setNewLine({ method: PaymentMethod.TRANSFER, amount: '', chequeNumber: '', bankName: '' }); };
  const removePaymentLine = (id: string) => { setPaymentLines(paymentLines.filter(p => p.id !== id)); };
  const sumPaymentLines = paymentLines.reduce((acc, curr) => acc + curr.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentLines.length === 0) { alert("لطفا حداقل یک روش پرداخت اضافه کنید."); return; }
    setIsSubmitting(true);
    try { const nextTrackingNumber = await getNextTrackingNumber(); const newOrder: PaymentOrder = { id: generateUUID(), trackingNumber: nextTrackingNumber, date: getIsoDate(), payee: formData.payee, totalAmount: sumPaymentLines, description: formData.description, status: OrderStatus.PENDING, requester: currentUser.fullName, createdAt: Date.now(), paymentDetails: paymentLines, attachments: attachments, payingCompany: payingCompany }; await saveOrder(newOrder); onSuccess(); } catch (error) { alert('خطا در ثبت سفارش'); } finally { setIsSubmitting(false); }
  };

  const years = Array.from({ length: 11 }, (_, i) => 1400 + i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-4 mb-8 border-b pb-4"><div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600"><Save size={24} /></div><div><h2 className="text-2xl font-bold text-gray-800">ثبت دستور پرداخت جدید</h2><p className="text-gray-500 text-sm mt-1">اطلاعات گیرنده و روش‌های پرداخت را وارد نمایید</p></div></div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2"><label className="text-sm font-medium text-gray-700">گیرنده وجه (شخص/شرکت)</label><input required type="text" onKeyDown={handleKeyDown} className="w-full border rounded-xl px-4 py-3 bg-gray-50" value={formData.payee} onChange={e => setFormData({ ...formData, payee: e.target.value })} /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-gray-700">مبلغ کل (محاسبه خودکار)</label><input readOnly disabled type="text" className="w-full border rounded-xl px-4 py-3 bg-gray-100 text-gray-600 text-left dir-ltr font-mono font-bold" value={formatCurrency(sumPaymentLines)} /></div>
          <div className="space-y-2"><label className="text-sm font-medium text-gray-700">شرکت پرداخت کننده</label><select className="w-full border rounded-xl px-4 py-3 bg-gray-50" value={payingCompany} onChange={e => setPayingCompany(e.target.value)} onKeyDown={handleKeyDown}><option value="">-- انتخاب کنید --</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="space-y-2"><label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Calendar size={16} />تاریخ پرداخت (شمسی)</label><div className="grid grid-cols-3 gap-2"><select className="border rounded-xl px-2 py-3 bg-white" value={shamsiDate.day} onChange={e => setShamsiDate({...shamsiDate, day: Number(e.target.value)})} onKeyDown={handleKeyDown}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select><select className="border rounded-xl px-2 py-3 bg-white" value={shamsiDate.month} onChange={e => setShamsiDate({...shamsiDate, month: Number(e.target.value)})} onKeyDown={handleKeyDown}>{MONTHS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}</select><select className="border rounded-xl px-2 py-3 bg-white" value={shamsiDate.year} onChange={e => setShamsiDate({...shamsiDate, year: Number(e.target.value)})} onKeyDown={handleKeyDown}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div></div>
        </div>
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <h3 className="font-bold text-gray-700 mb-3 flex justify-between"><span>جزئیات پرداخت (چندگانه)</span></h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4 border-b border-gray-200 pb-4">
                <div className="space-y-1"><label className="text-xs text-gray-500">نوع</label><select className="w-full border rounded-lg p-2 text-sm" value={newLine.method} onChange={e => setNewLine({ ...newLine, method: e.target.value as PaymentMethod })} onKeyDown={handleKeyDown}>{Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                <div className="space-y-1"><label className="text-xs text-gray-500">مبلغ (ریال)</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm dir-ltr text-left" placeholder="0" value={formatNumberString(newLine.amount)} onChange={e => setNewLine({ ...newLine, amount: normalizeInputNumber(e.target.value).replace(/[^0-9]/g, '') })} onKeyDown={handleKeyDown}/></div>
                {(newLine.method === PaymentMethod.CHEQUE || newLine.method === PaymentMethod.TRANSFER) ? (<>{newLine.method === PaymentMethod.CHEQUE && <div className="space-y-1"><label className="text-xs text-gray-500">شماره چک</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm" value={newLine.chequeNumber} onChange={e => setNewLine({ ...newLine, chequeNumber: normalizeInputNumber(e.target.value).replace(/[^0-9]/g, '') })} onKeyDown={handleKeyDown}/></div>}<div className="space-y-1"><label className="text-xs text-gray-500">نام بانک</label><select className="w-full border rounded-lg p-2 text-sm" value={newLine.bankName} onChange={e => setNewLine({ ...newLine, bankName: e.target.value })} onKeyDown={handleKeyDown}><option value="">-- انتخاب بانک --</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div></>) : <div className="md:block hidden"></div>}
                <button type="button" onClick={addPaymentLine} disabled={!newLine.amount} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1 text-sm"><Plus size={16} /> افزودن</button>
            </div>
            <div className="space-y-2">{paymentLines.map((line) => (<div key={line.id} className="flex items-center justify-between bg-white p-3 rounded border border-gray-100 shadow-sm"><div className="flex gap-3 text-sm"><span className="font-bold text-gray-800">{line.method}</span><span className="text-gray-600 dir-ltr">{formatCurrency(line.amount)}</span>{line.chequeNumber && <span className="text-gray-500 text-xs bg-yellow-50 px-2 py-0.5 rounded">چک: {line.chequeNumber}</span>}{line.bankName && <span className="text-blue-500 text-xs bg-blue-50 px-2 py-0.5 rounded">{line.bankName}</span>}</div><button type="button" onClick={() => removePaymentLine(line.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button></div>))}</div>
        </div>
        <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-sm font-medium text-gray-700">شرح پرداخت</label><button type="button" onClick={handleEnhance} disabled={isEnhancing || !formData.description} className="text-xs flex items-center gap-1.5 text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg disabled:opacity-50">{isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}هوش مصنوعی</button></div><textarea required rows={4} className="w-full border rounded-xl px-4 py-3 bg-gray-50 resize-none" placeholder="توضیحات..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} /></div>
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200"><label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2"><Paperclip size={16} />فایل‌های ضمیمه</label><div className="flex items-center gap-4"><input type="file" id="attachment" className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} /><label htmlFor="attachment" className={`bg-white border text-gray-700 px-4 py-2 rounded-lg cursor-pointer hover:bg-gray-100 text-sm ${uploading ? 'opacity-50 cursor-wait' : ''}`}>{uploading ? 'در حال آپلود...' : 'انتخاب فایل'}</label></div>{attachments.length > 0 && <div className="mt-3 space-y-2">{attachments.map((file, idx) => (<div key={idx} className="flex items-center justify-between bg-white p-2 rounded border text-sm"><span className="text-blue-600 truncate max-w-[200px]">{file.fileName}</span><button type="button" onClick={() => removeAttachment(idx)} className="text-red-500"><X size={16} /></button></div>))}</div>}</div>
        <div className="pt-4 flex justify-end"><button type="submit" disabled={isSubmitting || paymentLines.length === 0 || uploading} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 w-full md:w-auto">{isSubmitting ? <><Loader2 size={20} className="animate-spin" />در حال ثبت...</> : <><CheckCircle2 size={20} />ثبت نهایی</>}</button></div>
      </form>
    </div>
  );
};
export default CreateOrder;
