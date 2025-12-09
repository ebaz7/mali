
import React, { useState } from 'react';
import { PaymentOrder, OrderStatus, PaymentMethod, SystemSettings } from '../types';
import { formatCurrency, formatDate } from '../constants';
import { X, Printer, Image as ImageIcon, FileDown, Loader2, CheckCircle, XCircle, Pencil, Share2, Users } from 'lucide-react';
import { apiCall } from '../services/apiService';

interface PrintVoucherProps {
  order: PaymentOrder;
  onClose?: () => void;
  settings?: SystemSettings;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
  embed?: boolean; // New prop for background rendering
}

const PrintVoucher: React.FC<PrintVoucherProps> = ({ order, onClose, settings, onApprove, onReject, onEdit, embed }) => {
  const [processing, setProcessing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showContactSelect, setShowContactSelect] = useState(false);

  // Smart Compact Mode
  const isCompact = order.paymentDetails.length > 2;
  const companyInfo = settings?.companies?.find(c => c.name === order.payingCompany);
  const companyLogo = companyInfo?.logo || settings?.pwaIcon;

  // Helper Stamp
  const Stamp = ({ name, title }: { name: string; title: string }) => (
    <div className={`border-[2px] border-blue-800 text-blue-800 rounded-lg ${isCompact ? 'py-0.5 px-2' : 'py-1 px-3'} rotate-[-5deg] opacity-90 mix-blend-multiply bg-white/80 print:bg-transparent shadow-sm inline-block`}>
      <div className={`${isCompact ? 'text-[8px]' : 'text-[9px]'} font-bold border-b border-blue-800 mb-0.5 text-center pb-0.5`}>{title}</div>
      <div className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} text-center font-bold whitespace-nowrap`}>{name}</div>
    </div>
  );

  // --- Handlers (Keep existing ones, but they are hidden in embed mode) ---
  const handlePrint = () => { window.print(); };
  const handleDownloadImage = async () => { /* ... existing logic ... */ };
  const handleDownloadPDF = async () => { /* ... existing logic ... */ };
  const handleSendToWhatsApp = async (targetNumber: string) => { /* ... existing logic ... */ };

  // --- RENDER ---
  const content = (
      <div id={embed ? `print-voucher-${order.id}` : "print-area"} className="bg-white w-[210mm] h-[148mm] mx-auto p-6 shadow-2xl rounded-sm relative text-gray-900 flex flex-col justify-between overflow-hidden" style={{ direction: 'rtl' }}>
        {/* Rejected Watermark */}
        {order.status === OrderStatus.REJECTED && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-8 border-red-600/30 text-red-600/30 font-black text-9xl rotate-[-25deg] p-4 rounded-3xl select-none z-0 pointer-events-none">REJECTED</div>
        )}

        {/* Header */}
        <div className="relative z-10">
            <div className={`border-b-2 border-gray-800 ${isCompact ? 'pb-1 mb-2' : 'pb-2 mb-4'} flex justify-between items-center`}>
                <div className="flex items-center gap-3 w-2/3">
                    {companyLogo && <div className={`${isCompact ? 'w-12 h-12' : 'w-16 h-16'} shrink-0 flex items-center justify-center`}><img src={companyLogo} alt="Logo" className="w-full h-full object-contain" crossOrigin="anonymous" /></div>}
                    <div><h1 className={`${isCompact ? 'text-xl' : 'text-2xl'} font-bold text-gray-900`} style={{ letterSpacing: '0px', fontVariantLigatures: 'none' }}>{order.payingCompany || 'شرکت بازرگانی'}</h1><p className="text-xs text-gray-500 font-bold mt-1">سیستم مدیریت مالی و پرداخت</p></div>
                </div>
                <div className="text-left flex flex-col items-end gap-1 w-1/3">
                    <h2 className={`${isCompact ? 'text-lg px-3 py-1' : 'text-xl px-4 py-1.5'} font-black bg-gray-100 border border-gray-200 text-gray-800 rounded-lg mb-1 whitespace-nowrap`}>رسید پرداخت وجه</h2>
                    <div className="flex items-center gap-2 text-sm"><span className="font-bold text-gray-500">شماره:</span><span className="font-mono font-bold text-lg">{order.trackingNumber}</span></div>
                    <div className="flex items-center gap-2 text-sm"><span className="font-bold text-gray-500">تاریخ:</span><span className="font-bold text-gray-800">{formatDate(order.date)}</span></div>
                </div>
            </div>

            {/* Body */}
            <div className={`${isCompact ? 'space-y-2' : 'space-y-4'}`}>
                <div className="grid grid-cols-2 gap-4">
                    <div className={`bg-gray-50/50 border border-gray-300 ${isCompact ? 'p-2' : 'p-3'} rounded`}><span className="block text-gray-500 text-xs mb-1">در وجه (ذینفع):</span><span className={`font-bold text-gray-900 ${isCompact ? 'text-base' : 'text-lg'}`}>{order.payee}</span></div>
                    <div className={`bg-gray-50/50 border border-gray-300 ${isCompact ? 'p-2' : 'p-3'} rounded`}><span className="block text-gray-500 text-xs mb-1">مبلغ کل پرداختی:</span><span className={`font-bold text-gray-900 ${isCompact ? 'text-base' : 'text-lg'}`}>{formatCurrency(order.totalAmount)}</span></div>
                </div>
                <div className={`bg-gray-50/50 border border-gray-300 ${isCompact ? 'p-2 min-h-[40px]' : 'p-3 min-h-[60px]'} rounded`}><span className="block text-gray-500 text-xs mb-1">بابت (شرح پرداخت):</span><p className={`text-gray-800 text-justify font-medium leading-tight ${isCompact ? 'text-xs' : 'text-base'}`}>{order.description}</p></div>
                <div className="border border-gray-300 rounded overflow-hidden">
                    <table className={`w-full text-right ${isCompact ? 'text-[10px]' : 'text-sm'}`}>
                        <thead className="bg-gray-100 border-b border-gray-300"><tr><th className={`${isCompact ? 'p-1' : 'p-2'} font-bold text-gray-600 w-8`}>#</th><th className={`${isCompact ? 'p-1' : 'p-2'} font-bold text-gray-600`}>نوع پرداخت</th><th className={`${isCompact ? 'p-1' : 'p-2'} font-bold text-gray-600`}>مبلغ</th><th className={`${isCompact ? 'p-1' : 'p-2'} font-bold text-gray-600`}>بانک / چک</th><th className={`${isCompact ? 'p-1' : 'p-2'} font-bold text-gray-600`}>توضیحات</th></tr></thead>
                        <tbody className="divide-y divide-gray-200">{order.paymentDetails.map((detail, idx) => (<tr key={detail.id}><td className={`${isCompact ? 'p-1' : 'p-2'} text-center`}>{idx + 1}</td><td className={`${isCompact ? 'p-1' : 'p-2'} font-bold`}>{detail.method}</td><td className={`${isCompact ? 'p-1' : 'p-2'} font-mono`}>{formatCurrency(detail.amount)}</td><td className={`${isCompact ? 'p-1' : 'p-2'}`}>{detail.method === PaymentMethod.CHEQUE ? `چک: ${detail.chequeNumber}${detail.chequeDate ? ` (سررسید: ${detail.chequeDate})` : ''}` : detail.method === PaymentMethod.TRANSFER ? `بانک: ${detail.bankName}` : '-'}</td><td className={`${isCompact ? 'p-1' : 'p-2'} text-gray-600 truncate max-w-[150px]`}>{detail.description || '-'}</td></tr>))}</tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className={`mt-auto ${isCompact ? 'pt-2' : 'pt-4'} border-t-2 border-gray-800 relative z-10`}>
            <div className="grid grid-cols-4 gap-4 text-center">
                <div className={`flex flex-col items-center justify-end ${isCompact ? 'min-h-[60px]' : 'min-h-[90px]'}`}><div className="mb-2 flex items-center justify-center h-full"><span className="font-bold text-gray-900 text-sm">{order.requester}</span></div><div className="w-full border-t border-gray-400 pt-1"><span className="text-[10px] font-bold text-gray-600">درخواست کننده</span></div></div>
                <div className={`flex flex-col items-center justify-end ${isCompact ? 'min-h-[60px]' : 'min-h-[90px]'}`}><div className="mb-2 flex items-center justify-center h-full">{order.approverFinancial ? <Stamp name={order.approverFinancial} title="تایید مالی" /> : <span className="text-gray-300 text-[9px]">امضا نشده</span>}</div><div className="w-full border-t border-gray-400 pt-1"><span className="text-[10px] font-bold text-gray-600">مدیر مالی</span></div></div>
                <div className={`flex flex-col items-center justify-end ${isCompact ? 'min-h-[60px]' : 'min-h-[90px]'}`}><div className="mb-2 flex items-center justify-center h-full">{order.approverManager ? <Stamp name={order.approverManager} title="تایید مدیریت" /> : <span className="text-gray-300 text-[9px]">امضا نشده</span>}</div><div className="w-full border-t border-gray-400 pt-1"><span className="text-[10px] font-bold text-gray-600">مدیریت</span></div></div>
                <div className={`flex flex-col items-center justify-end ${isCompact ? 'min-h-[60px]' : 'min-h-[90px]'}`}><div className="mb-2 flex items-center justify-center h-full">{order.approverCeo ? <Stamp name={order.approverCeo} title="مدیر عامل" /> : <span className="text-gray-300 text-[9px]">امضا نشده</span>}</div><div className="w-full border-t border-gray-400 pt-1"><span className="text-[10px] font-bold text-gray-600">مدیر عامل</span></div></div>
            </div>
        </div>
      </div>
  );

  if (embed) return content;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-50 pointer-events-none no-print">
         <div className="bg-white p-3 rounded-xl shadow-lg pointer-events-auto flex flex-col gap-3 w-full max-w-lg mx-auto mt-10 md:mt-0 relative">
             <div className="flex items-center justify-between border-b pb-2 mb-1"><h3 className="font-bold text-gray-800 text-base">جزئیات و عملیات</h3><button onClick={onClose} className="text-gray-400 hover:text-red-500"><X size={20}/></button></div>
             {(onApprove || onReject || onEdit) && (<div className="flex gap-2 pb-3 border-b border-gray-100">{onApprove && <button onClick={onApprove} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold"><CheckCircle size={18} /> تایید</button>}{onReject && <button onClick={onReject} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold"><XCircle size={18} /> رد</button>}{onEdit && <button onClick={onEdit} className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-2 rounded-lg flex items-center justify-center"><Pencil size={18} /></button>}</div>)}
             <div className="grid grid-cols-4 gap-2 relative">
                 <button onClick={handleDownloadImage} disabled={processing} className="bg-gray-100 text-gray-700 hover:bg-gray-200 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold">{processing ? <Loader2 size={14} className="animate-spin"/> : <ImageIcon size={14} />} عکس</button>
                 <button onClick={handleDownloadPDF} disabled={processing} className="bg-gray-100 text-gray-700 hover:bg-gray-200 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold">{processing ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14} />} PDF</button>
                 <button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold"><Printer size={14} /> چاپ</button>
                 <button onClick={() => setShowContactSelect(!showContactSelect)} disabled={sharing} className="bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold">{sharing ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14} />} واتساپ</button>
                 {showContactSelect && (<div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border z-[100] animate-fade-in overflow-hidden"><div className="p-3 bg-gray-50 border-b font-bold text-xs flex justify-between"><span>انتخاب مخاطب</span><button onClick={()=>setShowContactSelect(false)}><X size={14}/></button></div><div className="max-h-48 overflow-y-auto">{settings?.savedContacts?.map(c => (<button key={c.id} onClick={()=>handleSendToWhatsApp(c.number)} className="w-full text-right p-3 hover:bg-blue-50 text-sm border-b flex items-center gap-2"><div className="p-1.5 rounded-full bg-gray-100 text-gray-600"><Users size={12}/></div><div className="truncate"><div className="font-bold">{c.name}</div><div className="text-[10px] text-gray-500">{c.number}</div></div></button>))}</div><div className="p-2 border-t bg-gray-50"><button onClick={()=>{const n=prompt("شماره:");if(n)handleSendToWhatsApp(n);}} className="w-full text-center text-xs text-blue-600 font-bold">شماره دستی</button></div></div>)}
             </div>
         </div>
      </div>
      {content}
    </div>
  );
};

export default PrintVoucher;
