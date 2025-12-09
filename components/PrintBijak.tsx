
import React, { useState, useEffect } from 'react';
import { WarehouseTransaction, SystemSettings, Contact } from '../types';
import { formatCurrency, formatDate } from '../constants';
import { X, Printer, Loader2, Share2, Search, Users, Smartphone, FileDown } from 'lucide-react';
import { apiCall } from '../services/apiService';
import { getUsers } from '../services/authService';

interface PrintBijakProps {
  tx: WarehouseTransaction;
  onClose: () => void;
  settings?: SystemSettings;
  embed?: boolean;
  forceHidePrices?: boolean;
}

const PrintBijak: React.FC<PrintBijakProps> = ({ tx, onClose, settings, embed, forceHidePrices }) => {
  const [processing, setProcessing] = useState(false);
  const [hidePrices, setHidePrices] = useState(forceHidePrices || false);
  const [showContactSelect, setShowContactSelect] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);

  // Use consistent ID. If embed is true (hidden mode), use unique ID.
  // If showing modal (embed=false), use "print-area" which matches index.html CSS.
  const containerId = embed 
    ? `print-bijak-${tx.id}${forceHidePrices ? '-noprice' : '-price'}` 
    : "print-area";

  useEffect(() => {
      if (typeof forceHidePrices === 'boolean') setHidePrices(forceHidePrices);
  }, [forceHidePrices]);

  useEffect(() => {
      const loadContacts = async () => {
          setContactsLoading(true);
          const saved = settings?.savedContacts || [];
          try {
            const users = await getUsers();
            const userContacts = users
                .filter(u => u.phoneNumber)
                .map(u => ({ id: u.id, name: u.fullName, number: u.phoneNumber!, isGroup: false }));
            setAllContacts([...saved, ...userContacts]);
          } catch (e) {
            setAllContacts(saved);
          } finally {
            setContactsLoading(false);
          }
      };
      if (showContactSelect) loadContacts();
  }, [settings, showContactSelect]);

  const companyInfo = settings?.companies?.find(c => c.name === tx.company);
  const companyLogo = companyInfo?.logo || settings?.pwaIcon;

  const handlePrint = () => window.print();

  const handleDownloadPDF = async () => {
      setProcessing(true);
      const element = document.getElementById(containerId);
      if (!element) { 
          alert("خطا: محدوده پرینت یافت نشد.");
          setProcessing(false); 
          return; 
      }
      try {
          // @ts-ignore
          const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/png');
          // @ts-ignore
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a5' });
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
          pdf.save(`Bijak_${tx.number}.pdf`);
      } catch (e) { console.error(e); alert('خطا در دانلود PDF'); }
      finally { setProcessing(false); }
  };

  const generateAndSend = async (target: string, shouldHidePrice: boolean, captionPrefix: string) => {
      if (!target) { alert("شماره مخاطب تنظیم نشده است."); return; }
      setProcessing(true);
      const originalState = hidePrices;
      setHidePrices(shouldHidePrice);

      setTimeout(async () => {
          try {
              const element = document.getElementById(containerId);
              if (!element) throw new Error("Element not found");

              // @ts-ignore
              const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
              const base64 = canvas.toDataURL('image/png').split(',')[1];

              let caption = `${captionPrefix}\nشماره: ${tx.number}\nگیرنده: ${tx.recipientName}\nتعداد: ${tx.items.length} قلم`;

              await apiCall('/send-whatsapp', 'POST', {
                  number: target,
                  message: caption,
                  mediaData: { data: base64, mimeType: 'image/png', filename: `Bijak_${tx.number}.png` }
              });
              if (!embed) alert('ارسال شد ✅');
          } catch (e) { console.error(e); if (!embed) alert('خطا در ارسال ❌'); } 
          finally { setHidePrices(originalState); setProcessing(false); }
      }, 500);
  };

  const filteredContacts = allContacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()) || c.number.includes(contactSearch));

  // The Invoice Content
  const content = (
      <div id={containerId} className="bg-white w-[148mm] min-h-[210mm] mx-auto p-6 shadow-2xl rounded-sm relative text-gray-900 flex flex-col print:shadow-none print:w-full print:h-auto" style={{ direction: 'rtl' }}>
            <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start">
                <div className="flex items-center gap-3">{companyLogo && <img src={companyLogo} className="w-16 h-16 object-contain"/>}<div><h1 className="text-xl font-black">{tx.company}</h1><p className="text-sm font-bold text-gray-600">حواله خروج کالا (بیجک)</p></div></div>
                <div className="text-left space-y-1"><div className="text-lg font-black border-2 border-black px-3 py-1 rounded">NO: {tx.number}</div><div className="text-sm font-bold">تاریخ: {formatDate(tx.date)}</div></div>
            </div>
            <div className="border rounded-lg p-3 mb-4 bg-gray-50 text-sm print:bg-white print:border-black"><div className="grid grid-cols-2 gap-4"><div><span className="text-gray-500 ml-2">تحویل گیرنده:</span> <span className="font-bold">{tx.recipientName}</span></div><div><span className="text-gray-500 ml-2">مقصد:</span> <span className="font-bold">{tx.destination || '-'}</span></div><div><span className="text-gray-500 ml-2">راننده:</span> <span className="font-bold">{tx.driverName || '-'}</span></div><div><span className="text-gray-500 ml-2">پلاک:</span> <span className="font-bold font-mono dir-ltr">{tx.plateNumber || '-'}</span></div></div></div>
            <div className="flex-1"><table className="w-full text-sm border-collapse border border-black"><thead className="bg-gray-200 print:bg-gray-100"><tr><th className="border border-black p-2 w-10 text-center">#</th><th className="border border-black p-2">شرح کالا</th><th className="border border-black p-2 w-20 text-center">تعداد</th><th className="border border-black p-2 w-24 text-center">وزن (KG)</th>{!hidePrices && <th className="border border-black p-2 w-28 text-center">فی (ریال)</th>}</tr></thead><tbody>{tx.items.map((item, idx) => (<tr key={idx}><td className="border border-black p-2 text-center">{idx + 1}</td><td className="border border-black p-2 font-bold">{item.itemName}</td><td className="border border-black p-2 text-center">{item.quantity}</td><td className="border border-black p-2 text-center">{item.weight}</td>{!hidePrices && <td className="border border-black p-2 text-center font-mono">{item.unitPrice ? formatCurrency(item.unitPrice).replace('ریال', '') : '-'}</td>}</tr>))}<tr className="bg-gray-100 font-bold print:bg-white"><td colSpan={2} className="border border-black p-2 text-left pl-4">جمع کل:</td><td className="border border-black p-2 text-center">{tx.items.reduce((a,b)=>a+b.quantity,0)}</td><td className="border border-black p-2 text-center">{tx.items.reduce((a,b)=>a+b.weight,0)}</td>{!hidePrices && <td className="border border-black p-2 bg-gray-200"></td>}</tr></tbody></table>{tx.description && <div className="mt-4 border p-2 rounded text-sm"><span className="font-bold block mb-1">توضیحات:</span>{tx.description}</div>}</div>
            <div className="mt-8 pt-8 border-t-2 border-black grid grid-cols-3 gap-8 text-center"><div><div className="mb-8 font-bold text-sm">تحویل دهنده (انبار)</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div><div><div className="mb-8 font-bold text-sm">تایید مدیریت</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div><div><div className="mb-8 font-bold text-sm">تحویل گیرنده (راننده)</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div></div>
      </div>
  );

  if (embed) return content;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto animate-fade-in no-print">
        <div className="bg-white p-3 rounded-xl shadow-lg absolute top-4 left-4 z-50 flex flex-col gap-2 w-64">
            <div className="flex justify-between items-center border-b pb-2"><span className="font-bold text-sm">پنل عملیات</span><button onClick={onClose}><X size={20} className="text-gray-400 hover:text-red-500"/></button></div>
            <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded"><input type="checkbox" checked={hidePrices} onChange={e => setHidePrices(e.target.checked)} id="hidePrice"/><label htmlFor="hidePrice" className="cursor-pointer">مخفی کردن قیمت‌ها</label></div>
            <button onClick={handleDownloadPDF} disabled={processing} className="bg-gray-100 text-gray-700 p-2 rounded text-sm hover:bg-gray-200 flex items-center justify-center gap-2">{processing ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>} دانلود PDF</button>
            <button onClick={handlePrint} className="bg-blue-600 text-white p-2 rounded text-sm hover:bg-blue-700 flex items-center justify-center gap-2"><Printer size={16}/> چاپ</button>
            
            <div className="border-t pt-2 mt-1 space-y-2 relative">
                <button onClick={() => { if(settings?.defaultWarehouseGroup) generateAndSend(settings.defaultWarehouseGroup, true, "📦 *حواله خروج (نسخه انبار)*"); else alert("تنظیم نشده"); }} disabled={processing} className="w-full bg-orange-100 text-orange-700 p-2 rounded text-xs hover:bg-orange-200 flex items-center justify-center gap-2 border border-orange-200">ارسال به انبار (بدون فی)</button>
                <button onClick={() => { if(settings?.defaultSalesManager) generateAndSend(settings.defaultSalesManager, false, "📑 *حواله خروج (نسخه مدیریت)*"); else alert("تنظیم نشده"); }} disabled={processing} className="w-full bg-green-100 text-green-700 p-2 rounded text-xs hover:bg-green-200 flex items-center justify-center gap-2 border border-green-200">ارسال به مدیر (با فی)</button>
                
                <button onClick={() => setShowContactSelect(!showContactSelect)} className="w-full bg-white border text-gray-700 p-2 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-2"><Share2 size={14}/> انتخاب مخاطب</button>
                
                {showContactSelect && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-200 z-[100] animate-fade-in flex flex-col h-64 overflow-hidden">
                        <div className="p-2 border-b bg-gray-50 flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-600">لیست مخاطبین</span>
                            <button onClick={() => setShowContactSelect(false)} className="text-red-500 hover:bg-red-50 rounded p-1"><X size={14}/></button>
                        </div>
                        <div className="p-2 border-b bg-gray-50 flex items-center gap-2">
                            <Search size={14} className="text-gray-400"/>
                            <input className="bg-transparent text-xs w-full outline-none" placeholder="جستجو..." autoFocus value={contactSearch} onChange={e => setContactSearch(e.target.value)}/>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {contactsLoading ? (
                                <div className="p-4 text-center text-xs text-gray-400 flex flex-col items-center gap-1"><Loader2 size={16} className="animate-spin"/> در حال بارگذاری...</div>
                            ) : filteredContacts.length === 0 ? (
                                <div className="p-4 text-center text-xs text-gray-400">مخاطبی یافت نشد</div>
                            ) : (
                                filteredContacts.map(c => (
                                    <button key={c.id} onClick={() => generateAndSend(c.number, hidePrices, "📄 *بیجک ارسالی*")} className="w-full text-right p-2 hover:bg-blue-50 text-xs border-b last:border-0 flex items-center gap-2">
                                        <div className={`p-1.5 rounded-full ${c.isGroup ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'}`}>
                                            {c.isGroup ? <Users size={12}/> : <Smartphone size={12}/>}
                                        </div>
                                        <div className="truncate">
                                            <div className="font-bold text-gray-800">{c.name}</div>
                                            <div className="text-[10px] text-gray-500 font-mono">{c.number}</div>
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                        <div className="p-2 border-t bg-gray-50">
                            <button onClick={() => { const num = prompt("شماره را وارد کنید:"); if(num) generateAndSend(num, hidePrices, "📄 *بیجک ارسالی*"); }} className="w-full text-center text-xs text-blue-600 font-bold hover:underline">ورود دستی شماره</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
        {content}
    </div>
  );
};
export default PrintBijak;
