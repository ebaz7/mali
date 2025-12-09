
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, SystemSettings, WarehouseItem, WarehouseTransaction, WarehouseTransactionItem } from '../types';
import { getWarehouseItems, saveWarehouseItem, deleteWarehouseItem, getWarehouseTransactions, saveWarehouseTransaction, deleteWarehouseTransaction, updateWarehouseTransaction, getNextBijakNumber } from '../services/storageService';
import { generateUUID, getCurrentShamsiDate, jalaliToGregorian, formatNumberString, deformatNumberString, formatDate, parsePersianDate, getShamsiDateFromIso } from '../constants';
import { Package, Plus, Trash2, ArrowDownCircle, ArrowUpCircle, FileText, BarChart3, Eye, Loader2, AlertTriangle, Settings, ArrowLeftRight, Search, FileClock, Printer, FileDown, Share2, LayoutGrid, Archive, Edit, Save, X } from 'lucide-react';
import PrintBijak from './PrintBijak';
import { apiCall } from '../services/apiService';

interface Props { currentUser: User; settings?: SystemSettings; }

const WarehouseModule: React.FC<Props> = ({ currentUser, settings }) => {
    const [loadingData, setLoadingData] = useState(true);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'items' | 'entry' | 'exit' | 'reports' | 'stock_report' | 'archive'>('dashboard');
    const [items, setItems] = useState<WarehouseItem[]>([]);
    const [transactions, setTransactions] = useState<WarehouseTransaction[]>([]);
    
    // New Item State
    const [newItemName, setNewItemName] = useState('');
    const [newItemCode, setNewItemCode] = useState('');
    const [newItemUnit, setNewItemUnit] = useState('عدد');

    // Transaction State
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
    
    // View/Edit State
    const [viewBijak, setViewBijak] = useState<WarehouseTransaction | null>(null);
    const [editingBijak, setEditingBijak] = useState<WarehouseTransaction | null>(null); // For Edit Modal
    
    // Reports State
    const [reportFilterCompany, setReportFilterCompany] = useState('');
    const [reportFilterItem, setReportFilterItem] = useState('');
    const [archiveFilterCompany, setArchiveFilterCompany] = useState('');
    const [reportSearch, setReportSearch] = useState('');
    const [processingExport, setProcessingExport] = useState(false);
    
    // Auto Send
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
        
        if(type === 'OUT') {
            setCreatedTxForAutoSend(tx);
            setTimeout(async () => {
                const managerElement = document.getElementById(`print-bijak-${tx.id}-price`);
                const warehouseElement = document.getElementById(`print-bijak-${tx.id}-noprice`);
                
                let caption = `📦 *حواله خروج کالا (بیجک)*\n📄 شماره: ${tx.number}\n🏭 شرکت: ${tx.company}\n📅 تاریخ: ${formatDate(tx.date)}\n👤 گیرنده: ${tx.recipientName}\n\n📝 *لیست اقلام:* \n`;
                tx.items.forEach((item, idx) => { caption += `${idx + 1}. ${item.itemName} | تعداد: ${item.quantity}\n`; });
                if(tx.driverName) caption += `\n🚛 راننده: ${tx.driverName}`;
                if(tx.plateNumber) caption += ` | پلاک: ${tx.plateNumber}`;
                if(tx.destination) caption += `\n📍 مقصد: ${tx.destination}`;

                if (settings) {
                    try {
                        if (settings.defaultSalesManager && managerElement) {
                            // @ts-ignore
                            const canvas = await window.html2canvas(managerElement, { scale: 2, backgroundColor: '#ffffff' });
                            const base64 = canvas.toDataURL('image/png').split(',')[1];
                            await apiCall('/send-whatsapp', 'POST', { number: settings.defaultSalesManager, message: caption + "\n\n(نسخه مدیریتی - همراه با قیمت)", mediaData: { data: base64, mimeType: 'image/png', filename: `Bijak_${tx.number}_Price.png` } });
                        }
                        if (settings.defaultWarehouseGroup && warehouseElement) {
                            // @ts-ignore
                            const canvas = await window.html2canvas(warehouseElement, { scale: 2, backgroundColor: '#ffffff' });
                            const base64 = canvas.toDataURL('image/png').split(',')[1];
                            await apiCall('/send-whatsapp', 'POST', { number: settings.defaultWarehouseGroup, message: caption + "\n\n(نسخه انبار - بدون قیمت)", mediaData: { data: base64, mimeType: 'image/png', filename: `Bijak_${tx.number}.png` } });
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
    
    // --- EDIT BIJAK LOGIC ---
    const handleEditBijakSave = async (updatedTx: WarehouseTransaction) => {
        try {
            await updateWarehouseTransaction(updatedTx);
            setEditingBijak(null);
            loadData();
            alert('بیجک با موفقیت ویرایش شد.');
        } catch (e) {
            alert('خطا در ویرایش بیجک');
        }
    };

    // --- KARDEX LOGIC (Sorted by Date) ---
    const kardexData = useMemo(() => {
        if (!reportFilterCompany) return []; // Only show if company selected
        let runningBalance = 0; 
        const movements: any[] = []; 
        transactions.forEach(tx => { 
            if (reportFilterCompany && tx.company !== reportFilterCompany) return; 
            tx.items.forEach(item => { 
                if (reportFilterItem && item.itemId !== reportFilterItem) return; 
                movements.push({ 
                    date: tx.date, 
                    txId: tx.id, 
                    type: tx.type, 
                    company: tx.company, 
                    docNumber: tx.number, 
                    desc: tx.type === 'IN' ? `پروفرما: ${tx.proformaNumber || '-'}` : `گیرنده: ${tx.recipientName || '-'}`, 
                    quantity: item.quantity, 
                    itemId: item.itemId, 
                    itemName: item.itemName 
                }); 
            }); 
        }); 
        
        // Sort Ascending Date for Running Balance
        movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); 
        
        const calculated = movements.map(m => { 
            if (m.type === 'IN') runningBalance += m.quantity; else runningBalance -= m.quantity; 
            return { ...m, balance: runningBalance }; 
        }); 
        
        // Return reverse for display (newest first) BUT running balance logic is correct
        return calculated.reverse(); 
    }, [transactions, reportFilterCompany, reportFilterItem]);

    // --- ALL WAREHOUSES REPORT LOGIC ---
    const allWarehousesStock = useMemo(() => {
        const stockMap: Record<string, Record<string, number>> = {}; // Company -> ItemName -> Count
        
        transactions.forEach(tx => {
            const company = tx.company || 'نامشخص';
            if (!stockMap[company]) stockMap[company] = {};
            
            tx.items.forEach(item => {
                const current = stockMap[company][item.itemName] || 0;
                if (tx.type === 'IN') stockMap[company][item.itemName] = current + item.quantity;
                else stockMap[company][item.itemName] = current - item.quantity;
            });
        });

        // Convert to array format
        return Object.entries(stockMap).map(([company, items]) => ({
            company,
            items: Object.entries(items).filter(([_, count]) => count !== 0).map(([name, count]) => ({ name, count }))
        }));
    }, [transactions]);

    const recentBijaks = useMemo(() => transactions.filter(t => t.type === 'OUT').slice(0, 5), [transactions]);
    const filteredArchiveBijaks = useMemo(() => transactions.filter(t => t.type === 'OUT' && (!archiveFilterCompany || t.company === archiveFilterCompany) && (String(t.number).includes(reportSearch) || t.recipientName?.includes(reportSearch))), [transactions, archiveFilterCompany, reportSearch]);

    // Export Handlers
    const handleExportKardexPDF = async () => {
        const element = document.getElementById('kardex-table-print');
        if(!element) return;
        setProcessingExport(true);
        try {
            // @ts-ignore
            const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            // @ts-ignore
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Kardex_${reportFilterCompany}.pdf`);
        } catch(e) { console.error(e); } finally { setProcessingExport(false); }
    };

    const handleSendKardexWhatsApp = async () => {
        if(!settings?.whatsappNumber) { alert("شماره واتساپ در تنظیمات نیست."); return; }
        const target = prompt("شماره یا آیدی گروه:", settings.whatsappNumber); if(!target) return;
        const element = document.getElementById('kardex-table-print');
        if(!element) return;
        setProcessingExport(true);
        try {
            // @ts-ignore
            const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
            const base64 = canvas.toDataURL('image/png').split(',')[1];
            await apiCall('/send-whatsapp', 'POST', { number: target, message: `گزارش کاردکس - ${reportFilterCompany}`, mediaData: { data: base64, mimeType: 'image/png', filename: 'kardex.png' } });
            alert("ارسال شد");
        } catch(e) { alert("خطا"); } finally { setProcessingExport(false); }
    };

    const handlePrintStock = () => {
        window.print();
    };

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
                        <div id={`print-bijak-${createdTxForAutoSend.id}-price`}><PrintBijak tx={createdTxForAutoSend} onClose={()=>{}} settings={settings} forceHidePrices={false} embed /></div>
                        <div id={`print-bijak-${createdTxForAutoSend.id}-noprice`}><PrintBijak tx={createdTxForAutoSend} onClose={()=>{}} settings={settings} forceHidePrices={true} embed /></div>
                    </>
                )}
            </div>

            <div className="bg-gray-100 p-2 flex gap-2 border-b overflow-x-auto no-print">
                <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>داشبورد</button>
                <button onClick={() => setActiveTab('items')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'items' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>تعریف کالا</button>
                <button onClick={() => setActiveTab('entry')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'entry' ? 'bg-white text-green-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>ورود کالا (رسید)</button>
                <button onClick={() => setActiveTab('exit')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'exit' ? 'bg-white text-red-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>خروج کالا (بیجک)</button>
                <button onClick={() => setActiveTab('archive')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'archive' ? 'bg-white text-gray-800 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>مدیریت بیجک‌ها (بایگانی)</button>
                <button onClick={() => setActiveTab('reports')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'reports' ? 'bg-white text-purple-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>گزارش کاردکس</button>
                <button onClick={() => setActiveTab('stock_report')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'stock_report' ? 'bg-white text-orange-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>موجودی کل انبارها (A4)</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 printable-content">
                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div onClick={() => setActiveTab('items')} className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"><div><div className="text-3xl font-black text-blue-700">{items.length}</div><div className="text-sm text-blue-600 font-bold">تعداد کالاها</div></div><Package size={40} className="text-blue-300"/></div>
                            <div onClick={() => setActiveTab('entry')} className="bg-green-50 p-6 rounded-2xl border border-green-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"><div><div className="text-3xl font-black text-green-700">{transactions.filter(t=>t.type==='IN').length}</div><div className="text-sm text-green-600 font-bold">تعداد رسیدها</div></div><ArrowDownCircle size={40} className="text-green-300"/></div>
                            <div onClick={() => setActiveTab('exit')} className="bg-red-50 p-6 rounded-2xl border border-red-100 flex items-center justify-between cursor-pointer hover:shadow-md transition-all"><div><div className="text-3xl font-black text-red-700">{transactions.filter(t=>t.type==='OUT').length}</div><div className="text-sm text-red-600 font-bold">تعداد حواله‌ها (بیجک)</div></div><ArrowUpCircle size={40} className="text-red-300"/></div>
                        </div>
                        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm"><div className="bg-gray-50 p-4 border-b flex justify-between items-center"><h3 className="font-bold text-gray-800 flex items-center gap-2"><FileClock size={20}/> آخرین بیجک‌های صادر شده</h3><button onClick={() => setActiveTab('archive')} className="text-xs text-blue-600 hover:underline font-bold border border-blue-200 px-3 py-1 rounded bg-white">مشاهده و مدیریت کامل بایگانی</button></div><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-600"><tr><th className="p-3">شماره</th><th className="p-3">تاریخ</th><th className="p-3">شرکت</th><th className="p-3">گیرنده</th><th className="p-3">عملیات</th></tr></thead><tbody className="divide-y">{recentBijaks.length === 0 ? (<tr><td colSpan={5} className="p-6 text-center text-gray-400">هیچ بیجکی صادر نشده است.</td></tr>) : (recentBijaks.map(tx => (<tr key={tx.id} className="hover:bg-gray-50"><td className="p-3 font-mono font-bold text-red-600">#{tx.number}</td><td className="p-3 text-xs">{formatDate(tx.date)}</td><td className="p-3 text-xs font-bold">{tx.company}</td><td className="p-3 text-xs">{tx.recipientName}</td><td className="p-3"><button onClick={() => setViewBijak(tx)} className="text-blue-600 hover:text-blue-800 p-1 flex items-center gap-1"><Eye size={14}/> مشاهده</button></td></tr>)))}</tbody></table></div>
                    </div>
                )}
                {activeTab === 'items' && (<div className="max-w-4xl mx-auto"><div className="bg-gray-50 p-4 rounded-xl border mb-6 flex items-end gap-3"><div className="flex-1 space-y-1"><label className="text-xs font-bold text-gray-500">نام کالا</label><input className="w-full border rounded p-2" value={newItemName} onChange={e=>setNewItemName(e.target.value)}/></div><div className="w-32 space-y-1"><label className="text-xs font-bold text-gray-500">کد کالا</label><input className="w-full border rounded p-2" value={newItemCode} onChange={e=>setNewItemCode(e.target.value)}/></div><div className="w-32 space-y-1"><label className="text-xs font-bold text-gray-500">واحد</label><select className="w-full border rounded p-2 bg-white" value={newItemUnit} onChange={e=>setNewItemUnit(e.target.value)}><option>عدد</option><option>کارتن</option><option>کیلوگرم</option><option>دستگاه</option></select></div><button onClick={handleAddItem} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 h-[42px] w-12 flex items-center justify-center"><Plus/></button></div><div className="bg-white border rounded-xl overflow-hidden"><table className="w-full text-sm text-right"><thead className="bg-gray-100"><tr><th className="p-3">کد</th><th className="p-3">نام کالا</th><th className="p-3">واحد</th><th className="p-3 w-10"></th></tr></thead><tbody>{items.map(i => (<tr key={i.id} className="border-t hover:bg-gray-50"><td className="p-3 font-mono">{i.code}</td><td className="p-3 font-bold">{i.name}</td><td className="p-3">{i.unit}</td><td className="p-3"><button onClick={()=>handleDeleteItem(i.id)} className="text-red-500"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div></div>)}
                {activeTab === 'entry' && (<div className="max-w-4xl mx-auto bg-green-50 p-6 rounded-2xl border border-green-200"><h3 className="font-bold text-green-800 mb-4 flex items-center gap-2"><ArrowDownCircle/> ثبت ورود کالا (رسید انبار)</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-bold mb-1">شرکت مالک</label><select className="w-full border rounded p-2 bg-white" value={selectedCompany} onChange={e=>setSelectedCompany(e.target.value)}><option value="">انتخاب...</option>{companyList.map(c=><option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-xs font-bold mb-1">شماره پروفرما / سند</label><input className="w-full border rounded p-2 bg-white" value={proformaNumber} onChange={e=>setProformaNumber(e.target.value)}/></div><div><label className="block text-xs font-bold mb-1">تاریخ ورود</label><div className="flex gap-1 dir-ltr"><select className="border rounded p-1 text-sm flex-1" value={txDate.year} onChange={e=>setTxDate({...txDate, year:Number(e.target.value)})}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select><select className="border rounded p-1 text-sm flex-1" value={txDate.month} onChange={e=>setTxDate({...txDate, month:Number(e.target.value)})}>{months.map(m=><option key={m} value={m}>{m}</option>)}</select><select className="border rounded p-1 text-sm flex-1" value={txDate.day} onChange={e=>setTxDate({...txDate, day:Number(e.target.value)})}>{days.map(d=><option key={d} value={d}>{d}</option>)}</select></div></div></div><div className="space-y-2 bg-white p-4 rounded-xl border">{txItems.map((row, idx) => (<div key={idx} className="flex gap-2 items-end"><div className="flex-1"><label className="text-[10px] text-gray-500">کالا</label><select className="w-full border rounded p-2 text-sm" value={row.itemId} onChange={e=>updateTxItem(idx, 'itemId', e.target.value)}><option value="">انتخاب کالا...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div><div className="w-24"><label className="text-[10px] text-gray-500">تعداد</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.quantity} onChange={e=>updateTxItem(idx, 'quantity', e.target.value)}/></div><div className="w-24"><label className="text-[10px] text-gray-500">وزن (KG)</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.weight} onChange={e=>updateTxItem(idx, 'weight', e.target.value)}/></div>{idx > 0 && <button onClick={()=>handleRemoveTxItemRow(idx)} className="text-red-500 p-2"><Trash2 size={16}/></button>}</div>))}<button onClick={handleAddTxItemRow} className="text-xs text-blue-600 font-bold flex items-center gap-1 mt-2"><Plus size={14}/> افزودن ردیف کالا</button></div><button onClick={()=>handleSubmitTx('IN')} className="w-full bg-green-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-green-700 shadow-lg">ثبت رسید انبار</button></div>)}
                {activeTab === 'exit' && (<div className="max-w-4xl mx-auto bg-red-50 p-6 rounded-2xl border border-red-200"><h3 className="font-bold text-red-800 mb-4 flex items-center gap-2"><ArrowUpCircle/> ثبت خروج کالا (صدور بیجک)</h3><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4"><div><label className="block text-xs font-bold mb-1">شرکت فرستنده</label><select className="w-full border rounded p-2 bg-white" value={selectedCompany} onChange={e=>setSelectedCompany(e.target.value)}><option value="">انتخاب...</option>{companyList.map(c=><option key={c} value={c}>{c}</option>)}</select></div><div><label className="block text-xs font-bold mb-1">شماره بیجک (سیستمی)</label><div className="bg-white p-2 rounded border font-mono text-center text-red-600 font-bold">{nextBijakNum > 0 ? nextBijakNum : '---'}</div></div><div><label className="block text-xs font-bold mb-1">تاریخ خروج</label><div className="flex gap-1 dir-ltr"><select className="border rounded p-1 text-sm flex-1" value={txDate.year} onChange={e=>setTxDate({...txDate, year:Number(e.target.value)})}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select><select className="border rounded p-1 text-sm flex-1" value={txDate.month} onChange={e=>setTxDate({...txDate, month:Number(e.target.value)})}>{months.map(m=><option key={m} value={m}>{m}</option>)}</select><select className="border rounded p-1 text-sm flex-1" value={txDate.day} onChange={e=>setTxDate({...txDate, day:Number(e.target.value)})}>{days.map(d=><option key={d} value={d}>{d}</option>)}</select></div></div><div><label className="block text-xs font-bold mb-1">تحویل گیرنده</label><input className="w-full border rounded p-2 bg-white" value={recipientName} onChange={e=>setRecipientName(e.target.value)}/></div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4"><div><label className="block text-xs font-bold mb-1">راننده</label><input className="w-full border rounded p-2 bg-white" value={driverName} onChange={e=>setDriverName(e.target.value)}/></div><div><label className="block text-xs font-bold mb-1">پلاک</label><input className="w-full border rounded p-2 bg-white dir-ltr" value={plateNumber} onChange={e=>setPlateNumber(e.target.value)}/></div><div><label className="block text-xs font-bold mb-1">مقصد</label><input className="w-full border rounded p-2 bg-white" value={destination} onChange={e=>setDestination(e.target.value)}/></div></div><div className="space-y-2 bg-white p-4 rounded-xl border">{txItems.map((row, idx) => (<div key={idx} className="flex gap-2 items-end"><div className="flex-1"><label className="text-[10px] text-gray-500">کالا</label><select className="w-full border rounded p-2 text-sm" value={row.itemId} onChange={e=>updateTxItem(idx, 'itemId', e.target.value)}><option value="">انتخاب...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div><div className="w-20"><label className="text-[10px] text-gray-500">تعداد</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.quantity} onChange={e=>updateTxItem(idx, 'quantity', e.target.value)}/></div><div className="w-20"><label className="text-[10px] text-gray-500">وزن</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.weight} onChange={e=>updateTxItem(idx, 'weight', e.target.value)}/></div><div className="w-32"><label className="text-[10px] text-gray-500">فی (ریال)</label><input type="text" className="w-full border rounded p-2 text-sm dir-ltr font-bold text-blue-600" value={formatNumberString(row.unitPrice)} onChange={e=>updateTxItem(idx, 'unitPrice', deformatNumberString(e.target.value))}/></div>{idx > 0 && <button onClick={()=>handleRemoveTxItemRow(idx)} className="text-red-500 p-2"><Trash2 size={16}/></button>}</div>))}<button onClick={handleAddTxItemRow} className="text-xs text-blue-600 font-bold flex items-center gap-1 mt-2"><Plus size={14}/> افزودن ردیف کالا</button></div><button onClick={()=>handleSubmitTx('OUT')} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-red-700 shadow-lg">ثبت و صدور بیجک</button></div>)}
                
                {/* REFACTORED REPORTS TAB (KARDEX) */}
                {activeTab === 'reports' && (
                    <div className="space-y-6">
                        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 items-end no-print">
                            <div className="w-full md:w-64">
                                <label className="text-xs font-bold block mb-1">1. انتخاب شرکت (الزامی)</label>
                                <select className="w-full border rounded p-2 text-sm" value={reportFilterCompany} onChange={e=>setReportFilterCompany(e.target.value)}>
                                    <option value="">انتخاب شرکت...</option>
                                    {companyList.map(c=><option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="w-full md:w-64">
                                <label className="text-xs font-bold block mb-1">2. انتخاب کالا (اختیاری)</label>
                                <select className="w-full border rounded p-2 text-sm" value={reportFilterItem} onChange={e=>setReportFilterItem(e.target.value)}>
                                    <option value="">همه کالاها</option>
                                    {items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2 mr-auto">
                                <button onClick={handleExportKardexPDF} disabled={processingExport || !reportFilterCompany} className="bg-red-500 text-white px-3 py-2 rounded text-xs hover:bg-red-600 flex items-center gap-1 disabled:opacity-50">{processingExport ? <Loader2 size={14} className="animate-spin"/> : <FileDown size={14}/>} PDF</button>
                                <button onClick={handleSendKardexWhatsApp} disabled={processingExport || !reportFilterCompany} className="bg-green-500 text-white px-3 py-2 rounded text-xs hover:bg-green-600 flex items-center gap-1 disabled:opacity-50">{processingExport ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14}/>} واتساپ</button>
                            </div>
                        </div>

                        {reportFilterCompany ? (
                            <div id="kardex-table-print" className="bg-white rounded-xl border shadow-sm overflow-hidden p-2">
                                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                                    <h3 className="font-bold text-indigo-900 flex items-center gap-2"><ArrowLeftRight size={20}/> کاردکس کالا: {reportFilterCompany}</h3>
                                    <span className="text-xs text-indigo-700 bg-white px-2 py-1 rounded border border-indigo-200">{kardexData.length} رکورد</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right border-collapse">
                                        <thead className="bg-indigo-100 text-indigo-900 font-bold border-b border-indigo-200">
                                            <tr>
                                                <th className="p-3 border">تاریخ</th>
                                                <th className="p-3 border">نام کالا</th>
                                                <th className="p-3 border">شرح عملیات</th>
                                                <th className="p-3 border w-20 text-center bg-green-50 text-green-800">وارده</th>
                                                <th className="p-3 border w-20 text-center bg-red-50 text-red-800">صادره</th>
                                                <th className="p-3 border w-24 text-center bg-gray-50 text-gray-800">مانده</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {kardexData.length === 0 ? (
                                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">هیچ تراکنشی یافت نشد.</td></tr>
                                            ) : (
                                                kardexData.map((row, index) => (
                                                    <tr key={`${row.txId}_${index}`} className="border-b">
                                                        <td className="p-2 border font-mono text-gray-600 text-xs text-center">{formatDate(row.date)}</td>
                                                        <td className="p-2 border font-bold text-gray-800">{row.itemName}</td>
                                                        <td className="p-2 border">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] text-gray-500">{row.type === 'IN' ? 'رسید' : `بیجک ${row.docNumber}`} | {row.desc}</span>
                                                            </div>
                                                        </td>
                                                        <td className={`p-2 border text-center font-mono font-bold ${row.type === 'IN' ? 'text-green-600 bg-green-50/50' : 'text-gray-300'}`}>{row.type === 'IN' ? row.quantity : '-'}</td>
                                                        <td className={`p-2 border text-center font-mono font-bold ${row.type === 'OUT' ? 'text-red-600 bg-red-50/50' : 'text-gray-300'}`}>{row.type === 'OUT' ? row.quantity : '-'}</td>
                                                        <td className="p-2 border text-center font-mono font-black text-gray-800 bg-gray-50">{row.balance}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center p-10 text-gray-400 border-2 border-dashed rounded-xl">لطفا برای مشاهده کاردکس، نام شرکت را انتخاب کنید.</div>
                        )}
                    </div>
                )}

                {/* STOCK REPORT TAB (A4) */}
                {activeTab === 'stock_report' && (
                    <div className="flex flex-col h-full">
                        <div className="flex justify-between items-center mb-4 no-print">
                            <h2 className="text-xl font-bold">گزارش موجودی کلی انبارها (تفکیکی)</h2>
                            <button onClick={handlePrintStock} className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700"><Printer size={18}/> چاپ A4</button>
                        </div>
                        <div className="bg-white p-8 shadow-lg mx-auto w-[210mm] min-h-[297mm] print:shadow-none print:w-full print:p-0">
                            <div className="text-center border-b-2 border-black pb-4 mb-6">
                                <h1 className="text-2xl font-black mb-2">گزارش موجودی انبار</h1>
                                <p className="text-sm">تاریخ گزارش: {new Date().toLocaleDateString('fa-IR')}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-6 print:block print:columns-2">
                                {allWarehousesStock.map(group => (
                                    <div key={group.company} className="break-inside-avoid mb-6 border border-black rounded-lg overflow-hidden">
                                        <div className="bg-gray-200 text-black font-bold p-2 text-center border-b border-black text-lg">{group.company}</div>
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-black bg-gray-50">
                                                    <th className="p-2 text-right">نام کالا</th>
                                                    <th className="p-2 text-center w-24">موجودی</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.items.length > 0 ? group.items.map((item, i) => (
                                                    <tr key={i} className="border-b border-gray-300 last:border-0">
                                                        <td className="p-2 font-medium">{item.name}</td>
                                                        <td className="p-2 text-center font-bold font-mono">{item.count}</td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan={2} className="p-4 text-center text-gray-400 text-xs">بدون موجودی</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ARCHIVE TAB */}
                {activeTab === 'archive' && (
                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 items-center no-print">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2"><Archive size={20}/> بایگانی بیجک‌ها</h3>
                            <div className="flex-1 w-full relative">
                                <Search size={16} className="absolute left-3 top-3 text-gray-400"/>
                                <input className="w-full border rounded-lg p-2 pl-9" placeholder="جستجو (شماره، گیرنده...)" value={reportSearch} onChange={e=>setReportSearch(e.target.value)}/>
                            </div>
                            <div className="w-full md:w-64">
                                <select className="w-full border rounded-lg p-2" value={archiveFilterCompany} onChange={e=>setArchiveFilterCompany(e.target.value)}>
                                    <option value="">همه شرکت‌ها</option>
                                    {companyList.map(c=><option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                            <table className="w-full text-sm text-right">
                                <thead className="bg-gray-100 text-gray-600"><tr><th className="p-4">شماره</th><th className="p-4">تاریخ</th><th className="p-4">شرکت</th><th className="p-4">گیرنده / راننده</th><th className="p-4 text-center">عملیات</th></tr></thead>
                                <tbody className="divide-y">
                                    {filteredArchiveBijaks.map(tx => (
                                        <tr key={tx.id} className="hover:bg-gray-50">
                                            <td className="p-4 font-mono font-bold text-red-600">#{tx.number}</td>
                                            <td className="p-4 text-xs">{formatDate(tx.date)}</td>
                                            <td className="p-4 text-xs font-bold">{tx.company}</td>
                                            <td className="p-4 text-xs">
                                                <div className="font-bold">{tx.recipientName}</div>
                                                <div className="text-gray-500">{tx.driverName}</div>
                                            </td>
                                            <td className="p-4 text-center flex justify-center gap-2">
                                                <button onClick={() => setViewBijak(tx)} className="bg-blue-100 text-blue-600 p-2 rounded hover:bg-blue-200" title="مشاهده/چاپ"><Eye size={16}/></button>
                                                <button onClick={() => setEditingBijak(tx)} className="bg-amber-100 text-amber-600 p-2 rounded hover:bg-amber-200" title="ویرایش"><Edit size={16}/></button>
                                                <button onClick={() => handleDeleteTx(tx.id)} className="bg-red-100 text-red-600 p-2 rounded hover:bg-red-200" title="حذف"><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredArchiveBijaks.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">موردی یافت نشد.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            
            {/* View Modal */}
            {viewBijak && (<PrintBijak tx={viewBijak} onClose={() => setViewBijak(null)} settings={settings} />)}

            {/* Edit Modal */}
            {editingBijak && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-lg">ویرایش بیجک #{editingBijak.number}</h3>
                            <button onClick={() => setEditingBijak(null)}><X size={20}/></button>
                        </div>
                        <EditBijakForm 
                            bijak={editingBijak} 
                            items={items} 
                            onSave={handleEditBijakSave} 
                            onCancel={() => setEditingBijak(null)} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// Helper Component for Editing Bijak
const EditBijakForm: React.FC<{ bijak: WarehouseTransaction, items: WarehouseItem[], onSave: (tx: WarehouseTransaction) => void, onCancel: () => void }> = ({ bijak, items, onSave, onCancel }) => {
    const [formData, setFormData] = useState(bijak);
    const [dateParts, setDateParts] = useState(getShamsiDateFromIso(bijak.date));

    const handleSave = () => {
        try {
            const isoDate = jalaliToGregorian(dateParts.year, dateParts.month, dateParts.day).toISOString();
            onSave({ ...formData, date: isoDate });
        } catch(e) { alert("تاریخ نامعتبر"); }
    };

    const updateItem = (idx: number, field: string, val: any) => {
        const newItems = [...formData.items];
        // @ts-ignore
        newItems[idx][field] = val;
        if(field === 'itemId') {
            const found = items.find(i => i.id === val);
            if(found) newItems[idx].itemName = found.name;
        }
        setFormData({ ...formData, items: newItems });
    };

    const addItem = () => setFormData({ ...formData, items: [...formData.items, { itemId: '', itemName: '', quantity: 0, weight: 0, unitPrice: 0 }] });
    const removeItem = (idx: number) => setFormData({ ...formData, items: formData.items.filter((_, i) => i !== idx) });

    const years = Array.from({length:10},(_,i)=>1400+i);
    const months = Array.from({length:12},(_,i)=>i+1);
    const days = Array.from({length:31},(_,i)=>i+1);

    return (
        <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold block mb-1">تاریخ</label><div className="flex gap-1"><select className="border rounded p-1 w-full" value={dateParts.day} onChange={e=>setDateParts({...dateParts, day: +e.target.value})}>{days.map(d=><option key={d} value={d}>{d}</option>)}</select><select className="border rounded p-1 w-full" value={dateParts.month} onChange={e=>setDateParts({...dateParts, month: +e.target.value})}>{months.map(m=><option key={m} value={m}>{m}</option>)}</select><select className="border rounded p-1 w-full" value={dateParts.year} onChange={e=>setDateParts({...dateParts, year: +e.target.value})}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></div></div>
                <div><label className="text-xs font-bold block mb-1">گیرنده</label><input className="w-full border rounded p-2" value={formData.recipientName} onChange={e=>setFormData({...formData, recipientName: e.target.value})}/></div>
                <div><label className="text-xs font-bold block mb-1">راننده</label><input className="w-full border rounded p-2" value={formData.driverName} onChange={e=>setFormData({...formData, driverName: e.target.value})}/></div>
                <div><label className="text-xs font-bold block mb-1">پلاک</label><input className="w-full border rounded p-2 dir-ltr" value={formData.plateNumber} onChange={e=>setFormData({...formData, plateNumber: e.target.value})}/></div>
                <div className="col-span-2"><label className="text-xs font-bold block mb-1">مقصد</label><input className="w-full border rounded p-2" value={formData.destination} onChange={e=>setFormData({...formData, destination: e.target.value})}/></div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded border">
                <h4 className="font-bold text-sm mb-2">اقلام</h4>
                {formData.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 mb-2 items-end">
                        <div className="flex-1"><select className="w-full border rounded p-1 text-sm" value={item.itemId} onChange={e=>updateItem(idx, 'itemId', e.target.value)}><option value="">انتخاب...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
                        <div className="w-20"><input type="number" className="w-full border rounded p-1 text-sm text-center" value={item.quantity} onChange={e=>updateItem(idx, 'quantity', +e.target.value)} placeholder="تعداد"/></div>
                        <div className="w-24"><input type="number" className="w-full border rounded p-1 text-sm text-center" value={item.weight} onChange={e=>updateItem(idx, 'weight', +e.target.value)} placeholder="وزن"/></div>
                        <div className="w-28"><input type="number" className="w-full border rounded p-1 text-sm text-center" value={item.unitPrice} onChange={e=>updateItem(idx, 'unitPrice', +e.target.value)} placeholder="قیمت"/></div>
                        <button onClick={()=>removeItem(idx)} className="text-red-500"><Trash2 size={16}/></button>
                    </div>
                ))}
                <button onClick={addItem} className="text-blue-600 text-xs font-bold flex items-center gap-1 mt-2"><Plus size={14}/> افزودن سطر</button>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
                <button onClick={onCancel} className="px-4 py-2 border rounded text-gray-600">انصراف</button>
                <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">ذخیره تغییرات</button>
            </div>
        </div>
    );
}

export default WarehouseModule;
