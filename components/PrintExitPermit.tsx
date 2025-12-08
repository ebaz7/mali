
import React, { useState } from 'react';
import { ExitPermit, ExitPermitStatus, SystemSettings } from '../types';
import { formatDate } from '../constants';
import { X, Printer, Image as ImageIcon, FileDown, Loader2, CheckCircle, XCircle, Share2, Truck, Package, MapPin, User, Users, Phone } from 'lucide-react';
import { apiCall } from '../services/apiService';

interface Props {
  permit: ExitPermit;
  onClose: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  settings?: SystemSettings;
}

const PrintExitPermit: React.FC<Props> = ({ permit, onClose, onApprove, onReject, settings }) => {
  const [processing, setProcessing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showContactSelect, setShowContactSelect] = useState(false);

  // Helper for Stamps
  const Stamp = ({ title, name, date }: { title: string, name: string, date?: string }) => (
      <div className="border-2 border-blue-800 text-blue-800 rounded-lg p-2 rotate-[-5deg] opacity-90 inline-block bg-white/80">
          <div className="text-[10px] font-bold border-b border-blue-800 mb-1 pb-1 text-center">{title}</div>
          <div className="text-sm font-bold text-center">{name}</div>
          {date && <div className="text-[9px] text-center mt-1">{date}</div>}
      </div>
  );

  const handlePrint = () => { window.print(); };

  const handleDownloadImage = async () => {
      setProcessing(true);
      const element = document.getElementById('print-area-exit');
      if(element) {
          // @ts-ignore
          const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
          const link = document.createElement('a');
          link.href = canvas.toDataURL('image/png');
          link.download = `Permit_${permit.permitNumber}.png`;
          link.click();
      }
      setProcessing(false);
  };

  const handleSendWhatsApp = async (target: string) => {
      setSharing(true);
      setShowContactSelect(false);
      const element = document.getElementById('print-area-exit');
      if(!element) return;
      try {
          // @ts-ignore
          const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
          const base64 = canvas.toDataURL('image/png').split(',')[1];
          
          let caption = `🚛 *مجوز خروج بار #${permit.permitNumber}*\n`;
          
          // Legacy check or Multi-row check
          const items = permit.items && permit.items.length > 0 ? permit.items : [{goodsName: permit.goodsName, cartonCount: permit.cartonCount, weight: permit.weight}];
          const dests = permit.destinations && permit.destinations.length > 0 ? permit.destinations : [{recipientName: permit.recipientName, address: permit.destinationAddress, phone: ''}];

          caption += `📦 اقلام:\n`;
          items.forEach((i: any) => caption += `- ${i.goodsName} (${i.cartonCount} کارتن)\n`);
          
          caption += `📍 مقاصد:\n`;
          dests.forEach((d: any) => caption += `- ${d.recipientName}: ${d.address}\n`);

          if(permit.plateNumber) caption += `🚚 پلاک: ${permit.plateNumber}\n`;
          caption += `📅 تاریخ: ${formatDate(permit.date)}`;

          await apiCall('/send-whatsapp', 'POST', { number: target, message: caption, mediaData: { data: base64, mimeType: 'image/png', filename: 'permit.png' } });
          alert('ارسال شد');
      } catch(e) { alert('خطا در ارسال'); } finally { setSharing(false); }
  };

  // Prepare data for rendering (Legacy compatibility)
  const displayItems = permit.items && permit.items.length > 0 
      ? permit.items 
      : [{ id: 'legacy', goodsName: permit.goodsName || '', cartonCount: permit.cartonCount || 0, weight: permit.weight || 0 }];

  const displayDestinations = permit.destinations && permit.destinations.length > 0
      ? permit.destinations
      : [{ id: 'legacy', recipientName: permit.recipientName || '', address: permit.destinationAddress || '', phone: '' }];

  const totalCartons = displayItems.reduce((acc, i) => acc + (Number(i.cartonCount) || 0), 0);
  const totalWeight = displayItems.reduce((acc, i) => acc + (Number(i.weight) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
        <div className="bg-white p-3 rounded-xl shadow-lg absolute top-4 left-4 z-50 flex flex-col gap-2 no-print w-48">
            <button onClick={onClose} className="self-end text-gray-400 hover:text-red-500"><X size={20}/></button>
            {onApprove && <button onClick={onApprove} className="bg-green-600 text-white p-2 rounded flex items-center gap-2 justify-center"><CheckCircle size={16}/> تایید</button>}
            {onReject && <button onClick={onReject} className="bg-red-600 text-white p-2 rounded flex items-center gap-2 justify-center"><XCircle size={16}/> رد</button>}
            <hr className="my-1"/>
            <button onClick={handleDownloadImage} disabled={processing} className="bg-gray-100 p-2 rounded text-sm hover:bg-gray-200">دانلود تصویر</button>
            <button onClick={handlePrint} className="bg-blue-600 text-white p-2 rounded text-sm hover:bg-blue-700">چاپ</button>
            <div className="relative">
                <button onClick={() => setShowContactSelect(!showContactSelect)} disabled={sharing} className="w-full bg-green-500 text-white p-2 rounded text-sm hover:bg-green-600 flex items-center justify-center gap-2">{sharing ? <Loader2 size={16} className="animate-spin"/> : <Share2 size={16}/>} واتساپ</button>
                {showContactSelect && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white shadow-xl rounded-xl border z-50 max-h-60 overflow-y-auto">
                        {settings?.savedContacts?.map(c => (
                            <button key={c.id} onClick={() => handleSendWhatsApp(c.number)} className="w-full text-right p-2 hover:bg-gray-100 border-b text-xs flex items-center gap-2">
                                <Users size={12}/> {c.name}
                            </button>
                        ))}
                        <button onClick={() => { const n = prompt('شماره:'); if(n) handleSendWhatsApp(n); }} className="w-full text-center p-2 text-xs text-blue-600 font-bold">شماره دستی</button>
                    </div>
                )}
            </div>
        </div>

        <div id="print-area-exit" className="bg-white w-[210mm] min-h-[148mm] mx-auto p-8 shadow-2xl rounded-sm relative text-gray-900 flex flex-col" style={{ direction: 'rtl' }}>
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
                <div className="flex items-center gap-4">
                    {settings?.pwaIcon && <img src={settings.pwaIcon} className="w-16 h-16 object-contain"/>}
                    <div>
                        <h1 className="text-2xl font-black mb-1">مجوز خروج کالا</h1>
                        <p className="text-sm font-bold text-gray-600">شرکت تولیدی صنعتی</p>
                    </div>
                </div>
                <div className="text-left space-y-1">
                    <div className="text-lg font-black">شماره: {permit.permitNumber}</div>
                    <div className="text-sm">تاریخ: {formatDate(permit.date)}</div>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-6">
                
                {/* Goods Table */}
                <div>
                    <h3 className="font-bold text-sm mb-2 border-b border-gray-300 pb-1 flex items-center gap-2"><Package size={16}/> مشخصات کالا</h3>
                    <table className="w-full text-sm border-collapse border border-gray-400">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="border border-gray-400 p-2 w-10 text-center">ردیف</th>
                                <th className="border border-gray-400 p-2">شرح کالا</th>
                                <th className="border border-gray-400 p-2 w-24 text-center">تعداد کارتن</th>
                                <th className="border border-gray-400 p-2 w-24 text-center">وزن (KG)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayItems.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="border border-gray-400 p-2 text-center">{idx + 1}</td>
                                    <td className="border border-gray-400 p-2 font-bold">{item.goodsName}</td>
                                    <td className="border border-gray-400 p-2 text-center">{item.cartonCount}</td>
                                    <td className="border border-gray-400 p-2 text-center">{item.weight}</td>
                                </tr>
                            ))}
                            <tr className="bg-gray-50 font-bold">
                                <td colSpan={2} className="border border-gray-400 p-2 text-left pl-4">جمع کل:</td>
                                <td className="border border-gray-400 p-2 text-center">{totalCartons}</td>
                                <td className="border border-gray-400 p-2 text-center">{totalWeight}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Destinations List */}
                <div>
                    <h3 className="font-bold text-sm mb-2 border-b border-gray-300 pb-1 flex items-center gap-2"><MapPin size={16}/> مقصد و گیرنده</h3>
                    <div className="space-y-2">
                        {displayDestinations.map((dest, idx) => (
                            <div key={idx} className="border border-gray-300 rounded p-2 flex gap-4 text-sm bg-gray-50">
                                <div className="font-bold min-w-[150px] flex items-center gap-1"><User size={14}/> {dest.recipientName}</div>
                                {dest.phone && <div className="font-mono text-gray-600 flex items-center gap-1"><Phone size={12}/> {dest.phone}</div>}
                                <div className="flex-1 flex items-start gap-1"><MapPin size={14} className="mt-0.5 text-gray-500"/> {dest.address}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {(permit.driverName || permit.plateNumber) && (
                    <div className="grid grid-cols-2 gap-4 border rounded p-3 bg-gray-50 text-sm">
                        <div><span className="text-gray-500 ml-2">نام راننده:</span> <span className="font-bold">{permit.driverName || '-'}</span></div>
                        <div><span className="text-gray-500 ml-2">شماره پلاک:</span> <span className="font-bold font-mono text-lg">{permit.plateNumber || '-'}</span></div>
                    </div>
                )}

                {permit.description && (
                    <div className="border rounded p-3 text-sm">
                        <span className="font-bold text-xs text-gray-500 block mb-1">توضیحات:</span>
                        {permit.description}
                    </div>
                )}
            </div>

            {/* Footer Signatures */}
            <div className="mt-8 pt-4 border-t-2 border-black grid grid-cols-3 gap-4 text-center">
                <div className="flex flex-col items-center justify-end h-24">
                    <div className="mb-2 font-bold text-sm">{permit.requester}</div>
                    <div className="text-xs text-gray-500 border-t w-full pt-1">مدیر فروش (درخواست کننده)</div>
                </div>
                <div className="flex flex-col items-center justify-end h-24">
                    <div className="mb-2">
                        {permit.approverCeo ? <Stamp title="تایید مدیریت عامل" name={permit.approverCeo} /> : <span className="text-gray-300 text-xs">امضا نشده</span>}
                    </div>
                    <div className="text-xs text-gray-500 border-t w-full pt-1">مدیر عامل</div>
                </div>
                <div className="flex flex-col items-center justify-end h-24">
                    <div className="mb-2">
                        {permit.approverFactory ? <Stamp title="خروج از کارخانه" name={permit.approverFactory} /> : <span className="text-gray-300 text-xs">امضا نشده</span>}
                    </div>
                    <div className="text-xs text-gray-500 border-t w-full pt-1">مدیر کارخانه / انتظامات</div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default PrintExitPermit;
