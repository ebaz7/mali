
import React, { useState } from 'react';
import { PaymentOrder, OrderStatus, PaymentMethod } from '../types';
import { formatCurrency, formatDate } from '../constants';
import { X, Printer, Image as ImageIcon, FileDown, Loader2 } from 'lucide-react';

interface PrintVoucherProps {
  order: PaymentOrder;
  onClose: () => void;
}

const PrintVoucher: React.FC<PrintVoucherProps> = ({ order, onClose }) => {
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
    <div className="absolute -top-6 right-2 border-[3px] border-blue-800 text-blue-800 rounded-xl p-1 px-3 rotate-[-15deg] opacity-80 mix-blend-multiply no-print">
      <div className="text-[10px] font-bold border-b border-blue-800 mb-0.5 text-center">{title}</div>
      <div className="text-[9px] text-center font-bold whitespace-nowrap">{name}</div>
      <div className="text-[8px] text-center text-blue-600">تایید سیستمی</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto print:p-0 print:static print:bg-white print:block">
      {/* Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start no-print z-50 pointer-events-none">
         <div className="bg-white p-3 rounded-xl shadow-lg pointer-events-auto flex flex-col gap-3 w-full max-w-md mx-auto mt-10 md:mt-0">
             <div className="flex items-center justify-between">
                 <h3 className="font-bold text-gray-700 text-sm">تنظیمات و خروجی</h3>
                 <button onClick={onClose} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
             </div>
             
             <div className="grid grid-cols-2 gap-2">
                 <button 
                    onClick={handleDownloadImage}
                    disabled={processing}
                    className="bg-purple-50 text-purple-700 hover:bg-purple-100 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors"
                 >
                     {processing ? <Loader2 size={16} className="animate-spin"/> : <ImageIcon size={16} />}
                     دانلود عکس
                 </button>
                 <button 
                    onClick={handleDownloadPDF}
                    disabled={processing}
                    className="bg-red-50 text-red-700 hover:bg-red-100 py-2 rounded-lg flex items-center justify-center gap-1 text-xs font-bold transition-colors"
                 >
                     {processing ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16} />}
                     دانلود PDF
                 </button>
             </div>

             <button 
                onClick={handlePrint}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg flex items-center justify-center gap-2"
             >
                 <Printer size={18} />
                 چاپ مستقیم
             </button>
         </div>
      </div>

      {/* Voucher Container - A5 Landscape Ratio */}
      <div id="print-area" className="bg-white w-[210mm] aspect-[1.414/1] mx-auto p-8 shadow-2xl print:shadow-none print:w-full print:h-full print:aspect-auto print:m-0 print:p-4 rounded-sm relative text-gray-900 flex flex-col justify-between">
        
        <div>
            {/* Header */}
            <div className="border-b-2 border-gray-800 pb-4 mb-6 flex justify-between items-end">
                <div className="text-right w-1/2">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2 h-8">
                        {order.payingCompany || ''}
                    </h1>
                    <h2 className="text-lg font-bold text-gray-700">دستور پرداخت / سند حسابداری</h2>
                </div>
                <div className="text-left text-sm font-mono space-y-2">
                    <div className="flex items-center gap-2 justify-end">
                        <span className="text-gray-600 font-sans font-bold">شماره دستور:</span>
                        <span className="font-bold text-lg border-b border-gray-300 min-w-[100px] text-center inline-block">{order.trackingNumber}</span>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                        <span className="text-gray-600 font-sans font-bold">تاریخ:</span>
                        <span className="font-medium text-lg border-b border-gray-300 min-w-[140px] text-center inline-block">{formatDate(order.date)}</span>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="space-y-6">
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
        <div className="mt-6 pt-4 border-t-2 border-gray-800 print:mt-auto">
            <div className="grid grid-cols-4 gap-4 text-center h-24 items-end">
                <div className="flex flex-col items-center justify-end h-full relative">
                    <span className="text-xs font-bold text-gray-700 border-t border-dotted border-gray-400 w-full pt-2">درخواست کننده</span>
                    <div className="text-[10px] mt-1">{order.requester}</div>
                </div>
                
                <div className="flex flex-col items-center justify-end h-full relative">
                    {order.approverFinancial && (
                        <Stamp name={order.approverFinancial} title="تایید مالی" />
                    )}
                    <span className="text-xs font-bold text-gray-700 border-t border-dotted border-gray-400 w-full pt-2">مدیر مالی</span>
                </div>
                
                <div className="flex flex-col items-center justify-end h-full relative">
                     {order.approverManager && (
                        <Stamp name={order.approverManager} title="تایید مدیریت" />
                     )}
                    <span className="text-xs font-bold text-gray-700 border-t border-dotted border-gray-400 w-full pt-2">مدیریت</span>
                </div>
                
                <div className="flex flex-col items-center justify-end h-full relative">
                    {order.approverCeo && (
                         <Stamp name={order.approverCeo} title="تصویب نهایی" />
                    )}
                    <span className="text-xs font-bold text-gray-700 border-t border-dotted border-gray-400 w-full pt-2">مدیر عامل</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default PrintVoucher;