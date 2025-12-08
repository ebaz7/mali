
import React, { useState } from 'react';
import { WarehouseTransaction, SystemSettings } from '../types';
import { formatCurrency, formatDate } from '../constants';
import { X, Printer, Loader2, Share2, Eye, EyeOff } from 'lucide-react';
import { apiCall } from '../services/apiService';

interface PrintBijakProps {
  tx: WarehouseTransaction;
  onClose: () => void;
  settings?: SystemSettings;
}

const PrintBijak: React.FC<PrintBijakProps> = ({ tx, onClose, settings }) => {
  const [processing, setProcessing] = useState(false);
  const [hidePrices, setHidePrices] = useState(false);

  // Helper to find logo
  const companyInfo = settings?.companies?.find(c => c.name === tx.company);
  const companyLogo = companyInfo?.logo || settings?.pwaIcon;

  const handlePrint = () => { window.print(); };

  const generateAndSend = async (target: string, hidePrice: boolean, captionPrefix: string) => {
      setProcessing(true);
      const originalHideState = hidePrices;
      
      // Temporarily set hide state for capture
      setHidePrices(hidePrice);
      
      // Wait for React render
      await new Promise(resolve => setTimeout(resolve, 100));

      const element = document.getElementById('print-area-bijak');
      if (!element) { setProcessing(false); return; }

      try {
          // @ts-ignore
          const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
          const base64 = canvas.toDataURL('image/png').split(',')[1];
          
          let caption = `${captionPrefix}\n`;
          caption += `🏭 شرکت: ${tx.company}\n`;
          caption += `📄 شماره بیجک: ${tx.number}\n`;
          caption += `📅 تاریخ: ${formatDate(tx.date)}\n`;
          caption += `👤 گیرنده: ${tx.recipientName || '-'}\n`;
          caption += `📦 اقلام:\n`;
          tx.items.forEach((item, i) => {
              caption += `${i+1}. ${item.itemName} - ${item.quantity} عدد (${item.weight} KG)\n`;
          });

          await apiCall('/send-whatsapp', 'POST', { 
              number: target, 
              message: caption, 
              mediaData: { data: base64, mimeType: 'image/png', filename: `Bijak_${tx.number}.png` } 
          });
          alert('ارسال شد.');
      } catch (e) {
          alert('خطا در ارسال');
          console.error(e);
      } finally {
          setHidePrices(originalHideState); // Restore
          setProcessing(false);
      }
  };

  const sendToWarehouse = () => {
      let target = settings?.defaultWarehouseGroup;
      if (!target) {
          target = prompt("شماره واتساپ انبار در تنظیمات وارد نشده است. لطفا شماره را وارد کنید:");
      }
      if (target) {
          generateAndSend(target, true, "📦 *حواله خروج کالا (بیجک انبار)*");
      }
  };

  const sendToManager = () => {
      let target = settings?.defaultSalesManager;
      if (!target) {
          target = prompt("شماره مدیر فروش در تنظیمات وارد نشده است. لطفا شماره را وارد کنید:");
      }
      if (target) {
          generateAndSend(target, false, "📄 *گزارش خروج کالا (بیجک)*");
      }
  };

  const sendToBoth = async () => {
      let wh = settings?.defaultWarehouseGroup;
      let mgr = settings?.defaultSalesManager;
      
      if (!wh) wh = prompt("شماره انبار وارد نشده. لطفا وارد کنید:");
      if (!mgr) mgr = prompt("شماره مدیر وارد نشده. لطفا وارد کنید:");
      
      if (!wh || !mgr) return; // If cancelled

      if(!confirm("ارسال به هر دو؟")) return;
      
      await generateAndSend(wh, true, "📦 *حواله خروج کالا (بیجک انبار)*");
      await generateAndSend(mgr, false, "📄 *گزارش خروج کالا (بیجک)*");
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
        <div className="bg-white p-3 rounded-xl shadow-lg absolute top-4 left-4 z-50 flex flex-col gap-2 no-print w-64">
            <div className="flex justify-between items-center border-b pb-2">
                <span className="font-bold text-sm">پنل عملیات</span>
                <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-red-500"/></button>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                <input type="checkbox" checked={hidePrices} onChange={e => setHidePrices(e.target.checked)} id="hidePrice"/>
                <label htmlFor="hidePrice" className="cursor-pointer">مخفی کردن قیمت‌ها در پیش‌نمایش</label>
            </div>

            <button onClick={handlePrint} className="bg-blue-600 text-white p-2 rounded text-sm hover:bg-blue-700 flex items-center justify-center gap-2"><Printer size={16}/> چاپ</button>
            
            <div className="border-t pt-2 mt-1 space-y-2">
                <button onClick={sendToWarehouse} disabled={processing} className="w-full bg-orange-100 text-orange-700 p-2 rounded text-xs hover:bg-orange-200 flex items-center justify-center gap-2 border border-orange-200">
                    {processing ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14}/>} ارسال به انبار (بدون قیمت)
                </button>
                <button onClick={sendToManager} disabled={processing} className="w-full bg-green-100 text-green-700 p-2 rounded text-xs hover:bg-green-200 flex items-center justify-center gap-2 border border-green-200">
                    {processing ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14}/>} ارسال به مدیر (با قیمت)
                </button>
                <button onClick={sendToBoth} disabled={processing} className="w-full bg-gray-800 text-white p-2 rounded text-xs hover:bg-gray-900 flex items-center justify-center gap-2 shadow-lg">
                    {processing ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14}/>} ارسال اتوماتیک به هر دو
                </button>
            </div>
        </div>

        <div id="print-area-bijak" className="bg-white w-[148mm] min-h-[210mm] mx-auto p-6 shadow-2xl rounded-sm relative text-gray-900 flex flex-col" style={{ direction: 'rtl' }}>
            {/* Header */}
            <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start">
                <div className="flex items-center gap-3">
                    {companyLogo && <img src={companyLogo} className="w-16 h-16 object-contain"/>}
                    <div>
                        <h1 className="text-xl font-black">{tx.company}</h1>
                        <p className="text-sm font-bold text-gray-600">حواله خروج کالا (بیجک)</p>
                    </div>
                </div>
                <div className="text-left space-y-1">
                    <div className="text-lg font-black border-2 border-black px-3 py-1 rounded">NO: {tx.number}</div>
                    <div className="text-sm font-bold">تاریخ: {formatDate(tx.date)}</div>
                </div>
            </div>

            {/* Recipient Info */}
            <div className="border rounded-lg p-3 mb-4 bg-gray-50 text-sm">
                <div className="grid grid-cols-2 gap-4">
                    <div><span className="text-gray-500 ml-2">تحویل گیرنده:</span> <span className="font-bold">{tx.recipientName}</span></div>
                    <div><span className="text-gray-500 ml-2">مقصد:</span> <span className="font-bold">{tx.destination || '-'}</span></div>
                    <div><span className="text-gray-500 ml-2">راننده:</span> <span className="font-bold">{tx.driverName || '-'}</span></div>
                    <div><span className="text-gray-500 ml-2">پلاک:</span> <span className="font-bold font-mono dir-ltr">{tx.plateNumber || '-'}</span></div>
                </div>
            </div>

            {/* Items Table */}
            <div className="flex-1">
                <table className="w-full text-sm border-collapse border border-black">
                    <thead className="bg-gray-200">
                        <tr>
                            <th className="border border-black p-2 w-10 text-center">#</th>
                            <th className="border border-black p-2">شرح کالا</th>
                            <th className="border border-black p-2 w-20 text-center">تعداد</th>
                            <th className="border border-black p-2 w-24 text-center">وزن (KG)</th>
                            {!hidePrices && <th className="border border-black p-2 w-28 text-center">فی (ریال)</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {tx.items.map((item, idx) => (
                            <tr key={idx}>
                                <td className="border border-black p-2 text-center">{idx + 1}</td>
                                <td className="border border-black p-2 font-bold">{item.itemName}</td>
                                <td className="border border-black p-2 text-center">{item.quantity}</td>
                                <td className="border border-black p-2 text-center">{item.weight}</td>
                                {!hidePrices && <td className="border border-black p-2 text-center font-mono">{item.unitPrice ? formatCurrency(item.unitPrice).replace('ریال', '') : '-'}</td>}
                            </tr>
                        ))}
                        {/* Totals */}
                        <tr className="bg-gray-100 font-bold">
                            <td colSpan={2} className="border border-black p-2 text-left pl-4">جمع کل:</td>
                            <td className="border border-black p-2 text-center">{tx.items.reduce((a,b)=>a+b.quantity,0)}</td>
                            <td className="border border-black p-2 text-center">{tx.items.reduce((a,b)=>a+b.weight,0)}</td>
                            {!hidePrices && <td className="border border-black p-2 bg-gray-200"></td>}
                        </tr>
                    </tbody>
                </table>
                {tx.description && <div className="mt-4 border p-2 rounded text-sm"><span className="font-bold block mb-1">توضیحات:</span>{tx.description}</div>}
            </div>

            {/* Signatures */}
            <div className="mt-8 pt-8 border-t-2 border-black grid grid-cols-3 gap-8 text-center">
                <div><div className="mb-8 font-bold text-sm">تحویل دهنده (انبار)</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div>
                <div><div className="mb-8 font-bold text-sm">تایید مدیریت</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div>
                <div><div className="mb-8 font-bold text-sm">تحویل گیرنده (راننده)</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div>
            </div>
        </div>
    </div>
  );
};

export default PrintBijak;
