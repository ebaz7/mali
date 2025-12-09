
import React, { useState, useEffect } from 'react';
import { PaymentMethod, OrderStatus, PaymentOrder, PaymentDetail, SystemSettings, UserRole } from '../types';
import { saveOrder, getNextTrackingNumber, uploadFile, getSettings, saveSettings } from '../services/storageService';
import { enhanceDescription } from '../services/geminiService';
import { apiCall } from '../services/apiService';
import { jalaliToGregorian, getCurrentShamsiDate, formatCurrency, generateUUID, normalizeInputNumber, formatNumberString, deformatNumberString, formatDate } from '../constants';
import { Wand2, Save, Loader2, Plus, Trash2, Paperclip, X, Hash, UploadCloud, Building2, BrainCircuit, AlertTriangle, Calendar } from 'lucide-react';
import PrintVoucher from './PrintVoucher';
import { getUsers } from '../services/authService';

interface CreateOrderProps {
  onSuccess: () => void;
  currentUser: any;
}

const MONTHS = [ 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند' ];

const CreateOrder: React.FC<CreateOrderProps> = ({ onSuccess, currentUser }) => {
  const currentShamsi = getCurrentShamsiDate();
  const [shamsiDate, setShamsiDate] = useState({ year: currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day });
  const [formData, setFormData] = useState({ payee: '', description: '', });
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [payingCompany, setPayingCompany] = useState('');
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);
  const [paymentLines, setPaymentLines] = useState<PaymentDetail[]>([]);
  const [newLine, setNewLine] = useState<{ method: PaymentMethod; amount: string; chequeNumber: string; bankName: string; description: string; chequeDate: {y:number, m:number, d:number} }>({ 
      method: PaymentMethod.TRANSFER, 
      amount: '', 
      chequeNumber: '', 
      bankName: '', 
      description: '',
      chequeDate: { year: currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day } as any
  });
  const [attachments, setAttachments] = useState<{ fileName: string, data: string }[]>([]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{score: number, recommendation: string, reasons: string[]} | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Auto Send Logic
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [createdOrderForAutoSend, setCreatedOrderForAutoSend] = useState<PaymentOrder | null>(null);

  useEffect(() => {
      getSettings().then((s) => {
          setSettings(s);
          const names = s.companies?.map(c => c.name) || s.companyNames || [];
          setAvailableCompanies(names);
          setPayingCompany(s.defaultCompany || '');
          setAvailableBanks(s.bankNames || []);
      });
      getNextTrackingNumber().then(num => setTrackingNumber(num.toString()));
  }, []);

  // ... (Keep existing helpers like getIsoDate, handleEnhance, handleFileChange, addPaymentLine, handleAnalyzePayment etc.) ...
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const form = e.currentTarget.form; if (!form) return; const index = Array.prototype.indexOf.call(form, e.currentTarget); const nextElement = form.elements[index + 1] as HTMLElement; if (nextElement) nextElement.focus(); } };
  const getIsoDate = () => { try { const date = jalaliToGregorian(shamsiDate.year, shamsiDate.month, shamsiDate.day); const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; } catch (e) { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; } };
  const handleAddBank = async () => { const newBank = window.prompt("نام بانک جدید:"); if (!newBank?.trim()) return; const s = await getSettings(); const updated = [...(s.bankNames || []), newBank.trim()]; await saveSettings({ ...s, bankNames: updated }); setAvailableBanks(updated); setNewLine(p => ({ ...p, bankName: newBank.trim() })); };
  const handleEnhance = async () => { if (!formData.description) return; setIsEnhancing(true); const improved = await enhanceDescription(formData.description); setFormData(p => ({ ...p, description: improved })); setIsEnhancing(false); };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); const reader = new FileReader(); reader.onload = async (ev) => { try { const result = await uploadFile(file.name, ev.target?.result as string); setAttachments([...attachments, { fileName: result.fileName, data: result.url }]); } catch (e) { alert('خطا در آپلود'); } finally { setUploading(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
  const removeAttachment = (index: number) => { setAttachments(attachments.filter((_, i) => i !== index)); };
  const addPaymentLine = () => { const amt = deformatNumberString(newLine.amount); if (!amt) return; const detail: PaymentDetail = { id: generateUUID(), method: newLine.method, amount: amt, chequeNumber: newLine.method === PaymentMethod.CHEQUE ? normalizeInputNumber(newLine.chequeNumber) : undefined, bankName: (newLine.method === PaymentMethod.TRANSFER || newLine.method === PaymentMethod.CHEQUE) ? newLine.bankName : undefined, description: newLine.description, chequeDate: newLine.method === PaymentMethod.CHEQUE ? `${newLine.chequeDate.y}/${newLine.chequeDate.m}/${newLine.chequeDate.d}` : undefined }; setPaymentLines([...paymentLines, detail]); if(newLine.description) setFormData(p => ({...p, description: p.description ? `${p.description} - ${newLine.description}` : newLine.description})); setNewLine({ method: PaymentMethod.TRANSFER, amount: '', chequeNumber: '', bankName: '', description: '', chequeDate: { year: currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day } as any }); };
  const removePaymentLine = (id: string) => { setPaymentLines(paymentLines.filter(p => p.id !== id)); };
  const sumPaymentLines = paymentLines.reduce((acc, curr) => acc + curr.amount, 0);
  const handleAnalyzePayment = async () => { setAnalyzing(true); try { const result = await apiCall<any>('/analyze-payment', 'POST', { amount: sumPaymentLines, date: getIsoDate(), company: payingCompany, description: formData.description || 'توضیحات وارد نشده' }); setAnalysisResult(result); } catch (e) { alert("خطا"); } finally { setAnalyzing(false); } };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentLines.length === 0) { alert("لطفا حداقل یک روش پرداخت اضافه کنید."); return; }
    if (!trackingNumber) { alert("شماره دستور پرداخت الزامی است."); return; }
    
    setIsSubmitting(true);
    try { 
        const newOrder: PaymentOrder = { id: generateUUID(), trackingNumber: Number(trackingNumber), date: getIsoDate(), payee: formData.payee, totalAmount: sumPaymentLines, description: formData.description, status: OrderStatus.PENDING, requester: currentUser.fullName, createdAt: Date.now(), paymentDetails: paymentLines, attachments: attachments, payingCompany: payingCompany };
        await saveOrder(newOrder); 
        
        // --- AUTO SEND TO FINANCIAL MANAGER ---
        setCreatedOrderForAutoSend(newOrder); // This triggers the hidden renderer
        
        // Wait for render, then capture and send
        setTimeout(async () => {
            const element = document.getElementById(`print-voucher-${newOrder.id}`);
            if (element) {
                try {
                    // Find Financial Manager
                    const users = await getUsers();
                    const finUser = users.find(u => u.role === UserRole.FINANCIAL && u.phoneNumber);
                    if (finUser) {
                        // @ts-ignore
                        const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
                        const base64 = canvas.toDataURL('image/png').split(',')[1];
                        
                        let caption = `📢 *درخواست پرداخت جدید*\n`;
                        caption += `شماره: ${newOrder.trackingNumber}\n`;
                        caption += `مبلغ: ${formatCurrency(newOrder.totalAmount)}\n`;
                        caption += `درخواست کننده: ${newOrder.requester}\n\n`;
                        caption += `لطفا بررسی نمایید.`;

                        await apiCall('/send-whatsapp', 'POST', { 
                            number: finUser.phoneNumber, 
                            message: caption, 
                            mediaData: { data: base64, mimeType: 'image/png', filename: `Order_${newOrder.trackingNumber}.png` } 
                        });
                        console.log("Auto sent to Financial Manager");
                    }
                } catch (err) {
                    console.error("Auto send failed", err);
                }
            }
            onSuccess();
        }, 1000);

    } catch (error) { 
        alert("خطا در ثبت دستور پرداخت"); 
        setIsSubmitting(false);
    }
  };

  const years = Array.from({ length: 11 }, (_, i) => 1400 + i);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in relative">
        {/* Hidden Render Area for Auto-Send */}
        {createdOrderForAutoSend && (
            <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
                <PrintVoucher order={createdOrderForAutoSend} embed settings={settings || undefined} />
            </div>
        )}

        <div className="p-6 border-b border-gray-100 flex items-center gap-3"><div className="bg-green-50 p-2 rounded-lg text-green-600"><Plus size={24} /></div><h2 className="text-xl font-bold text-gray-800">ثبت دستور پرداخت جدید</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Hash size={16}/> شماره دستور پرداخت</label><input required type="number" className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-gray-50 font-mono font-bold text-blue-600 dir-ltr text-left" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} onKeyDown={handleKeyDown} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700">گیرنده وجه (ذینفع)</label><input required type="text" className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="نام شخص یا شرکت..." value={formData.payee} onChange={e => setFormData({ ...formData, payee: e.target.value })} onKeyDown={handleKeyDown} /></div>
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Building2 size={16}/> شرکت پرداخت کننده</label><select className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white" value={payingCompany} onChange={e => setPayingCompany(e.target.value)} onKeyDown={handleKeyDown}><option value="">-- انتخاب کنید --</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="space-y-2"><label className="text-sm font-medium text-gray-700 flex items-center gap-2"><Calendar size={16} />تاریخ پرداخت (شمسی)</label><div className="grid grid-cols-3 gap-2"><select className="border border-gray-300 rounded-xl px-2 py-3 bg-white" value={shamsiDate.day} onChange={e => setShamsiDate({...shamsiDate, day: Number(e.target.value)})}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select><select className="border border-gray-300 rounded-xl px-2 py-3 bg-white" value={shamsiDate.month} onChange={e => setShamsiDate({...shamsiDate, month: Number(e.target.value)})}>{MONTHS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}</select><select className="border border-gray-300 rounded-xl px-2 py-3 bg-white" value={shamsiDate.year} onChange={e => setShamsiDate({...shamsiDate, year: Number(e.target.value)})}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div></div>
            </div>
            
            <div className="space-y-2"><div className="flex justify-between items-center"><label className="text-sm font-bold text-gray-700">شرح پرداخت</label><button type="button" onClick={handleEnhance} disabled={isEnhancing || !formData.description} className="text-xs flex items-center gap-1.5 text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">{isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}بهبود متن با هوش مصنوعی</button></div><textarea required rows={4} className="w-full border border-gray-300 rounded-xl px-4 py-3 resize-none" placeholder="توضیحات کامل دستور پرداخت..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} onKeyDown={handleKeyDown} /></div>

            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200 relative overflow-hidden">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h3 className="font-bold text-gray-700">روش‌های پرداخت</h3>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={handleAnalyzePayment} disabled={analyzing || sumPaymentLines === 0} className="flex items-center gap-1.5 text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-200 transition-colors disabled:opacity-50">
                            {analyzing ? <Loader2 size={14} className="animate-spin"/> : <BrainCircuit size={14}/>} تحلیل هوشمند
                        </button>
                        <div className="text-sm text-gray-500 bg-white px-3 py-1 rounded-lg border">جمع کل: <span className="font-bold text-blue-600 font-mono">{formatCurrency(sumPaymentLines)}</span></div>
                    </div>
                </div>

                {analysisResult && (
                    <div className={`mb-4 p-3 rounded-xl border flex items-start gap-3 animate-fade-in ${analysisResult.score >= 80 ? 'bg-green-50 border-green-200 text-green-800' : analysisResult.score >= 50 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                        {analysisResult.score >= 50 ? <BrainCircuit className="shrink-0 mt-0.5" size={20}/> : <AlertTriangle className="shrink-0 mt-0.5" size={20}/>}
                        <div className="flex-1">
                            <div className="font-bold text-sm flex items-center gap-2 flex-wrap">پیشنهاد هوشمند: {analysisResult.recommendation} <span className="text-[10px] px-2 py-0.5 bg-white/50 rounded-full border border-black/5">امتیاز: {analysisResult.score}/100</span></div>
                            <ul className="list-disc list-inside mt-1 text-xs opacity-90 space-y-0.5">{analysisResult.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                        </div>
                        <button type="button" onClick={() => setAnalysisResult(null)} className="mr-auto opacity-50 hover:opacity-100 p-1"><X size={16}/></button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="md:col-span-2 space-y-1"><label className="text-xs text-gray-500">نوع</label><select className="w-full border rounded-lg p-2 text-sm bg-white" value={newLine.method} onChange={e => setNewLine({ ...newLine, method: e.target.value as PaymentMethod })}>{Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}</select></div>
                    <div className="md:col-span-3 space-y-1"><label className="text-xs text-gray-500">مبلغ (ریال)</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm dir-ltr text-left font-mono font-bold" placeholder="0" value={formatNumberString(newLine.amount)} onChange={e => setNewLine({ ...newLine, amount: normalizeInputNumber(e.target.value).replace(/[^0-9]/g, '') })} onKeyDown={handleKeyDown}/></div>
                    {(newLine.method === PaymentMethod.CHEQUE || newLine.method === PaymentMethod.TRANSFER) ? (<>{newLine.method === PaymentMethod.CHEQUE && <div className="md:col-span-2 space-y-1"><label className="text-xs text-gray-500">شماره چک</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm font-mono" value={newLine.chequeNumber} onChange={e => setNewLine({ ...newLine, chequeNumber: normalizeInputNumber(e.target.value).replace(/[^0-9]/g, '') })} onKeyDown={handleKeyDown}/></div>}<div className="md:col-span-2 space-y-1"><label className="text-xs text-gray-500">نام بانک</label><div className="flex gap-1"><select className="w-full border rounded-lg p-2 text-sm bg-white" value={newLine.bankName} onChange={e => setNewLine({ ...newLine, bankName: e.target.value })}><option value="">-- انتخاب --</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select><button type="button" onClick={handleAddBank} className="bg-blue-100 text-blue-600 px-2 rounded-lg hover:bg-blue-200" title="افزودن بانک"><Plus size={16}/></button></div></div></>) : <div className="md:col-span-4 hidden md:block"></div>}
                    <div className="md:col-span-2 space-y-1"><label className="text-xs text-gray-500">شرح (اختیاری)</label><input type="text" className="w-full border rounded-lg p-2 text-sm" placeholder="..." value={newLine.description} onChange={e => setNewLine({ ...newLine, description: e.target.value })} onKeyDown={handleKeyDown}/></div>
                    {newLine.method === PaymentMethod.CHEQUE && (<div className="md:col-span-12 bg-yellow-50 p-2 rounded-lg border border-yellow-200 mt-1 flex items-center gap-4"><label className="text-xs font-bold text-gray-700 flex items-center gap-1 min-w-fit"><Calendar size={14}/> تاریخ سررسید چک:</label><div className="flex gap-2 flex-1"><select className="border rounded px-2 py-1 text-sm bg-white flex-1" value={newLine.chequeDate.d} onChange={e => setNewLine({...newLine, chequeDate: {...newLine.chequeDate, d: Number(e.target.value)}})}>{days.map(d => <option key={d} value={d}>{d}</option>)}</select><select className="border rounded px-2 py-1 text-sm bg-white flex-1" value={newLine.chequeDate.m} onChange={e => setNewLine({...newLine, chequeDate: {...newLine.chequeDate, m: Number(e.target.value)}})}>{MONTHS.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}</select><select className="border rounded px-2 py-1 text-sm bg-white flex-1" value={newLine.chequeDate.y} onChange={e => setNewLine({...newLine, chequeDate: {...newLine.chequeDate, y: Number(e.target.value)}})}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div></div>)}
                    <div className="md:col-span-1"><button type="button" onClick={addPaymentLine} disabled={!newLine.amount} className="w-full bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center"><Plus size={20} /></button></div>
                </div>
                <div className="space-y-2">{paymentLines.map((line) => (<div key={line.id} className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-blue-200 transition-colors"><div className="flex gap-4 text-sm items-center flex-wrap"><span className="font-bold text-gray-800 bg-gray-100 px-2 py-1 rounded">{line.method}</span><span className="text-blue-600 font-bold font-mono text-lg">{formatCurrency(line.amount)}</span>{line.chequeNumber && <span className="text-gray-600 text-xs bg-yellow-50 px-2 py-1 rounded border border-yellow-100">شماره چک: {line.chequeNumber} {line.chequeDate && `(${line.chequeDate})`}</span>}{line.bankName && <span className="text-gray-600 text-xs bg-blue-50 px-2 py-1 rounded border border-blue-100">{line.bankName}</span>}{line.description && <span className="text-gray-500 text-xs italic">{line.description}</span>}</div><button type="button" onClick={() => removePaymentLine(line.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 size={18} /></button></div>))}</div>
            </div>

            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-200">
                <label className="text-sm font-bold text-gray-700 mb-3 block flex items-center gap-2"><Paperclip size={18} />ضمیمه‌ها</label>
                <div className="flex items-center gap-4">
                    <input type="file" id="attachment" className="hidden" accept="image/*,application/pdf" onChange={handleFileChange} disabled={uploading}/>
                    <label htmlFor="attachment" className={`bg-white border-2 border-dashed border-gray-300 text-gray-600 px-6 py-3 rounded-xl cursor-pointer hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 transition-all flex items-center gap-2 text-sm font-medium ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {uploading ? <Loader2 size={18} className="animate-spin"/> : <UploadCloud size={18}/>} {uploading ? 'در حال آپلود...' : 'انتخاب فایل'}
                    </label>
                </div>
                {attachments.length > 0 && <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">{attachments.map((file, idx) => (<div key={idx} className="flex items-center justify-between bg-white p-3 rounded-xl border border-gray-200 text-sm shadow-sm group"><a href={file.data} target="_blank" className="text-blue-600 truncate hover:underline flex items-center gap-2"><Paperclip size={14}/> {file.fileName}</a><button type="button" onClick={() => removeAttachment(idx)} className="text-gray-400 hover:text-red-500 p-1"><X size={16} /></button></div>))}</div>}
            </div>
            
            <div className="pt-4"><button type="submit" disabled={isSubmitting || uploading} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100">{isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}ثبت نهایی دستور پرداخت</button></div>
        </form>
    </div>
  );
};
export default CreateOrder;
