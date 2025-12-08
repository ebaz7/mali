
import React, { useState, useEffect } from 'react';
import { User, SystemSettings, WarehouseItem, WarehouseTransaction, WarehouseTransactionItem } from '../types';
import { getWarehouseItems, saveWarehouseItem, deleteWarehouseItem, getWarehouseTransactions, saveWarehouseTransaction, deleteWarehouseTransaction, getNextBijakNumber } from '../services/storageService';
import { generateUUID, getCurrentShamsiDate, jalaliToGregorian, formatNumberString, deformatNumberString, formatDate } from '../constants';
import { Package, Plus, Search, Trash2, ArrowDownCircle, ArrowUpCircle, FileText, Printer, BarChart3, Filter, X, Check, Eye } from 'lucide-react';
import PrintBijak from './PrintBijak';

interface Props { currentUser: User; settings?: SystemSettings; }

const WarehouseModule: React.FC<Props> = ({ currentUser, settings }) => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'items' | 'entry' | 'exit' | 'reports'>('dashboard');
    const [items, setItems] = useState<WarehouseItem[]>([]);
    const [transactions, setTransactions] = useState<WarehouseTransaction[]>([]);
    
    // Items State
    const [newItemName, setNewItemName] = useState('');
    const [newItemCode, setNewItemCode] = useState('');
    const [newItemUnit, setNewItemUnit] = useState('عدد');

    // Transaction Form State
    const currentShamsi = getCurrentShamsiDate();
    const [txDate, setTxDate] = useState({ year: currentShamsi.year, month: currentShamsi.month, day: currentShamsi.day });
    const [selectedCompany, setSelectedCompany] = useState('');
    const [txItems, setTxItems] = useState<Partial<WarehouseTransactionItem>[]>([{ itemId: '', quantity: 0, weight: 0, unitPrice: 0 }]);
    
    // Entry Specific
    const [proformaNumber, setProformaNumber] = useState('');
    
    // Exit Specific
    const [recipientName, setRecipientName] = useState('');
    const [driverName, setDriverName] = useState('');
    const [plateNumber, setPlateNumber] = useState('');
    const [destination, setDestination] = useState('');
    const [nextBijakNum, setNextBijakNum] = useState<number>(0);

    // View/Print State
    const [viewBijak, setViewBijak] = useState<WarehouseTransaction | null>(null);

    // Reports State
    const [reportFilterCompany, setReportFilterCompany] = useState('');
    const [reportSearch, setReportSearch] = useState('');

    useEffect(() => { loadData(); }, []);
    useEffect(() => { if(selectedCompany && activeTab === 'exit') updateNextBijak(); }, [selectedCompany, activeTab]);

    const loadData = async () => {
        const [i, t] = await Promise.all([getWarehouseItems(), getWarehouseTransactions()]);
        setItems(i);
        setTransactions(t);
    };

    const updateNextBijak = async () => {
        if(selectedCompany) {
            const num = await getNextBijakNumber(selectedCompany);
            setNextBijakNum(num);
        }
    };

    const getIsoDate = () => { try { const date = jalaliToGregorian(txDate.year, txDate.month, txDate.day); return date.toISOString(); } catch { return new Date().toISOString(); } };

    // --- ITEM ACTIONS ---
    const handleAddItem = async () => {
        if(!newItemName) return;
        await saveWarehouseItem({ id: generateUUID(), name: newItemName, code: newItemCode, unit: newItemUnit });
        setNewItemName(''); setNewItemCode('');
        loadData();
    };
    const handleDeleteItem = async (id: string) => { if(confirm('حذف شود؟')) { await deleteWarehouseItem(id); loadData(); } };

    // --- TRANSACTION ACTIONS ---
    const handleAddTxItemRow = () => setTxItems([...txItems, { itemId: '', quantity: 0, weight: 0, unitPrice: 0 }]);
    const handleRemoveTxItemRow = (idx: number) => setTxItems(txItems.filter((_, i) => i !== idx));
    const updateTxItem = (idx: number, field: keyof WarehouseTransactionItem, val: any) => {
        const newItems = [...txItems];
        newItems[idx] = { ...newItems[idx], [field]: val };
        if(field === 'itemId') {
            const item = items.find(i => i.id === val);
            if(item) newItems[idx].itemName = item.name;
        }
        setTxItems(newItems);
    };

    const handleSubmitTx = async (type: 'IN' | 'OUT') => {
        if(!selectedCompany) { alert('شرکت را انتخاب کنید'); return; }
        if(txItems.some(i => !i.itemId || !i.quantity)) { alert('اقلام را کامل کنید'); return; }

        const validItems = txItems.map(i => ({ itemId: i.itemId!, itemName: i.itemName!, quantity: Number(i.quantity), weight: Number(i.weight), unitPrice: Number(i.unitPrice)||0 }));
        
        const tx: WarehouseTransaction = {
            id: generateUUID(),
            type,
            date: getIsoDate(),
            company: selectedCompany,
            number: type === 'IN' ? 0 : nextBijakNum, // Number handled by server/service for OUT
            items: validItems,
            createdAt: Date.now(),
            createdBy: currentUser.fullName,
            // Entry Fields
            proformaNumber: type === 'IN' ? proformaNumber : undefined,
            // Exit Fields
            recipientName: type === 'OUT' ? recipientName : undefined,
            driverName: type === 'OUT' ? driverName : undefined,
            plateNumber: type === 'OUT' ? plateNumber : undefined,
            destination: type === 'OUT' ? destination : undefined
        };

        const result = await saveWarehouseTransaction(tx);
        // If it was OUT, result[0] (or mocked) might have the number.
        // For mock, we rely on reloading or optimistic update.
        await loadData();
        
        // Reset Form
        setTxItems([{ itemId: '', quantity: 0, weight: 0, unitPrice: 0 }]);
        if(type === 'OUT') {
            setRecipientName(''); setDriverName(''); setPlateNumber(''); setDestination('');
            if(result) {
                // Find the newly created tx to show print dialog immediately
                // In mock env, it's at index 0
                setViewBijak(result[0] || tx);
            }
        } else {
            setProformaNumber('');
            alert('ورود کالا ثبت شد.');
        }
    };

    const handleDeleteTx = async (id: string) => { if(confirm('حذف تراکنش؟')) { await deleteWarehouseTransaction(id); loadData(); } };

    // --- REPORTS ---
    const getInventoryBalance = () => {
        const bal: Record<string, {name: string, company: string, qty: number, weight: number}> = {};
        transactions.forEach(tx => {
            if(reportFilterCompany && tx.company !== reportFilterCompany) return;
            tx.items.forEach(item => {
                const key = `${item.itemId}_${tx.company}`;
                if(!bal[key]) bal[key] = { name: item.itemName, company: tx.company, qty: 0, weight: 0 };
                if(tx.type === 'IN') { bal[key].qty += item.quantity; bal[key].weight += item.weight; }
                else { bal[key].qty -= item.quantity; bal[key].weight -= item.weight; }
            });
        });
        return Object.values(bal).filter(b => !reportSearch || b.name.includes(reportSearch));
    };

    const getKardex = () => {
        return transactions.filter(t => 
            (!reportFilterCompany || t.company === reportFilterCompany) &&
            (!reportSearch || t.items.some(i => i.itemName.includes(reportSearch)) || t.recipientName?.includes(reportSearch))
        ).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };

    // --- RENDER HELPERS ---
    const DateSelect = () => (
        <div className="flex gap-1 dir-ltr">
            <select className="border rounded p-1 text-sm" value={txDate.year} onChange={e=>setTxDate({...txDate, year:Number(e.target.value)})}>{Array.from({length:10},(_,i)=>1400+i).map(y=><option key={y} value={y}>{y}</option>)}</select>
            <select className="border rounded p-1 text-sm" value={txDate.month} onChange={e=>setTxDate({...txDate, month:Number(e.target.value)})}>{Array.from({length:12},(_,i)=>i+1).map(m=><option key={m} value={m}>{m}</option>)}</select>
            <select className="border rounded p-1 text-sm" value={txDate.day} onChange={e=>setTxDate({...txDate, day:Number(e.target.value)})}>{Array.from({length:31},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}</select>
        </div>
    );

    return (
        <div className="bg-white rounded-2xl shadow-sm border h-[calc(100vh-100px)] flex flex-col overflow-hidden animate-fade-in">
            {/* Header / Tabs */}
            <div className="bg-gray-100 p-2 flex gap-2 border-b overflow-x-auto">
                <button onClick={() => setActiveTab('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>داشبورد</button>
                <button onClick={() => setActiveTab('items')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'items' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>تعریف کالا</button>
                <button onClick={() => setActiveTab('entry')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'entry' ? 'bg-white text-green-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>ورود کالا (رسید)</button>
                <button onClick={() => setActiveTab('exit')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'exit' ? 'bg-white text-red-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>خروج کالا (بیجک)</button>
                <button onClick={() => setActiveTab('reports')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${activeTab === 'reports' ? 'bg-white text-purple-600 shadow' : 'text-gray-600 hover:bg-gray-200'}`}>گزارشات و کاردکس</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                
                {/* DASHBOARD */}
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-center justify-between">
                            <div><div className="text-3xl font-black text-blue-700">{items.length}</div><div className="text-sm text-blue-600 font-bold">تعداد کالاها</div></div>
                            <Package size={40} className="text-blue-300"/>
                        </div>
                        <div className="bg-green-50 p-6 rounded-2xl border border-green-100 flex items-center justify-between">
                            <div><div className="text-3xl font-black text-green-700">{transactions.filter(t=>t.type==='IN').length}</div><div className="text-sm text-green-600 font-bold">تعداد رسیدها</div></div>
                            <ArrowDownCircle size={40} className="text-green-300"/>
                        </div>
                        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 flex items-center justify-between">
                            <div><div className="text-3xl font-black text-red-700">{transactions.filter(t=>t.type==='OUT').length}</div><div className="text-sm text-red-600 font-bold">تعداد حواله‌ها (بیجک)</div></div>
                            <ArrowUpCircle size={40} className="text-red-300"/>
                        </div>
                    </div>
                )}

                {/* ITEM DEFINITION */}
                {activeTab === 'items' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-gray-50 p-4 rounded-xl border mb-6 flex items-end gap-3">
                            <div className="flex-1 space-y-1"><label className="text-xs font-bold text-gray-500">نام کالا</label><input className="w-full border rounded p-2" value={newItemName} onChange={e=>setNewItemName(e.target.value)}/></div>
                            <div className="w-32 space-y-1"><label className="text-xs font-bold text-gray-500">کد کالا</label><input className="w-full border rounded p-2" value={newItemCode} onChange={e=>setNewItemCode(e.target.value)}/></div>
                            <div className="w-32 space-y-1"><label className="text-xs font-bold text-gray-500">واحد</label><select className="w-full border rounded p-2 bg-white" value={newItemUnit} onChange={e=>setNewItemUnit(e.target.value)}><option>عدد</option><option>کارتن</option><option>کیلوگرم</option><option>دستگاه</option></select></div>
                            <button onClick={handleAddItem} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 h-[42px] w-12 flex items-center justify-center"><Plus/></button>
                        </div>
                        <div className="bg-white border rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-right"><thead className="bg-gray-100"><tr><th className="p-3">کد</th><th className="p-3">نام کالا</th><th className="p-3">واحد</th><th className="p-3 w-10"></th></tr></thead><tbody>
                                {items.map(i => (<tr key={i.id} className="border-t hover:bg-gray-50"><td className="p-3 font-mono">{i.code}</td><td className="p-3 font-bold">{i.name}</td><td className="p-3">{i.unit}</td><td className="p-3"><button onClick={()=>handleDeleteItem(i.id)} className="text-red-500"><Trash2 size={16}/></button></td></tr>))}
                            </tbody></table>
                        </div>
                    </div>
                )}

                {/* ENTRY FORM */}
                {activeTab === 'entry' && (
                    <div className="max-w-4xl mx-auto bg-green-50 p-6 rounded-2xl border border-green-200">
                        <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2"><ArrowDownCircle/> ثبت ورود کالا (رسید انبار)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div><label className="block text-xs font-bold mb-1">شرکت مالک</label><select className="w-full border rounded p-2 bg-white" value={selectedCompany} onChange={e=>setSelectedCompany(e.target.value)}><option value="">انتخاب...</option>{settings?.companyNames.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="block text-xs font-bold mb-1">شماره پروفرما / سند</label><input className="w-full border rounded p-2 bg-white" value={proformaNumber} onChange={e=>setProformaNumber(e.target.value)}/></div>
                            <div><label className="block text-xs font-bold mb-1">تاریخ ورود</label><DateSelect/></div>
                        </div>
                        <div className="space-y-2 bg-white p-4 rounded-xl border">
                            {txItems.map((row, idx) => (
                                <div key={idx} className="flex gap-2 items-end">
                                    <div className="flex-1"><label className="text-[10px] text-gray-500">کالا</label><select className="w-full border rounded p-2 text-sm" value={row.itemId} onChange={e=>updateTxItem(idx, 'itemId', e.target.value)}><option value="">انتخاب کالا...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
                                    <div className="w-24"><label className="text-[10px] text-gray-500">تعداد</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.quantity} onChange={e=>updateTxItem(idx, 'quantity', e.target.value)}/></div>
                                    <div className="w-24"><label className="text-[10px] text-gray-500">وزن (KG)</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.weight} onChange={e=>updateTxItem(idx, 'weight', e.target.value)}/></div>
                                    {idx > 0 && <button onClick={()=>handleRemoveTxItemRow(idx)} className="text-red-500 p-2"><Trash2 size={16}/></button>}
                                </div>
                            ))}
                            <button onClick={handleAddTxItemRow} className="text-xs text-blue-600 font-bold flex items-center gap-1 mt-2"><Plus size={14}/> افزودن ردیف کالا</button>
                        </div>
                        <button onClick={()=>handleSubmitTx('IN')} className="w-full bg-green-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-green-700 shadow-lg">ثبت رسید انبار</button>
                    </div>
                )}

                {/* EXIT FORM */}
                {activeTab === 'exit' && (
                    <div className="max-w-4xl mx-auto bg-red-50 p-6 rounded-2xl border border-red-200">
                        <h3 className="font-bold text-red-800 mb-4 flex items-center gap-2"><ArrowUpCircle/> ثبت خروج کالا (صدور بیجک)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div><label className="block text-xs font-bold mb-1">شرکت فرستنده</label><select className="w-full border rounded p-2 bg-white" value={selectedCompany} onChange={e=>setSelectedCompany(e.target.value)}><option value="">انتخاب...</option>{settings?.companyNames.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="block text-xs font-bold mb-1">شماره بیجک (سیستمی)</label><div className="bg-white p-2 rounded border font-mono text-center text-red-600 font-bold">{nextBijakNum > 0 ? nextBijakNum : '---'}</div></div>
                            <div><label className="block text-xs font-bold mb-1">تاریخ خروج</label><DateSelect/></div>
                            <div><label className="block text-xs font-bold mb-1">تحویل گیرنده</label><input className="w-full border rounded p-2 bg-white" value={recipientName} onChange={e=>setRecipientName(e.target.value)}/></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div><label className="block text-xs font-bold mb-1">راننده</label><input className="w-full border rounded p-2 bg-white" value={driverName} onChange={e=>setDriverName(e.target.value)}/></div>
                            <div><label className="block text-xs font-bold mb-1">پلاک</label><input className="w-full border rounded p-2 bg-white dir-ltr" value={plateNumber} onChange={e=>setPlateNumber(e.target.value)}/></div>
                            <div><label className="block text-xs font-bold mb-1">مقصد</label><input className="w-full border rounded p-2 bg-white" value={destination} onChange={e=>setDestination(e.target.value)}/></div>
                        </div>
                        <div className="space-y-2 bg-white p-4 rounded-xl border">
                            {txItems.map((row, idx) => (
                                <div key={idx} className="flex gap-2 items-end">
                                    <div className="flex-1"><label className="text-[10px] text-gray-500">کالا</label><select className="w-full border rounded p-2 text-sm" value={row.itemId} onChange={e=>updateTxItem(idx, 'itemId', e.target.value)}><option value="">انتخاب...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></div>
                                    <div className="w-20"><label className="text-[10px] text-gray-500">تعداد</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.quantity} onChange={e=>updateTxItem(idx, 'quantity', e.target.value)}/></div>
                                    <div className="w-20"><label className="text-[10px] text-gray-500">وزن</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={row.weight} onChange={e=>updateTxItem(idx, 'weight', e.target.value)}/></div>
                                    <div className="w-32"><label className="text-[10px] text-gray-500">فی (ریال)</label><input type="text" className="w-full border rounded p-2 text-sm dir-ltr font-bold text-blue-600" value={formatNumberString(row.unitPrice)} onChange={e=>updateTxItem(idx, 'unitPrice', deformatNumberString(e.target.value))}/></div>
                                    {idx > 0 && <button onClick={()=>handleRemoveTxItemRow(idx)} className="text-red-500 p-2"><Trash2 size={16}/></button>}
                                </div>
                            ))}
                            <button onClick={handleAddTxItemRow} className="text-xs text-blue-600 font-bold flex items-center gap-1 mt-2"><Plus size={14}/> افزودن ردیف کالا</button>
                        </div>
                        <button onClick={()=>handleSubmitTx('OUT')} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-red-700 shadow-lg">ثبت و صدور بیجک</button>
                    </div>
                )}

                {/* REPORTS */}
                {activeTab === 'reports' && (
                    <div className="space-y-6">
                        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full"><label className="text-xs font-bold block mb-1">جستجو (کالا/گیرنده)</label><input className="w-full border rounded p-2 text-sm" value={reportSearch} onChange={e=>setReportSearch(e.target.value)} placeholder="..."/></div>
                            <div className="w-full md:w-64"><label className="text-xs font-bold block mb-1">فیلتر شرکت</label><select className="w-full border rounded p-2 text-sm" value={reportFilterCompany} onChange={e=>setReportFilterCompany(e.target.value)}><option value="">همه</option>{settings?.companyNames.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Balance Report */}
                            <div className="bg-white rounded-xl border overflow-hidden">
                                <div className="bg-indigo-50 p-3 font-bold text-indigo-800 border-b border-indigo-100 flex items-center gap-2"><BarChart3 size={18}/> موجودی انبار (مانده)</div>
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-gray-100 text-gray-600"><tr><th className="p-3">کالا</th><th className="p-3">شرکت</th><th className="p-3">تعداد</th><th className="p-3">وزن</th></tr></thead>
                                    <tbody className="divide-y">
                                        {getInventoryBalance().map((row, i) => (
                                            <tr key={i} className="hover:bg-gray-50">
                                                <td className="p-3 font-bold">{row.name}</td>
                                                <td className="p-3 text-xs text-gray-500">{row.company}</td>
                                                <td className={`p-3 font-mono font-bold ${row.qty < 0 ? 'text-red-500' : 'text-gray-800'}`}>{row.qty}</td>
                                                <td className="p-3 font-mono text-gray-600">{row.weight}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Kardex / Transactions List */}
                            <div className="bg-white rounded-xl border overflow-hidden h-[500px] flex flex-col">
                                <div className="bg-gray-100 p-3 font-bold text-gray-800 border-b flex items-center gap-2"><FileText size={18}/> لیست تراکنش‌ها (کاردکس)</div>
                                <div className="flex-1 overflow-y-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-50 text-gray-600 sticky top-0"><tr><th className="p-3">نوع/شماره</th><th className="p-3">تاریخ</th><th className="p-3">شرکت</th><th className="p-3">گیرنده/توضیح</th><th className="p-3">عملیات</th></tr></thead>
                                        <tbody className="divide-y">
                                            {getKardex().map((tx) => (
                                                <tr key={tx.id} className="hover:bg-gray-50">
                                                    <td className="p-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${tx.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{tx.type === 'IN' ? 'ورود' : `بیجک ${tx.number}`}</span>
                                                    </td>
                                                    <td className="p-3 text-xs">{formatDate(tx.date)}</td>
                                                    <td className="p-3 text-xs text-gray-500">{tx.company}</td>
                                                    <td className="p-3 text-xs truncate max-w-[150px]">{tx.type === 'IN' ? `پروفرما: ${tx.proformaNumber}` : tx.recipientName}</td>
                                                    <td className="p-3 flex gap-1">
                                                        {tx.type === 'OUT' && <button onClick={() => setViewBijak(tx)} className="text-blue-500 hover:bg-blue-50 p-1 rounded"><Eye size={16}/></button>}
                                                        <button onClick={() => handleDeleteTx(tx.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={16}/></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* PRINT MODAL */}
            {viewBijak && (
                <PrintBijak 
                    tx={viewBijak} 
                    onClose={() => setViewBijak(null)} 
                    settings={settings} 
                />
            )}
        </div>
    );
};

export default WarehouseModule;
