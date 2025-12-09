
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

  // Added delay to ensure DOM is ready for print
  const handlePrint = () => {
      setProcessing(true);
      setTimeout(() => {
          window.print();
          setProcessing(false);
      }, 1000);
  };

  const handleDownloadPDF = async () => {
      setProcessing(true);
      const element = document.getElementById(containerId);
      if (!element) { 
          alert("خطا: محدوده پرینت یافت نشد.");
          setProcessing(false); 
          return; 
      }
      try {
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait for render
          // @ts-ignore
          const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
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
      if (!target) { alert("شماره مخاطب/مدیر تنظیم نشده است. لطفا در تنظیمات انبار بررسی کنید."); return; }
      setProcessing(true);
      const originalState = hidePrices;
      setHidePrices(shouldHidePrice);

      // Increased timeout to 1500ms to ensure DOM update is fully visible before capture
      setTimeout(async () => {
          try {
              const element = document.getElementById(containerId);
              if (!element) throw new Error("Element not found");

              // @ts-ignore
              const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
              const base64 = canvas.toDataURL('image/png').split(',')[1];

              let caption = `${captionPrefix}\nشماره: ${tx.number}\nگیرنده: ${tx.recipientName}\nتعداد: ${tx.items.length} قلم`;

              await apiCall('/send-whatsapp', 'POST', {
                  number: target,
                  message: caption,
                  mediaData: { data: base64, mimeType: 'image/png', filename: `Bijak_${tx.number}.png` }
              });
              if (!embed) alert('ارسال شد ✅');
          } catch (e) { console.error(e); if (!embed) alert('خطا در ارسال ❌'); } 
          finally { 
              setHidePrices(originalState); 
              setProcessing(false); 
              setShowContactSelect(false);
          }
      }, 1500); 
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
            <div className="mt-8 pt-8 border-t-2 border-black grid grid-cols-3 gap-8 text-center"><div><div className="mb-8 font-bold text-sm">ثبت کننده (انبار)</div><div className="mb-2 font-bold text-xs">{tx.createdBy || 'کاربر انبار'}</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div><div><div className="mb-8 font-bold text-sm">تایید مدیریت</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div><div><div className="mb-8 font-bold text-sm">تحویل گیرنده (راننده)</div><div className="border-b border-gray-400 w-2/3 mx-auto"></div></div></div>
      </div>
  );

  if (embed) return content;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto animate-fade-in no-print">
        
        {/* Main Controls */}
        <div className="bg-white p-3 rounded-xl shadow-lg absolute top-4 left-4 z-50 flex flex-col gap-2 w-64">
            <div className="flex justify-between items-center border-b pb-2"><span className="font-bold text-sm">پنل عملیات</span><button onClick={onClose}><X size={20} className="text-gray-400 hover:text-red-500"/></button></div>
            <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 p-2 rounded"><input type="checkbox" checked={hidePrices} onChange={e => setHidePrices(e.target.checked)} id="hidePrice"/><label htmlFor="hidePrice" className="cursor-pointer">مخفی کردن قیمت‌ها</label></div>
            <button onClick={handleDownloadPDF} disabled={processing} className="bg-gray-100 text-gray-700 p-2 rounded text-sm hover:bg-gray-200 flex items-center justify-center gap-2">{processing ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>} دانلود PDF</button>
            <button onClick={handlePrint} disabled={processing} className="bg-blue-600 text-white p-2 rounded text-sm hover:bg-blue-700 flex items-center justify-center gap-2">{processing ? <Loader2 size={16} className="animate-spin"/> : <Printer size={16}/>} چاپ</button>
            
            <div className="border-t pt-2 mt-1 space-y-2">
                <button onClick={() => { if(settings?.defaultWarehouseGroup) generateAndSend(settings.defaultWarehouseGroup, true, "📦 *حواله خروج (نسخه انبار)*"); else alert("شماره گروه انبار در تنظیمات تعیین نشده است."); }} disabled={processing} className="w-full bg-orange-100 text-orange-700 p-2 rounded text-xs hover:bg-orange-200 flex items-center justify-center gap-2 border border-orange-200">{processing ? <Loader2 size={14} className="animate-spin"/> : 'ارسال به انبار (بدون فی)'}</button>
                <button onClick={() => { if(settings?.defaultSalesManager) generateAndSend(settings.defaultSalesManager, false, "📑 *حواله خروج (نسخه مدیریت)*"); else alert("شماره مدیر فروش در تنظیمات تعیین نشده است."); }} disabled={processing} className="w-full bg-green-100 text-green-700 p-2 rounded text-xs hover:bg-green-200 flex items-center justify-center gap-2 border border-green-200">{processing ? <Loader2 size={14} className="animate-spin"/> : 'ارسال به مدیر (با فی)'}</button>
                
                <button onClick={() => setShowContactSelect(true)} className="w-full bg-white border text-gray-700 p-2 rounded text-xs hover:bg-gray-50 flex items-center justify-center gap-2"><Share2 size={14}/> انتخاب مخاطب</button>
            </div>
        </div>

        {/* Contact Select Modal (Centered) */}
        {showContactSelect && (
            <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col h-[70vh] animate-fade-in">
                    <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                        <span className="font-bold text-gray-800">انتخاب مخاطب برای ارسال</span>
                        <button onClick={() => setShowContactSelect(false)} className="bg-red-100 text-red-600 rounded-lg p-1.5 hover:bg-red-200"><X size={18}/></button>
                    </div>
                    <div className="p-3 border-b">
                        <div className="bg-gray-100 rounded-lg flex items-center px-3 py-2">
                            <Search size={18} className="text-gray-400 ml-2"/>
                            <input className="bg-transparent w-full outline-none text-sm" placeholder="جستجو نام یا شماره..." autoFocus value={contactSearch} onChange={e => setContactSearch(e.target.value)}/>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {contactsLoading ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2"><Loader2 size={32} className="animate-spin"/> <span>در حال دریافت لیست...</span></div>
                        ) : filteredContacts.length === 0 ? (
                            <div className="text-center text-gray-400 mt-10">مخاطبی یافت نشد</div>
                        ) : (
                            filteredContacts.map(c => (
                                <button key={c.id} onClick={() => generateAndSend(c.number, hidePrices, "📄 *بیجک ارسالی*")} className="w-full text-right p-3 hover:bg-blue-50 rounded-xl border border-transparent hover:border-blue-100 flex items-center gap-3 transition-colors group">
                                    <div className={`p-2 rounded-full ${c.isGroup ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {c.isGroup ? <Users size={18}/> : <Smartphone size={18}/>}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-gray-800 text-sm group-hover:text-blue-700">{c.name}</div>
                                        <div className="text-xs text-gray-500 font-mono mt-0.5">{c.number}</div>
                                    </div>
                                    <div className="bg-gray-100 px-3 py-1 rounded-lg text-xs font-bold text-gray-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">ارسال</div>
                                </button>
                            ))
                        )}
                    </div>
                    <div className="p-3 border-t bg-gray-50">
                        <button onClick={() => { const num = prompt("شماره را وارد کنید (مثال: 98912...):"); if(num) generateAndSend(num, hidePrices, "📄 *بیجک ارسالی*"); }} className="w-full bg-white border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-100 transition-colors">ورود شماره دستی</button>
                    </div>
                </div>
            </div>
        )}

        {content}
    </div>
  );
};
export default PrintBijak;
