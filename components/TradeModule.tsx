import React, { useState, useEffect } from 'react';
import { User, TradeRecord, TradeItem, TradeTransaction } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, getSettings } from '../services/storageService';
import { formatNumberString, deformatNumberString, formatCurrency, generateUUID } from '../constants';
import { FileText, History, Package, Plus, Trash2, ChevronRight, LayoutDashboard } from 'lucide-react';

interface TradeModuleProps {
    currentUser: User;
}

const TradeModule: React.FC<TradeModuleProps> = ({ currentUser }) => {
    const [records, setRecords] = useState<TradeRecord[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<TradeRecord | null>(null);
    const [activeTab, setActiveTab] = useState('proforma');
    const [availableBanks, setAvailableBanks] = useState<string[]>([]);
    
    // New Transaction State
    const [newLicenseTx, setNewLicenseTx] = useState<{amount: number, date: string, bank: string, description: string}>({
        amount: 0, date: '', bank: '', description: ''
    });

    // New Item State
    const [newItem, setNewItem] = useState<{name: string, weight: number, unitPrice: number, totalPrice: number}>({
        name: '', weight: 0, unitPrice: 0, totalPrice: 0
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const data = await getTradeRecords();
        setRecords(data);
        const settings = await getSettings();
        setAvailableBanks(settings.bankNames || []);
    };

    const handleUpdateProforma = (field: keyof TradeRecord, value: any) => {
        if (!selectedRecord) return;
        const updated = { ...selectedRecord, [field]: value };
        setSelectedRecord(updated);
        updateTradeRecord(updated);
    };

    const handleAddLicenseTx = () => {
        if (!selectedRecord || !newLicenseTx.amount) return;
        const tx: TradeTransaction = {
            id: generateUUID(),
            amount: newLicenseTx.amount,
            date: newLicenseTx.date,
            bank: newLicenseTx.bank,
            description: newLicenseTx.description
        };
        const updatedLicenseData = {
            ...selectedRecord.licenseData,
            transactions: [...(selectedRecord.licenseData?.transactions || []), tx]
        };
        const updated = { ...selectedRecord, licenseData: updatedLicenseData };
        setSelectedRecord(updated);
        updateTradeRecord(updated);
        setNewLicenseTx({ amount: 0, date: '', bank: '', description: '' });
    };

    const handleRemoveLicenseTx = (id: string) => {
        if (!selectedRecord || !selectedRecord.licenseData) return;
        const updatedLicenseData = {
            ...selectedRecord.licenseData,
            transactions: selectedRecord.licenseData.transactions.filter(t => t.id !== id)
        };
        const updated = { ...selectedRecord, licenseData: updatedLicenseData };
        setSelectedRecord(updated);
        updateTradeRecord(updated);
    };

    const handleAddItem = () => {
        if (!selectedRecord || !newItem.name) return;
        const item: TradeItem = {
            id: generateUUID(),
            name: newItem.name,
            weight: newItem.weight,
            unitPrice: newItem.unitPrice,
            totalPrice: newItem.totalPrice || (newItem.weight * newItem.unitPrice)
        };
        const updated = { ...selectedRecord, items: [...selectedRecord.items, item] };
        setSelectedRecord(updated);
        updateTradeRecord(updated);
        setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
    };

    const handleRemoveItem = (id: string) => {
        if (!selectedRecord) return;
        const updated = { ...selectedRecord, items: selectedRecord.items.filter(i => i.id !== id) };
        setSelectedRecord(updated);
        updateTradeRecord(updated);
    };

    // If no record selected, show list
    if (!selectedRecord) {
        return (
            <div className="p-6 bg-white rounded-xl shadow-sm border">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">پرونده‌های بازرگانی</h2>
                    <button onClick={() => {
                        const newRecord: TradeRecord = {
                            id: generateUUID(),
                            fileNumber: '',
                            sellerName: '',
                            items: [],
                            freightCost: 0,
                            startDate: new Date().toISOString(),
                            status: 'Active',
                            stages: {},
                            createdAt: Date.now(),
                            createdBy: currentUser.username
                        };
                        saveTradeRecord(newRecord).then(() => {
                            setRecords([...records, newRecord]);
                            setSelectedRecord(newRecord);
                        });
                    }} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                        <Plus size={18} /> پرونده جدید
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {records.map(r => (
                        <div key={r.id} onClick={() => setSelectedRecord(r)} className="border p-4 rounded-xl cursor-pointer hover:shadow-md transition-all bg-gray-50 hover:bg-white hover:border-blue-300">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-bold text-gray-800">{r.sellerName || 'بدون نام'}</span>
                                <span className="text-xs bg-gray-200 px-2 py-1 rounded">{r.status}</span>
                            </div>
                            <div className="text-sm text-gray-600">شماره پرونده: {r.fileNumber || '-'}</div>
                            <div className="text-sm text-gray-600">ثبت سفارش: {r.registrationNumber || '-'}</div>
                        </div>
                    ))}
                    {records.length === 0 && <div className="col-span-3 text-center text-gray-400 py-10">هیچ پرونده‌ای یافت نشد</div>}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setSelectedRecord(null)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={24}/></button>
                <h2 className="text-xl font-bold text-gray-800">مدیریت پرونده: {selectedRecord.sellerName}</h2>
            </div>
            
            <div className="flex border-b overflow-x-auto">
                <button onClick={() => setActiveTab('proforma')} className={`px-6 py-3 font-medium text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === 'proforma' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>پروفرما و ثبت سفارش</button>
                {/* Add other tabs here as placeholders if needed */}
            </div>

            {/* The content provided in the prompt starts here */}
            {activeTab === 'proforma' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* General Info */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2"><LayoutDashboard size={20} className="text-gray-600"/> اطلاعات پایه</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">فروشنده</label><input className="w-full border rounded p-2 text-sm" value={selectedRecord.sellerName} onChange={e => handleUpdateProforma('sellerName', e.target.value)} /></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره پرونده</label><input className="w-full border rounded p-2 text-sm" value={selectedRecord.fileNumber} onChange={e => handleUpdateProforma('fileNumber', e.target.value)} /></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">ارز پایه</label><input className="w-full border rounded p-2 text-sm" value={selectedRecord.mainCurrency || ''} onChange={e => handleUpdateProforma('mainCurrency', e.target.value)} placeholder="USD, EUR, ..." /></div>
                        </div>
                    </div>

                    {/* Registration Info */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <FileText size={20} className="text-blue-600"/> 
                            اطلاعات ثبت سفارش
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700">شماره ثبت سفارش</label>
                                <input 
                                    className="w-full border rounded p-2 text-sm dir-ltr font-mono" 
                                    value={selectedRecord.registrationNumber || ''} 
                                    onChange={(e) => handleUpdateProforma('registrationNumber', e.target.value)} 
                                    placeholder="8-digit code"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700">تاریخ صدور</label>
                                <input 
                                    className="w-full border rounded p-2 text-sm dir-ltr" 
                                    value={selectedRecord.registrationDate || ''} 
                                    onChange={(e) => handleUpdateProforma('registrationDate', e.target.value)} 
                                    placeholder="1403/01/01"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700">مهلت اعتبار</label>
                                <input 
                                    className="w-full border rounded p-2 text-sm dir-ltr" 
                                    value={selectedRecord.registrationExpiry || ''} 
                                    onChange={(e) => handleUpdateProforma('registrationExpiry', e.target.value)} 
                                    placeholder="1403/06/01"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700">نوع ارز (منشا)</label>
                                <select 
                                    className="w-full border rounded p-2 text-sm bg-white" 
                                    value={selectedRecord.currencyAllocationType || ''} 
                                    onChange={(e) => handleUpdateProforma('currencyAllocationType', e.target.value)}
                                >
                                    <option value="">-- انتخاب کنید --</option>
                                    <option value="ارز مبادله ای">ارز مبادله ای</option>
                                    <option value="ارز حاصل از صادرات دیگران">ارز حاصل از صادرات دیگران</option>
                                    <option value="ارز حاصل از صادرات خود">ارز حاصل از صادرات خود</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* License Transactions Section */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2"><History size={20} className="text-orange-600"/> سوابق پرداخت هزینه‌های مجوز/ثبت سفارش</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-orange-50 p-4 rounded-lg">
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newLicenseTx.amount)} onChange={e => setNewLicenseTx({...newLicenseTx, amount: deformatNumberString(e.target.value)})} /></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/01/01" value={newLicenseTx.date} onChange={e => setNewLicenseTx({...newLicenseTx, date: e.target.value})} /></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">بانک</label><select className="w-full border rounded p-2 text-sm" value={newLicenseTx.bank} onChange={e => setNewLicenseTx({...newLicenseTx, bank: e.target.value})}><option value="">انتخاب بانک</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شرح</label><input className="w-full border rounded p-2 text-sm" value={newLicenseTx.description} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})} /></div>
                            <div className="md:col-span-4 flex justify-end"><button onClick={handleAddLicenseTx} className="bg-orange-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-orange-700 flex items-center gap-2"><Plus size={16}/> افزودن پرداخت</button></div>
                        </div>
                        <div className="space-y-2">
                            {selectedRecord.licenseData?.transactions?.map((tx, idx) => (
                                <div key={tx.id} className="flex justify-between items-center bg-white border p-3 rounded-lg shadow-sm">
                                    <div className="flex gap-4 text-sm"><span className="font-bold text-gray-800">{idx + 1}.</span><span>{tx.date}</span><span className="font-mono font-bold text-blue-600">{formatCurrency(tx.amount)}</span><span>{tx.bank}</span><span className="text-gray-500">{tx.description}</span></div>
                                    <button onClick={() => handleRemoveLicenseTx(tx.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                                </div>
                            ))}
                            {(!selectedRecord.licenseData?.transactions || selectedRecord.licenseData.transactions.length === 0) && <div className="text-center text-gray-400 py-4 text-sm">هیچ پرداختی ثبت نشده است</div>}
                        </div>
                    </div>

                    {/* Items Section with Freight Cost */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2"><Package size={20} className="text-blue-600"/> اقلام پروفرما</h3>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-blue-50 p-4 rounded-lg">
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">نام کالا</label><input className="w-full border rounded p-2 text-sm" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">وزن (KG)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})} /></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">فی ({selectedRecord.mainCurrency})</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={newItem.unitPrice} onChange={e => setNewItem({...newItem, unitPrice: Number(e.target.value)})} /></div>
                            <div className="space-y-1"><label className="text-xs font-bold text-gray-700">کل ({selectedRecord.mainCurrency})</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={newItem.totalPrice || (Number(newItem.weight) * Number(newItem.unitPrice))} onChange={e => setNewItem({...newItem, totalPrice: Number(e.target.value)})} /></div>
                            <button onClick={handleAddItem} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 h-[38px]"><Plus size={16} /></button>
                        </div>
                        <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">ردیف</th><th className="p-3">شرح کالا</th><th className="p-3">وزن</th><th className="p-3">فی</th><th className="p-3">کل</th><th className="p-3">عملیات</th></tr></thead><tbody>{selectedRecord.items.map((item, idx) => (<tr key={item.id} className="border-b hover:bg-gray-50"><td className="p-3">{idx + 1}</td><td className="p-3 font-bold">{item.name}</td><td className="p-3 font-mono">{formatNumberString(item.weight)}</td><td className="p-3 font-mono">{formatNumberString(item.unitPrice)}</td><td className="p-3 font-mono font-bold text-blue-600">{formatNumberString(item.totalPrice)}</td><td className="p-3"><button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
                        
                        {/* NEW: Freight Cost & Total */}
                        <div className="flex flex-col md:flex-row justify-between items-center pt-4 border-t mt-4 bg-gray-50 p-4 rounded-lg gap-4">
                                <div className="flex gap-4 items-center">
                                    <label className="font-bold text-gray-700 text-sm">هزینه حمل کل (Freight Cost):</label>
                                    <div className="flex gap-2 items-center">
                                        <input
                                        className="border rounded p-2 text-sm dir-ltr font-mono font-bold w-32"
                                        value={formatNumberString(selectedRecord.freightCost)}
                                        onChange={(e) => handleUpdateProforma('freightCost', deformatNumberString(e.target.value))}
                                        />
                                        <span className="text-xs text-gray-500 font-bold">{selectedRecord.mainCurrency}</span>
                                    </div>
                                </div>
                                <div className="text-sm font-bold text-blue-800 bg-blue-100 px-4 py-2 rounded-lg">
                                    جمع کل پروفرما: {formatCurrency(selectedRecord.items.reduce((s, i) => s + i.totalPrice, 0) + (selectedRecord.freightCost || 0))} {selectedRecord.mainCurrency}
                                </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TradeModule;