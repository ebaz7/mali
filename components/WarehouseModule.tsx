
import React, { useState, useEffect, useMemo } from 'react';
import { User, SystemSettings, WarehouseItem, WarehouseTransaction, WarehouseTransactionItem } from '../types';
import { getWarehouseItems, saveWarehouseItem, deleteWarehouseItem, getWarehouseTransactions, saveWarehouseTransaction, deleteWarehouseTransaction, getNextBijakNumber } from '../services/storageService';
import { generateUUID, getCurrentShamsiDate, jalaliToGregorian, formatNumberString, deformatNumberString, formatDate } from '../constants';
import { Package, Plus, Trash2, ArrowDownCircle, ArrowUpCircle, FileText, BarChart3, Eye, Loader2, AlertTriangle, Settings, ArrowLeftRight, Search, FileClock } from 'lucide-react';
import PrintBijak from './PrintBijak';
import { apiCall } from '../services/apiService';

interface Props { currentUser: User; settings?: SystemSettings; }

const WarehouseModule: React.FC<Props> = ({ currentUser, settings }) => {
    const [loadingData, setLoadingData] = useState(true);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'items' | 'entry' | 'exit' | 'reports'>('dashboard');
    const [items, setItems] = useState<WarehouseItem[]>([]);
    const [transactions, setTransactions] = useState<WarehouseTransaction[]>([]);
    
    const [newItemName, setNewItemName] = useState('');
    const [newItemCode, setNewItemCode] = useState('');
    const [newItemUnit, setNewItemUnit] = useState('عدد');

    const currentShamsi = getCurrentShamsiDate();
    const [txDate, setTxDate] = useState({ year: currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day });
    const [selectedCompany, setSelectedCompany] = useState('');
    const [txItems, setTxItems] = useState<Partial<WarehouseTransactionItem>[]>([{ itemId: '', quantity: 0, weight: 0, unitPrice: 0 }]);
    const [proformaNumber, setProformaNumber] = useState('');
    const [recipientName, setRecipientName] = useState('');
    const [driverName, setDriverName] = useState('');
    const [plateNumber, setPlateNumber] = useState('');
    const [destination, setDestination] = useState('');
    const [nextBijakNum, setNextBijakNum] = useState<number>(0);
    const [viewBijak, setViewBijak] = useState<WarehouseTransaction | null>(null);
    const [reportFilterCompany, setReportFilterCompany] = useState('');
    const [reportFilterItem, setReportFilterItem] = useState('');
    const [reportSearch, setReportSearch] = useState('');
    const [createdTxForAutoSend, setCreatedTxForAutoSend] = useState<WarehouseTransaction | null>(null);

    useEffect(() => { loadData(); }, []);
    useEffect(() => { if(selectedCompany && activeTab === 'exit' && settings) { updateNextBijak(); } }, [selectedCompany, activeTab, settings]);

    const loadData = async () => { setLoadingData(true); try { const [i, t] = await Promise.all([getWarehouseItems(), getWarehouseTransactions()]); setItems(i || []); setTransactions(t || []); } catch (e) { console.error(e); } finally { setLoadingData(false); } };
    const updateNextBijak = async () => { if(selectedCompany) { const num = await getNextBijakNumber(selectedCompany); setNextBijakNum(num); } };
    const getIsoDate = () => { try { const date = jalaliToGregorian(txDate.year, txDate.month, txDate.day); return date.toISOString(); } catch { return new Date().toISOString(); } };
    const handleAddItem = async () => { if(!newItemName) return; await saveWarehouseItem({ id: generateUUID(), name: newItemName, code: newItemCode, unit: newItemUnit }); setNewItemName(''); setNewItemCode(''); loadData(); };
    const handleDeleteItem = async (id: string) => { if(confirm('حذف شود؟')) { await deleteWarehouseItem(id); loadData(); } };
    const handleAddTxItemRow = () => setTxItems([...txItems, { itemId: '', quantity: 0, weight: 0, unitPrice: 0 }]);
    const handleRemoveTxItemRow = (idx: number) => setTxItems(txItems.filter((_, i) => i !== idx));
    const updateTxItem = (idx: number, field: keyof WarehouseTransactionItem, val: any) => { const newItems = [...txItems]; newItems[idx] = { ...newItems[idx], [field]: val }; if(field === 'itemId') { const item = items.find(i => i.id === val); if(item) newItems[idx].itemName = item.name; } setTxItems(newItems); };

    const handleSubmitTx = async (type: 'IN' | 'OUT') => {
        if(!selectedCompany) { alert('شرکت را انتخاب کنید'); return; }
        if(txItems.some(i => !i.itemId || !i.quantity)) { alert('اقلام را کامل کنید'); return; }

        const validItems = txItems.map(i => ({ itemId: i.itemId!, itemName: i.itemName!, quantity: Number(i.quantity), weight: Number(i.weight), unitPrice: Number(i.unitPrice)||0 }));
        const tx: WarehouseTransaction = { id: generateUUID(), type, date: getIsoDate(), company: selectedCompany, number: type === 'IN' ? 0 : nextBijakNum, items: validItems, createdAt: Date.now(), createdBy: currentUser.fullName, proformaNumber: type === 'IN' ? proformaNumber : undefined, recipientName: type === 'OUT' ? recipientName : undefined, driverName: type === 'OUT' ? driverName : undefined, plateNumber: type === 'OUT' ? plateNumber : undefined, destination: type === 'OUT' ? destination : undefined };

        await saveWarehouseTransaction(tx);
        await loadData();
        
        // Auto Send Logic with Detailed Caption
        if(type === 'OUT') {
            setCreatedTxForAutoSend(tx);
            setTimeout(async () => {
                const managerElement = document.getElementById(`print-bijak-${tx.id}-price`);
                const warehouseElement = document.getElementById(`print-bijak-${tx.id}-noprice`);
                
                // Detailed Caption Construction
                let caption = `📦 *حواله خروج کالا (بیجک)*\n`;
                caption += `📄 شماره: ${tx.number}\n`;
                caption += `🏭 شرکت: ${tx.company}\n`;
                caption += `📅 تاریخ: ${formatDate(tx.date)}\n`;
                caption += `👤 گیرنده: ${tx.recipientName}\n`;
                
                caption += `\n📝 *لیست اقلام:* \n`;
                tx.items.forEach((item, idx) => {
                    caption += `${idx + 1}. ${item.itemName} | تعداد: ${item.quantity}\n`;
                });

                if(tx.driverName) caption += `\n🚛 راننده: ${tx.driverName}`;
                if(tx.plateNumber) caption += ` | پلاک: ${tx.plateNumber}`;
                if(tx.destination) caption += `\n📍 مقصد: ${tx.destination}`;

                if (settings) {
                    try {
                        // 1. Send to Sales Manager (With Prices)
                        if (settings.defaultSalesManager && managerElement) {
                            // @ts-ignore
                            const canvas = await window.html2canvas(managerElement, { scale: 2, backgroundColor: '#ffffff' });
                            const base64 = canvas.toDataURL('image/png').split(',')[1];
                            
                            await apiCall('/send-whatsapp', 'POST', { 
                                number: settings.defaultSalesManager, 
                                message: caption + "\n\n(نسخه مدیریتی - همراه با قیمت)", 
                                mediaData: { data: base64, mimeType: 'image/png', filename: `Bijak_${tx.number}_Price.png` } 
                            });
                        }

                        // 2. Send to Warehouse Group (No Prices)
                        if (settings.defaultWarehouseGroup && warehouseElement) {
                            // @ts-ignore
                            const canvas = await window.html2canvas(warehouseElement, { scale: 2, backgroundColor: '#ffffff' });
                            const base64 = canvas.toDataURL('image/png').split(',')[1];
                            
                            await apiCall('/send-whatsapp', 'POST', { 
                                number: settings.defaultWarehouseGroup, 
                                message: caption + "\n\n(نسخه انبار - بدون قیمت)", 
                                mediaData: { data: base64, mimeType: 'image/png', filename: `Bijak_${tx.number}.png` } 
                            });
                        }
                    } catch(e) { console.error("Auto send error", e); }
                }
                setViewBijak(tx);
            }, 1500); 
            
            setRecipientName(''); setDriverName(''); setPlateNumber(''); setDestination('');
        } else {
            setProformaNumber(''); alert('ورود کالا ثبت شد.');
        }
        setTxItems([{ itemId: '', quantity: 0, weight: 0, unitPrice: 0 }]);
    };

    const handleDeleteTx = async (id: string) => { if(confirm('حذف تراکنش؟')) { await deleteWarehouseTransaction(id); loadData(); } };
    
    // ... (Keep existing memoized calculations) ...
    const kardexData = useMemo(() => {
        let runningBalance = 0; const movements: any[] = []; transactions.forEach(tx => { if(reportFilterCompany && tx.company !== reportFilterCompany) return; tx.items.forEach(item => { if(reportFilterItem && item.itemId !== reportFilterItem) return; if(reportSearch) { const search = reportSearch.toLowerCase(); const matches = item.itemName.toLowerCase().includes(search) || tx.number.toString().includes(search) || (tx.recipientName && tx.recipientName.toLowerCase().includes(search)) || (tx.proformaNumber && tx.proformaNumber.toLowerCase().includes(search)); if(!matches) return; } movements.push({ date: tx.date, txId: tx.id, type: tx.type, company: tx.company, docNumber: tx.number, desc: tx.type === 'IN' ? `پروفرما: ${tx.proformaNumber || '-'}` : `گیرنده: ${tx.recipientName || '-'}`, quantity: item.quantity, itemId: item.itemId, itemName: item.itemName }); }); }); movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); const calculated = movements.map(m => { if(m.type === 'IN') runningBalance += m.quantity; else runningBalance -= m.quantity; return { ...m, balance: runningBalance }; }); return calculated.reverse(); 
    }, [transactions, reportFilterCompany, reportFilterItem, reportSearch]);
    const recentBijaks = useMemo(() => transactions.filter(t => t.type === 'OUT').slice(0, 5), [transactions]);

    if (!settings || loadingData) return <div className="flex flex-col items-center justify-center h-[50vh] text-gray-500 gap-2"><Loader2 className="animate-spin text-blue-600" size={32}/><span className="text-sm font-bold">در حال بارگذاری اطلاعات انبار...</span></div>;
    const companyList = settings.companyNames || [];
    if (companyList.length === 0) return (<div className="flex flex-col items-center justify-center h-[60vh] text-center p-6 animate-fade-in"><div className="bg-amber-100 p-4 rounded-full text-amber-600 mb-4 shadow-sm"><AlertTriangle size={48}/></div><h2 className="text-xl font-bold text-gray-800 mb-2">هنوز شرکتی تعریف نشده است</h2><p className="text-gray-600 max-w-md mb-6 leading-relaxed">برای استفاده از سیستم انبار (ثبت رسید و بیجک)، ابتدا باید نام شرکت‌ها را در بخش تنظیمات سیستم وارد کنید.</p><div className="flex gap-2"><button onClick={() => window.location.hash = '#settings'} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg"><Settings size={20}/><span>رفتن به تنظیمات &gt; مدیریت شرکت‌ها</span></button></div></div>);

    const years = Array.from({length:10},(_,i)=>1400+i); const months = Array.from({length:12},(_,i)=>i+1); const days = Array.from({length:31},(_,i)=>i+1);

    return (
        <div className="bg-white rounded-2xl shadow-sm border h-[calc(100vh-100px)] flex flex-col overflow-hidden animate-fade-in relative">
            {/* Hidden Rendering Area for Dual Auto-Send */}
            <div style={{position:'absolute', top:'-9999px', left:'-9999px'}}>
                {createdTxForAutoSend && (
                    <>
                        {/* 1. With Price (For Manager) */}
                        <div id={`print-bijak-${createdTxForAutoSend.id}-price`}>
                            <PrintBijak tx={createdTxForAutoSend} onClose={()=>{}} settings={settings} forceHidePrices={false} embed />
                        </div>
                        {/* 2. Without Price (For Warehouse) */}
                        <div id={`print-bijak-${createdTxForAutoSend.id}-noprice`}>
                            <PrintBijak tx={createdTxForAutoSend} onClose={()=>{}} settings={settings} forceHidePrices={true} embed />
                        </div>
                    </>
                )}
            </div>

            <div className="bg-gray-100 p-2 flex gap-2 border-b overflow-x-auto">
                <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>داشبورد</button>
                <button onClick={() => setActiveTab('items')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'items' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>تعریف کالا</button>
                <button onClick={() => setActiveTab('entry')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'entry' ? 'bg-white text-green-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>ورود کالا (رسید)</button>
                <button onClick={() => setActiveTab('exit')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'exit' ? 'bg-white text-red-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>خروج کالا (بیجک)</button>
                <button onClick={() => setActiveTab('reports')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'reports' ? 'bg-white text-purple-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>گزارشات و کاردکس</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div onClick={() => setActiveTab('items')} className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"><div><div className="text-3xl font-black text-blue-700">{items.length}</div><div className="text-sm text-blue-600 font-bold">تعداد کالاها</div></div><Package size={40} className="text-blue-300"/></div>
                            <div onClick={() => setActiveTab('entry')} className="bg-green-50 p-6 rounded-2xl border border-green-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"><div><div className="text-3xl font-black text-green-700">{transactions.filter(t=>t.type==='IN').length}</div><div className="text-sm text-green-600 font-bold">تعداد رسیدها</div></div><ArrowDownCircle size={40} className="text-green-300"/></div>
                            <div onClick={() => setActiveTab('exit')} className="bg-red-50 p-6 rounded-2xl border border-red-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"><div><div className="text-3xl font-black text-red-700">{transactions.filter(t=>t.type==='OUT').length}</div><div className="text-sm text-red-600 font-bold">تعداد حواله‌ها (بیجک)</div></div><ArrowUpCircle size={40} className="text-red-300"/></div>
                        </div>
                        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm"><div className="bg-gray-50 p-4 border-b flex justify-between items-center"><h3 className="font-bold text-gray-800 flex items-center gap-2"><FileClock size={20}/> آخرین بیجک‌های صادر شده (بایگانی)</h3><button onClick={() => setActiveTab('reports')} className="text-xs text-blue-600 hover:underline">مشاهده کامل</button></div><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-600"><tr><th className="p-3">شماره</th><th className="p-3">تاریخ</th><th className="p-3">شرکت</th><th className="p-3">گیرنده</th><th className="p-3">عملیات</th></tr></thead><tbody className="divide-y">{recentBijaks.length === 0 ? (<tr><td colSpan={5} className="p-6 text-center text-gray-400">هیچ بیجکی صادر نشده است.</td></tr>) : (recentBijaks.map(tx => (<tr key={tx.id} className="hover:bg-gray-50"><td className="p-3 font-mono font-bold text-red-600">#{tx.number}</td><td className="p-3 text-xs">{formatDate(tx.date)}</td><td className="p-3 text-xs font-bold">{tx.company}</td><td className="p-3 text-xs">{tx.recipientName}</td><td className="p-3"><button onClick={() => setViewBijak(tx)} className="text-blue-600 hover:text-blue-800 p-1 flex items-center gap-1"><Eye size={14}/> مشاهده</button></td></tr>)))}</tbody></table></div>
                    </div>
                )}
                {activeTab === 'items' && (<div className="max-w-4xl mx-auto"><div className="bg-gray-50 p-4 rounded-xl border mb-6 flex items-end gap-3"><div className="flex-1 space-y-1"><label className="text-xs font-bold text-gray-500">نام کالا</label><input className="w-full border rounded p-2" value={newItemName} onChange={e=>setNewItemName(e.target.value)}/></div><div className="w-32 space-y-1"><label className="text-xs font-bold text-gray-500">کد کالا</label><input className="w-full border rounded p-2" value={newItemCode} onChange={e=>setNewItemCode(e.target.value)}/></div><div className="w-32 space-y-1"><label className="text-xs font-bold text-gray-500">واحد</label><select className="w-full border rounded p-2 bg-white" value={newItemUnit} onChange={e=>setNewItemUnit(e.target.value)}><option>عدد</option><option>کارتن</option><option>کیلوگرم</option><option>دستگاه</option></select></div><button onClick={handleAddItem} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 h-[42px] w-12 flex items-center justify-center"><Plus/></button></div><div className="bg-white border rounded-xl overflow-hidden"><table className="w-full text-sm text-right"><thead className="bg-gray-100"><tr><th className="p-3">کد</th><th className="p-3">نام کالا</th><th className="p-3">واحد</th><th className="p-3 w-10"></th></tr></thead><tbody>{items.map(i => (<tr key={i.id} className="border-t hover:bg-gray-50"><td className="p-3 font-mono">{i.code}</td><td className="p-3 font-bold">{i.name}</td><td className="p-3">{i.unit}</td><td className="p-3"><button onClick={()=>handleDeleteItem(i.id)} className="text-red-500"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div></div>)}
                {activeTab === 'entry' && (<div className="max-w-4xl mx-auto bg-green-50 p-6 rounded-2xl border border-green-200"><h3 className="font-bold text-green-800 mb-4 flex items-center gap-2"><ArrowDownCircle/> ثبت ورود کالا (رسید انبار)</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-bold mb-1">شرکت مالک</label><select className="w-full border rounded p-2 bg-white" value={selectedCompany} onChange={e=>setSelectedCompany(e.target.value)}><option value="">انتخاب...</option>{companyList.map(c=><option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-xs font-bold mb-1">شماره پروفرما / سند</label><input className="w-full border rounded p-2 bg-white" value={proformaNumber} onChange={e=>setProformaNumber(e.target.value)}/></div><div><label className="block text-xs font-bold mb-1">تاریخ ورود</label><div className="flex gap-1 dir-ltr"><select className="border rounded p-1 text-sm flex-1" value={txDate.year} onChange={e=>setTxDate({...txDate, year:Number(e.target.value)})}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select><select className="border rounded p-1 text-sm flex-1" value={txDate.month} onChange={e=>setTxDate({...txDate, month:Number(e.target.value)})}>{months.map(m=><option key={m} value={m}>{m}</option>)}</select><select className="border rounded p-1 text-sm flex-1" value={txDate.day} onChange={e=>setTxDate({...txDate, day:Number(e.target.value)})}>{days.map(d=><option key={d} value={d}>{d}</option>)}</select></div></div></div><div className="space-y-2 bg-white p-4 rounded-xl border">{txItems.map((row, idx) => (<div key={idx} className="flex gap-2 items-end"><div className="flex-1"><label className="text-[10px] text-gray-500">کالا</label><select className="w-full border rounded p-2 text-sm" value={row.itemId} onChange={e=>updateTxItem(idx, 'itemId', e.target.value)}><option value="">انتخاب کالا...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div><div className="w-24"><label className="text-[10px] text-gray-500">تعداد</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.quantity} onChange={e=>updateTxItem(idx, 'quantity', e.target.value)}/></div><div className="w-24"><label className="text-[10px] text-gray-500">وزن (KG)</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.weight} onChange={e=>updateTxItem(idx, 'weight', e.target.value)}/></div>{idx > 0 && <button onClick={()=>handleRemoveTxItemRow(idx)} className="text-red-500 p-2"><Trash2 size={16}/></button>}</div>))}<button onClick={handleAddTxItemRow} className="text-xs text-blue-600 font-bold flex items-center gap-1 mt-2"><Plus size={14}/> افزودن ردیف کالا</button></div><button onClick={()=>handleSubmitTx('IN')} className="w-full bg-green-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-green-700 shadow-lg">ثبت رسید انبار</button></div>)}
                {activeTab === 'exit' && (<div className="max-w-4xl mx-auto bg-red-50 p-6 rounded-2xl border border-red-200"><h3 className="font-bold text-red-800 mb-4 flex items-center gap-2"><ArrowUpCircle/> ثبت خروج کالا (صدور بیجک)</h3><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4"><div><label className="block text-xs font-bold mb-1">شرکت فرستنده</label><select className="w-full border rounded p-2 bg-white" value={selectedCompany} onChange={e=>setSelectedCompany(e.target.value)}><option value="">انتخاب...</option>{companyList.map(c=><option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-xs font-bold mb-1">شماره بیجک (سیستمی)</label><div className="bg-white p-2 rounded border font-mono text-center text-red-600 font-bold">{nextBijakNum > 0 ? nextBijakNum : '---'}</div></div><div><label className="block text-xs font-bold mb-1">تاریخ خروج</label><div className="flex gap-1 dir-ltr"><select className="border rounded p-1 text-sm flex-1" value={txDate.year} onChange={e=>setTxDate({...txDate, year:Number(e.target.value)})}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select><select className="border rounded p-1 text-sm flex-1" value={txDate.month} onChange={e=>setTxDate({...txDate, month:Number(e.target.value)})}>{months.map(m=><option key={m} value={m}>{m}</option>)}</select><select className="border rounded p-1 text-sm flex-1" value={txDate.day} onChange={e=>setTxDate({...txDate, day:Number(e.target.value)})}>{days.map(d=><option key={d} value={d}>{d}</option>)}</select></div></div><div><label className="block text-xs font-bold mb-1">تحویل گیرنده</label><input className="w-full border rounded p-2 bg-white" value={recipientName} onChange={e=>setRecipientName(e.target.value)}/></div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-bold mb-1">راننده</label><input className="w-full border rounded p-2 bg-white" value={driverName} onChange={e=>setDriverName(e.target.value)}/></div><div><label className="block text-xs font-bold mb-1">پلاک</label><input className="w-full border rounded p-2 bg-white dir-ltr" value={plateNumber} onChange={e=>setPlateNumber(e.target.value)}/></div><div><label className="block text-xs font-bold mb-1">مقصد</label><input className="w-full border rounded p-2 bg-white" value={destination} onChange={e=>setDestination(e.target.value)}/></div></div><div className="space-y-2 bg-white p-4 rounded-xl border">{txItems.map((row, idx) => (<div key={idx} className="flex gap-2 items-end"><div className="flex-1"><label className="text-[10px] text-gray-500">کالا</label><select className="w-full border rounded p-2 text-sm" value={row.itemId} onChange={e=>updateTxItem(idx, 'itemId', e.target.value)}><option value="">انتخاب...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div><div className="w-20"><label className="text-[10px] text-gray-500">تعداد</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.quantity} onChange={e=>updateTxItem(idx, 'quantity', e.target.value)}/></div><div className="w-20"><label className="text-[10px] text-gray-500">وزن</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.weight} onChange={e=>updateTxItem(idx, 'weight', e.target.value)}/></div><div className="w-32"><label className="text-[10px] text-gray-500">فی (ریال)</label><input type="text" className="w-full border rounded p-2 text-sm dir-ltr font-bold text-blue-600" value={formatNumberString(row.unitPrice)} onChange={e=>updateTxItem(idx, 'unitPrice', deformatNumberString(e.target.value))}/></div>{idx > 0 && <button onClick={()=>handleRemoveTxItemRow(idx)} className="text-red-500 p-2"><Trash2 size={16}/></button>}</div>))}<button onClick={handleAddTxItemRow} className="text-xs text-blue-600 font-bold flex items-center gap-1 mt-2"><Plus size={14}/> افزودن ردیف کالا</button></div><button onClick={()=>handleSubmitTx('OUT')} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-red-700 shadow-lg">ثبت و صدور بیجک</button></div>)}
                {activeTab === 'reports' && (<div className="space-y-6"><div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 items-end"><div className="flex-1 w-full"><label className="text-xs font-bold block mb-1">جستجو (کالا/گیرنده/شماره)</label><div className="relative"><input className="w-full border rounded p-2 text-sm pl-8" value={reportSearch} onChange={e=>setReportSearch(e.target.value)} placeholder="..."/><Search size={14} className="absolute left-2 top-2.5 text-gray-400"/></div></div><div className="w-full md:w-48"><label className="text-xs font-bold block mb-1">فیلتر شرکت</label><select className="w-full border rounded p-2 text-sm" value={reportFilterCompany} onChange={e=>setReportFilterCompany(e.target.value)}><option value="">همه شرکت‌ها</option>{companyList.map(c=><option key={c} value={c}>{c}</option>)}</select></div><div className="w-full md:w-48"><label className="text-xs font-bold block mb-1">فیلتر کالا</label><select className="w-full border rounded p-2 text-sm" value={reportFilterItem} onChange={e=>setReportFilterItem(e.target.value)}><option value="">همه کالاها</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div></div><div className="bg-white rounded-xl border shadow-sm overflow-hidden"><div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center"><h3 className="font-bold text-indigo-900 flex items-center gap-2"><ArrowLeftRight size={20}/> کاردکس کالا و گردش انبار</h3><span className="text-xs text-indigo-700 bg-white px-2 py-1 rounded border border-indigo-200">{kardexData.length} رکورد</span></div><div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-indigo-100 text-indigo-900 font-bold border-b border-indigo-200"><tr><th className="p-3 w-32">تاریخ</th><th className="p-3 w-40">نام کالا</th><th className="p-3">شرح عملیات / شرکت</th><th className="p-3 w-20 text-center bg-green-50 text-green-800">وارده</th><th className="p-3 w-20 text-center bg-red-50 text-red-800">صادره</th><th className="p-3 w-24 text-center bg-gray-50 text-gray-800">مانده</th><th className="p-3 w-20 text-center">عملیات</th></tr></thead><tbody className="divide-y divide-gray-100">{kardexData.length === 0 ? (<tr><td colSpan={7} className="p-8 text-center text-gray-400">هیچ تراکنشی یافت نشد.</td></tr>) : (kardexData.map((row, index) => { const txRef = transactions.find(t => t.id === row.txId); return (<tr key={`${row.txId}_${index}`} className="hover:bg-gray-50 transition-colors"><td className="p-3 font-mono text-gray-600 text-xs">{formatDate(row.date)}</td><td className="p-3 font-bold text-gray-800">{row.itemName}</td><td className="p-3"><div className="flex flex-col"><span className="text-xs font-bold text-gray-700">{row.company}</span><span className="text-[10px] text-gray-500">{row.type === 'IN' ? 'رسید' : `بیجک ${row.docNumber}`} | {row.desc}</span></div></td><td className={`p-3 text-center font-mono font-bold ${row.type === 'IN' ? 'text-green-600 bg-green-50/50' : 'text-gray-300'}`}>{row.type === 'IN' ? row.quantity : '-'}</td><td className={`p-3 text-center font-mono font-bold ${row.type === 'OUT' ? 'text-red-600 bg-red-50/50' : 'text-gray-300'}`}>{row.type === 'OUT' ? row.quantity : '-'}</td><td className="p-3 text-center font-mono font-black text-gray-800 bg-gray-50">{row.balance}</td><td className="p-3 text-center flex justify-center gap-1">{row.type === 'OUT' && txRef && (<button onClick={() => setViewBijak(txRef)} className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100" title="مشاهده بیجک"><Eye size={14}/></button>)}<button onClick={() => handleDeleteTx(row.txId)} className="p-1.5 text-red-600 bg-red-50 rounded hover:bg-red-100" title="حذف"><Trash2 size={14}/></button></td></tr>); }))}</tbody></table></div></div></div>)}
            </div>
            {viewBijak && (<PrintBijak tx={viewBijak} onClose={() => setViewBijak(null)} settings={settings} />)}
        </div>
    );
};
export default WarehouseModule;
