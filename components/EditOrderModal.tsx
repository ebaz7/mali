
import React, { useState, useEffect } from 'react';
import { PaymentMethod, PaymentOrder, PaymentDetail, SystemSettings } from '../types';
import { editOrder, uploadFile, getSettings, saveSettings } from '../services/storageService';
import { enhanceDescription } from '../services/geminiService';
import { jalaliToGregorian, getShamsiDateFromIso, formatCurrency, generateUUID, normalizeInputNumber, formatNumberString, deformatNumberString } from '../constants';
import { Wand2, Save, Loader2, X, Calendar, Plus, Trash2, Paperclip, Hash } from 'lucide-react';

interface EditOrderModalProps {
  order: PaymentOrder;
  onClose: () => void;
  onSave: () => void;
}

const MONTHS = [ 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند' ];

const EditOrderModal: React.FC<EditOrderModalProps> = ({ order, onClose, onSave }) => {
  const initialShamsi = getShamsiDateFromIso(order.date);
  const [shamsiDate, setShamsiDate] = useState({ year: initialShamsi.year, month: initialShamsi.month, day: initialShamsi.day });
  const [formData, setFormData] = useState({ payee: order.payee, totalAmount: order.totalAmount.toString(), description: order.description, trackingNumber: order.trackingNumber.toString() });
  const [payingCompany, setPayingCompany] = useState(order.payingCompany || '');
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentDetail[]>(order.paymentDetails || []);
  const [attachments, setAttachments] = useState<{ fileName: string, data: string }[]>(order.attachments || []);
  const [newLine, setNewLine] = useState<{ method: PaymentMethod; amount: string; chequeNumber: string; bankName: string; }>({ method: PaymentMethod.TRANSFER, amount: '', chequeNumber: '', bankName: '' });
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { 
      getSettings().then((settings: SystemSettings) => { 
          setAvailableCompanies(settings.companyNames || []); 
          setAvailableBanks(settings.bankNames || []); 
      }); 
  }, []);

  const getIsoDate = () => { try { const date = jalaliToGregorian(shamsiDate.year, shamsiDate.month, shamsiDate.day); const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; } catch (e) { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; } };
  const handleEnhance = async () => { if (!formData.description) return; setIsEnhancing(true); const improved = await enhanceDescription(formData.description); setFormData(prev => ({ ...prev, description: improved })); setIsEnhancing(false); };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 150 * 1024 * 1024) { alert("حجم فایل بالا"); return; } setUploading(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setAttachments([...attachments, { fileName: result.fileName, data: result.url }]); } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploading(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
  const removeAttachment = (index: number) => { setAttachments(attachments.filter((_, i) => i !== index)); };
  const addPaymentLine = () => { const amt = deformatNumberString(newLine.amount); if (!amt || amt <= 0) return; const detail: PaymentDetail = { id: generateUUID(), method: newLine.method, amount: amt, chequeNumber: newLine.method === PaymentMethod.CHEQUE ? normalizeInputNumber(newLine.chequeNumber) : undefined, bankName: (newLine.method === PaymentMethod.TRANSFER || newLine.method === PaymentMethod.CHEQUE) ? newLine.bankName : undefined }; setPaymentLines([...paymentLines, detail]); setNewLine({ method: PaymentMethod.TRANSFER, amount: '', chequeNumber: '', bankName: '' }); };
  const removePaymentLine = (id: string) => { setPaymentLines(paymentLines.filter(p => p.id !== id)); };
  const sumPaymentLines = paymentLines.reduce((acc, curr) => acc + curr.amount, 0);
  const totalRequired = deformatNumberString(formData.totalAmount) || 0;
  const remaining = totalRequired - sumPaymentLines;

  const handleAddBank = async () => {
      const newBank = window.prompt("نام بانک جدید را وارد کنید:");
      if (!newBank || !newBank.trim()) return;
      try {
          const currentSettings = await getSettings();
          const updatedBanks = [...(currentSettings.bankNames || []), newBank.trim()];
          const uniqueBanks = Array.from(new Set(updatedBanks));
          await saveSettings({ ...currentSettings, bankNames: uniqueBanks });
          setAvailableBanks(uniqueBanks);
          setNewLine(prev => ({ ...prev, bankName: newBank.trim() }));
      } catch (e) {
          alert("خطا در ذخیره بانک جدید");
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentLines.length === 0) { alert("لطفا حداقل یک روش پرداخت اضافه کنید."); return; }
    if (sumPaymentLines !== totalRequired) { alert("جمع اقلام پرداخت با مبلغ کل سفارش برابر نیست!"); return; }
    if (!formData.trackingNumber) { alert("شماره دستور پرداخت الزامی است."); return; }
    
    setIsSubmitting(true);
    const updatedOrder: PaymentOrder = { ...order, trackingNumber: Number(formData.trackingNumber), date: getIsoDate(), payee: formData.payee, totalAmount: totalRequired, description: formData.description, paymentDetails: paymentLines, attachments: attachments, payingCompany: payingCompany };
    try { await editOrder(updatedOrder); onSave(); onClose(); } catch (error) { alert("خطا در ذخیره تغییرات"); } finally { setIsSubmitting(false); }
  };

  const years = Array.from({ length: 11 }, (_, i) => 1400 + i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10"><div className="flex items-center gap-3"><div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Save size={20} /></div><h2 className="text-xl font-bold text-gray-800">ویرایش دستور پرداخت</h2></div><button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors"><X size={24} /></button></div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Hash size={16}/> شماره دستور پرداخت</label><input required type="number" className="w-full border rounded-xl px-4 py-3 bg-white font-mono font-bold text-blue-600 dir-ltr text-left" value={formData.trackingNumber} onChange={e => setFormData({ ...formData, trackingNumber: e.target.value })} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700">گیرنده وجه</label><input required type="text" className="w-full border rounded-xl px-4 py-3 bg-gray-50" value={formData.payee} onChange={e => setFormData({ ...formData, payee: e.target.value })} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700">مبلغ کل (ریال)</label><input required type="text" inputMode="numeric" className="w-full border rounded-xl px-4 py-3 bg-gray-50 text-left dir-ltr font-mono" value={formatNumberString(formData.totalAmount)} onChange={e => setFormData({ ...formData, totalAmount: normalizeInputNumber(e.target.value).replace(/[^0-9]/g, '') })} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700">شرکت پرداخت کننده</label><select className="w-full border rounded-xl px-4 py-3 bg-gray-50" value={payingCompany} onChange={e => setPayingCompany(e.target.value)}><option value="">-- انتخاب کنید --</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Calendar size={16} />تاریخ پرداخت (شمسی)</label><div className="grid grid-cols-3 gap-2"><select className="border rounded-xl px-2 py-3 bg-white" value={shamsiDate.day} onChange={e => setShamsiDate({...shamsiDate, day: Number(e.target.value)})}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select><select className="border rounded-xl px-2 py-3 bg-white" value={shamsiDate.month} onChange={e => setShamsiDate({...shamsiDate, month: Number(e.target.value)})}>{MONTHS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}</select><select className="border rounded-xl px-2 py-3 bg-white" value={shamsiDate.year} onChange={e => setShamsiDate({...shamsiDate, year: Number(e.target.value)})}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div></div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <h3 className="font-bold text-gray-700 mb-3 flex justify-between"><span>جزئیات پرداخت</span><span className={`text-sm ${remaining === 0 ? 'text-green-600' : 'text-red-500'}`}>باقیمانده: {formatCurrency(remaining)}</span></h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4 border-b border-gray-200 pb-4">
                        <div className="space-y-1"><label className="text-xs text-gray-500">نوع</label><select className="w-full border rounded-lg p-2 text-sm" value={newLine.method} onChange={e => setNewLine({ ...newLine, method: e.target.value as PaymentMethod })}>{Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                        <div className="space-y-1"><label className="text-xs text-gray-500">مبلغ</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm dir-ltr text-left" placeholder="0" value={formatNumberString(newLine.amount)} onChange={e => setNewLine({ ...newLine, amount: normalizeInputNumber(e.target.value).replace(/[^0-9]/g, '') })}/></div>
                        {(newLine.method === PaymentMethod.CHEQUE || newLine.method === PaymentMethod.TRANSFER) ? (<>{newLine.method === PaymentMethod.CHEQUE && <div className="space-y-1"><label className="text-xs text-gray-500">شماره چک</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm" value={newLine.chequeNumber} onChange={e => setNewLine({ ...newLine, chequeNumber: normalizeInputNumber(e.target.value).replace(/[^0-9]/g, '') })}/></div>}<div className="space-y-1"><label className="text-xs text-gray-500">نام بانک</label><div className="flex gap-1"><select className="w-full border rounded-lg p-2 text-sm" value={newLine.bankName} onChange={e => setNewLine({ ...newLine, bankName: e.target.value })}><option value="">-- انتخاب بانک --</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select><button type="button" onClick={handleAddBank} className="bg-blue-100 text-blue-600 px-2 rounded-lg hover:bg-blue-200" title="افزودن بانک جدید"><Plus size={16}/></button></div></div></>) : <div className="md:block hidden"></div>}
                        <button type="button" onClick={addPaymentLine} disabled={!newLine.amount} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1 text-sm"><Plus size={16} /> افزودن</button>
                    </div>
                    <div className="space-y-2">{paymentLines.map((line) => (<div key={line.id} className="flex items-center justify-between bg-white p-3 rounded border border-gray-100 shadow-sm"><div className="flex gap-3 text-sm"><span className="font-bold text-gray-800">{line.method}</span><span className="text-gray-600">{formatCurrency(line.amount)}</span>{line.chequeNumber && <span className="text-gray-500 text-xs bg-yellow-50 px-2 py-0.5 rounded">چک: {line.chequeNumber}</span>}{line.bankName && <span className="text-blue-500 text-xs bg-blue-50 px-2 py-0.5 rounded">{line.bankName}</span>}</div><button type="button" onClick={() => removePaymentLine(line.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button></div>))}</div>
                </div>
                 <div className="bg-gray-50 p-4 rounded-xl border border-gray-200"><label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2"><Paperclip size={16} />مدیریت ضمیمه‌ها</label><div className="flex items-center gap-4"><input type="file" id="attachment-edit" className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} /><label htmlFor="attachment-edit" className={`bg-white border text-gray-700 px-4 py-2 rounded-lg cursor-pointer hover:bg-gray-100 text-sm ${uploading ? 'opacity-50 cursor-wait' : ''}`}>{uploading ? 'در حال آپلود...' : 'افزودن فایل جدید'}</label></div>{attachments.length > 0 && <div className="mt-3 space-y-2">{attachments.map((file, idx) => (<div key={idx} className="flex items-center justify-between bg-white p-2 rounded border border-gray-200 text-sm"><span className="text-blue-600 truncate max-w-[200px]">{file.fileName}</span><button type="button" onClick={() => removeAttachment(idx)} className="text-red-500 hover:text-red-700"><X size={16} /></button></div>))}</div>}</div>
                <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-sm font-medium text-gray-700">شرح پرداخت</label><button type="button" onClick={handleEnhance} disabled={isEnhancing || !formData.description} className="text-xs flex items-center gap-1.5 text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg disabled:opacity-50">{isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}هوش مصنوعی</button></div><textarea required rows={4} className="w-full border rounded-xl px-4 py-3 bg-gray-50 resize-none" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} /></div>
                <div className="pt-4 flex justify-end gap-3 border-t"><button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl border text-gray-700 hover:bg-gray-50 font-medium">انصراف</button><button type="submit" disabled={isSubmitting || remaining !== 0 || uploading} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl font-medium shadow-lg flex items-center gap-2 disabled:opacity-70">{isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}ذخیره تغییرات</button></div>
            </form>
        </div>
    </div>
  );
};
export default EditOrderModal;
