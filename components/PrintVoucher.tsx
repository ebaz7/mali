
import React, { useState } from 'react';
import { PaymentOrder, OrderStatus, PaymentMethod, SystemSettings } from '../types';
import { formatCurrency, formatDate } from '../constants';
import { X, Printer, Image as ImageIcon, FileDown, Loader2, CheckCircle, XCircle, Pencil } from 'lucide-react';

interface PrintVoucherProps {
  order: PaymentOrder;
  onClose: () => void;
  settings?: SystemSettings;
  onApprove?: () => void;
  onReject?: () => void;
  onEdit?: () => void;
}

const PrintVoucher: React.FC<PrintVoucherProps> = ({ order, onClose, settings, onApprove, onReject, onEdit }) => {
  const [processing, setProcessing] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadImage = async () => {
    const element = document.getElementById('print-area');
    if (!element) return;
    
    setProcessing(true);
    try {
      // @ts-ignore
      const canvas = await window.html2canvas(element, { 
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const data = canvas.toDataURL('image/jpeg', 0.9);
      const link = document.createElement('a');
      link.href = data;
      link.download = `voucher-${order.trackingNumber}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
      alert('خطا در ایجاد تصویر');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('print-area');
    if (!element) return;

    setProcessing(true);
    try {
      // @ts-ignore
      const canvas = await window.html2canvas(element, { 
        scale: 2, 
        backgroundColor: '#ffffff' 
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      
      // @ts-ignore
      const { jsPDF } = window.jspdf;
      // A5 Landscape
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a5'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`voucher-${order.trackingNumber}.pdf`);
    } catch (e) {
      console.error(e);
      alert('خطا در ایجاد PDF');
    } finally {
      setProcessing(false);
    }
  };

  // Helper component for the Stamp
  const Stamp = ({ name, title }: { name: string; title: string }) => (
    <div className="border-[2px] border-blue-800 text-blue-800 rounded-lg py-1 px-3 rotate-[-5deg] opacity-90 mix-blend-multiply bg-white/80 print:bg-transparent shadow-sm inline-block">
      <div className="text-[9px] font-bold border-b border-blue-800 mb-0.5 text-center pb-0.5">{title}</div>
      <div className="text-[10px] text-center font-bold whitespace-nowrap">{name}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto print:p-0 print:static print:bg-white print:block animate-fade-in">
      {/* Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start no-print z-50 pointer-events-none">
         <div className="bg-white p-3 rounded-xl shadow-lg pointer-events-auto flex flex-col gap-3 w-full max-w-lg mx-auto mt-10 md:mt-0">
             <div className="flex items-center justify-between border-b pb-2 mb-1">
                 <h3 className="font-bold text-gray-800 text-base">جزئیات و عملیات</h3>
                 <button onClick={onClose} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
             </div>
             
             {/* Main Actions (Approve/Reject/Edit) */}
             {(onApprove || onReject || onEdit) && (
                <div className="flex gap-2 pb-3 border-b border-gray-100">
                    {onApprove && (
                        <button onClick={onApprove} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold shadow-md shadow-green-600/20">
                            <CheckCircle size={18} /> تایید درخواست
                        </button>
                    )}
                    {onReject && (
                        <button onClick={onReject} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold shadow-md shadow-red-500/20">
                            <XCircle size={18} /> رد درخواست
                        </button>
                    )}
                    {onEdit && (
                        <button onClick={onEdit} className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 font-bold" title="ویرایش">
                            <Pencil size={18} />
                        </button>
                    )}
                </div>
             )}

             {/* Output Options */}
             <div className="grid grid-cols-3 gap-2">
                 <button 
                    onClick={handleDownloadImage}
                    disabled={processing}
                    className="bg-gray-100 text-gray-700 hover:bg-gray-200 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors"
                 >
                     {processing ? <Loader2 size={14} className="animate-spin"/> : <ImageIcon size={14} />}
                     عکس
                 </button>
                 <button 
                    onClick={handleDownloadPDF}
                    disabled={processing}
                    className="bg-gray-100 text-gray-700 hover:bg-gray-200 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors"
                 >
                     {processing ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14} />}
                     PDF
                 </button>
                 <button 
                    onClick={handlePrint}
                    className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors"
                 >
                     <Printer size={14} />
                     چاپ
                 </button>
             </div>
         </div>
      </div>

      {/* Voucher Container - A5 Landscape Ratio */}
      <div id="print-area" className="bg-white w-[210mm] aspect-[1.414/1] mx-auto p-8 shadow-2xl print:shadow-none print:w-full print:h-full print:aspect-auto print:m-0 print:p-4 rounded-sm relative text-gray-900 flex flex-col justify-between overflow-hidden">
        
        {/* Rejected Watermark/Stamp */}
        {order.status === OrderStatus.REJECTED && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-8 border-red-600/30 text-red-600/30 font-black text-9xl rotate-[-25deg] p-4 rounded-3xl select-none z-0 pointer-events-none">
                REJECTED
            </div>
        )}

        {order.status === OrderStatus.REJECTED && order.rejectedBy && (
             <div className="absolute top-10 left-10 border-4 border-red-700 text-red-700 rounded-xl p-2 rotate-[-15deg] opacity-90 mix-blend-multiply z-10 bg-white/80">
                <div className="text-sm font-bold border-b-2 border-red-700 mb-1 text-center">درخواست رد شد</div>
                <div className="text-xs text-center font-bold whitespace-nowrap mb-1">{order.rejectedBy}</div>
                <div className="text-[10px] text-center font-bold">دلیل: {order.rejectionReason}</div>
             </div>
        )}

        <div className="relative z-10">
            {/* New Letterhead Header with Logo */}
            <div className="border-b-2 border-gray-800 pb-2 mb-4 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    {/* Logo/Image */}
                    {settings?.pwaIcon && (
                        <div className="w-16 h-16 flex items-center justify-center">
                             <img src={settings.pwaIcon} alt="Logo" className="max-w-full max-h-full object-contain" />
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                            {order.payingCompany || 'شرکت بازرگانی'}
                        </h1>
                        <p className="text-xs text-gray-500 font-bold mt-1">سیستم مدیریت مالی و پرداخت</p>
                    </div>
                </div>
                
                <div className="text-left flex flex-col items-end gap-1">
                    <h2 className="text-xl font-black bg-gray-100 border border-gray-200 text-gray-800 px-4 py-1.5 rounded-lg mb-1">
                        رسید پرداخت وجه
                    </h2>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-gray-500">شماره:</span>
                        <span className="font-mono font-bold text-lg">{order.trackingNumber}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold text-gray-500">تاریخ:</span>
                        <span className="font-bold text-gray-800">{formatDate(order.date)}</span>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                    <div className="bg-gray-50/50 border border-gray-300 p-3 rounded print:bg-transparent">
                        <span className="block text-gray-500 text-xs mb-1">در وجه (ذینفع):</span>
                        <span className="font-bold text-lg text-gray-900">{order.payee}</span>
                    </div>
                    <div className="bg-gray-50/50 border border-gray-300 p-3 rounded print:bg-transparent">
                        <span className="block text-gray-500 text-xs mb-1">مبلغ کل پرداختی:</span>
                        <span className="font-bold text-lg text-gray-900">{formatCurrency(order.totalAmount)}</span>
                    </div>
                </div>

                <div className="bg-gray-50/50 border border-gray-300 p-3 rounded min-h-[60px] print:bg-transparent">
                    <span className="block text-gray-500 text-xs mb-1">بابت (شرح پرداخت):</span>
                    <p className="text-gray-800 text-base leading-relaxed text-justify font-medium">
                        {order.description}
                    </p>
                </div>

                {/* Payment Details Table */}
                <div className="border border-gray-300 rounded overflow-hidden">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-gray-100 border-b border-gray-300 print:bg-gray-200">
                            <tr>
                                <th className="p-2 font-bold text-gray-600 w-10">ردیف</th>
                                <th className="p-2 font-bold text-gray-600">نوع پرداخت</th>
                                <th className="p-2 font-bold text-gray-600">مبلغ</th>
                                <th className="p-2 font-bold text-gray-600">اطلاعات تکمیلی</th>
                                <th className="p-2 font-bold text-gray-600">توضیحات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {order.paymentDetails.map((detail, idx) => (
                                <tr key={detail.id}>
                                    <td className="p-2 text-center">{idx + 1}</td>
                                    <td className="p-2 font-bold">{detail.method}</td>
                                    <td className="p-2 font-mono">{formatCurrency(detail.amount)}</td>
                                    <td className="p-2">
                                        {detail.method === PaymentMethod.CHEQUE ? `شماره چک: ${detail.chequeNumber}` :
                                         detail.method === PaymentMethod.TRANSFER ? `بانک: ${detail.bankName}` : '-'}
                                    </td>
                                    <td className="p-2 text-xs text-gray-600">
                                        {detail.description || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Footer / Signatures - 4 Columns */}
        <div className="mt-auto pt-4 border-t-2 border-gray-800 print:mt-auto relative z-10">
            <div className="grid grid-cols-4 gap-4 text-center">
                
                {/* Requester */}
                <div className="flex flex-col items-center justify-end min-h-[90px]">
                    <div className="mb-2 flex items-center justify-center h-full">
                        <span className="font-bold text-gray-900 text-base">{order.requester}</span>
                    </div>
                    <div className="w-full border-t border-gray-400 pt-1">
                        <span className="text-xs font-bold text-gray-600">درخواست کننده</span>
                    </div>
                </div>
                
                {/* Financial */}
                <div className="flex flex-col items-center justify-end min-h-[90px]">
                    <div className="mb-2 flex items-center justify-center h-full">
                         {order.approverFinancial ? (
                            <Stamp name={order.approverFinancial} title="تایید مالی" />
                         ) : (
                            <span className="text-gray-300 text-[10px] print:hidden">امضا نشده</span>
                         )}
                    </div>
                    <div className="w-full border-t border-gray-400 pt-1">
                        <span className="text-xs font-bold text-gray-600">مدیر مالی</span>
                    </div>
                </div>
                
                {/* Manager */}
                <div className="flex flex-col items-center justify-end min-h-[90px]">
                    <div className="mb-2 flex items-center justify-center h-full">
                         {order.approverManager ? (
                            <Stamp name={order.approverManager} title="تایید مدیریت" />
                         ) : (
                            <span className="text-gray-300 text-[10px] print:hidden">امضا نشده</span>
                         )}
                    </div>
                    <div className="w-full border-t border-gray-400 pt-1">
                        <span className="text-xs font-bold text-gray-600">مدیریت</span>
                    </div>
                </div>
                
                {/* CEO */}
                <div className="flex flex-col items-center justify-end min-h-[90px]">
                    <div className="mb-2 flex items-center justify-center h-full">
                         {order.approverCeo ? (
                            <Stamp name={order.approverCeo} title="مدیر عامل" />
                         ) : (
                            <span className="text-gray-300 text-[10px] print:hidden">امضا نشده</span>
                         )}
                    </div>
                    <div className="w-full border-t border-gray-400 pt-1">
                        <span className="text-xs font-bold text-gray-600">مدیر عامل</span>
                    </div>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};

export default PrintVoucher;
