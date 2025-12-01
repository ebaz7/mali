
import React, { useState, useEffect, useRef } from 'react';
import { User, TradeRecord, TradeStage, TradeStageData, TradeItem, SystemSettings, InsuranceEndorsement, CurrencyPayment, CurrencyPurchaseData, TradeTransaction, CurrencyTranche } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, deleteTradeRecord, uploadFile, getSettings } from '../services/storageService';
import { generateUUID, formatCurrency, formatNumberString, deformatNumberString, getCurrentShamsiDate, parsePersianDate, normalizeInputNumber } from '../constants';
import { Container, Plus, Search, CheckCircle2, Circle, Paperclip, Save, Loader2, Trash2, X, Package, ArrowRight, TrendingDown, TrendingUp, History, Calendar, Banknote, Coins, Filter, RefreshCw, Wallet, CheckSquare, Square, FileSpreadsheet, FileDown, Shield, LayoutDashboard, Plane, Ship, Truck, Layers, PieChart as PieIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface TradeModuleProps {
    currentUser: User;
}

const STAGES = Object.values(TradeStage);
const CURRENCIES = [
    { code: 'EUR', label: 'یورو (€)' },
    { code: 'USD', label: 'دلار ($)' },
    { code: 'AED', label: 'درهم (AED)' },
    { code: 'CNY', label: 'یوان (¥)' },
    { code: 'TRY', label: 'لیر (₺)' },
];

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

const TradeModule: React.FC<TradeModuleProps> = ({ currentUser }) => {
    const [records, setRecords] = useState<TradeRecord[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<TradeRecord | null>(null);
    const [loading, setLoading] = useState(false);
    const [commodityGroups, setCommodityGroups] = useState<string[]>([]);
    const [availableBanks, setAvailableBanks] = useState<string[]>([]);
    const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);

    const [viewMode, setViewMode] = useState<'dashboard' | 'details' | 'insurance_report' | 'currency_report'>('dashboard');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Form States
    const [showNewModal, setShowNewModal] = useState(false);
    const [newFileNumber, setNewFileNumber] = useState('');
    const [newGoodsName, setNewGoodsName] = useState('');
    const [newSellerName, setNewSellerName] = useState('');
    const [newCommodityGroup, setNewCommodityGroup] = useState('');
    const [newMainCurrency, setNewMainCurrency] = useState('EUR');
    const [newRecordCompany, setNewRecordCompany] = useState('');
    const [activeTab, setActiveTab] = useState<'timeline' | 'proforma' | 'insurance' | 'currency_purchase'>('timeline');
    const [newItem, setNewItem] = useState<Partial<TradeItem>>({ name: '', weight: 0, unitPrice: 0 });
    
    // Insurance State
    const [insuranceForm, setInsuranceForm] = useState<NonNullable<TradeRecord['insuranceData']>>({ policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] });
    const [newEndorsement, setNewEndorsement] = useState<Partial<InsuranceEndorsement>>({ amount: 0, description: '', date: '' });
    
    // License Transactions State
    const [newLicenseTx, setNewLicenseTx] = useState<Partial<TradeTransaction>>({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });

    // Currency Purchase State
    const [currencyForm, setCurrencyForm] = useState<CurrencyPurchaseData>({
        payments: [], purchasedAmount: 0, purchasedCurrencyType: '', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: '', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: []
    });
    
    // Currency Tranche State
    const [newCurrencyTranche, setNewCurrencyTranche] = useState<Partial<CurrencyTranche>>({ amount: 0, currencyType: 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });

    useEffect(() => {
        loadRecords();
        getSettings().then(s => {
            setCommodityGroups(s.commodityGroups || []);
            setAvailableBanks(s.bankNames || []);
            setAvailableCompanies(s.companyNames || []);
            setNewRecordCompany(s.defaultCompany || '');
        });
    }, []);

    useEffect(() => {
        if (selectedRecord) {
            // Insurance Sync
            if (selectedRecord.insuranceData) {
                setInsuranceForm(selectedRecord.insuranceData);
            } else {
                setInsuranceForm({ policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] });
            }
            
            // Currency Sync
            const curData = selectedRecord.currencyPurchaseData || { 
                payments: [], purchasedAmount: 0, purchasedCurrencyType: selectedRecord.mainCurrency || 'EUR', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: selectedRecord.mainCurrency || 'EUR', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: []
            };
            
            // Ensure tranches exist (migration for old data)
            if (!curData.tranches) curData.tranches = [];
            
            setCurrencyForm(curData);
            
            setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
            setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });
        }
    }, [selectedRecord]);

    const loadRecords = async () => {
        setLoading(true);
        const data = await getTradeRecords();
        setRecords(data);
        setLoading(false);
    };

    const getStage = (record: TradeRecord | null, stage: TradeStage) => {
        if (!record || !record.stages) return { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: 'EUR', attachments: [], updatedAt: 0, updatedBy: '' };
        return record.stages[stage] || { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: 'EUR', attachments: [], updatedAt: 0, updatedBy: '' };
    };

    const handleCreateRecord = async () => { if (!newFileNumber || !newGoodsName) return; const newRecord: TradeRecord = { id: generateUUID(), company: newRecordCompany, fileNumber: newFileNumber, orderNumber: newFileNumber, goodsName: newGoodsName, sellerName: newSellerName, commodityGroup: newCommodityGroup, mainCurrency: newMainCurrency, items: [], freightCost: 0, startDate: new Date().toISOString(), status: 'Active', stages: {}, createdAt: Date.now(), createdBy: currentUser.fullName, licenseData: { transactions: [] } }; STAGES.forEach(stage => { newRecord.stages[stage] = { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: newMainCurrency, attachments: [], updatedAt: Date.now(), updatedBy: '' }; }); await saveTradeRecord(newRecord); await loadRecords(); setShowNewModal(false); setNewFileNumber(''); setNewGoodsName(''); setNewSellerName(''); setNewCommodityGroup(''); setNewMainCurrency('EUR'); setSelectedRecord(newRecord); setActiveTab('proforma'); setViewMode('details'); };
    const handleDeleteRecord = async (id: string) => { if (confirm("آیا از حذف این پرونده بازرگانی اطمینان دارید؟")) { await deleteTradeRecord(id); if (selectedRecord?.id === id) setSelectedRecord(null); loadRecords(); } };
    
    // --- Proforma Handlers ---
    const handleUpdateProforma = (field: keyof TradeRecord, value: string | number) => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, [field]: value }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddLicenseTx = async () => { if (!selectedRecord || !newLicenseTx.amount) return; const tx: TradeTransaction = { id: generateUUID(), date: newLicenseTx.date || '', amount: Number(newLicenseTx.amount), bank: newLicenseTx.bank || '', description: newLicenseTx.description || '' }; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = [...(currentLicenseData.transactions || []), tx]; const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStage(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; updatedRecord.stages[TradeStage.LICENSES].isCompleted = totalCost > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' }); };
    const handleRemoveLicenseTx = async (id: string) => { if (!selectedRecord) return; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = (currentLicenseData.transactions || []).filter(t => t.id !== id); const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStage(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    // --- Insurance Handlers ---
    const handleSaveInsurance = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, insuranceData: insuranceForm }; const totalCost = (Number(insuranceForm.cost) || 0) + (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStage(updatedRecord, TradeStage.INSURANCE); updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost; updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!insuranceForm.policyNumber; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert("اطلاعات بیمه ذخیره شد."); };
    const handleAddEndorsement = () => { if (!newEndorsement.amount) return; const endorsement: InsuranceEndorsement = { id: generateUUID(), date: newEndorsement.date || '', amount: Number(newEndorsement.amount), description: newEndorsement.description || '' }; const updatedEndorsements = [...(insuranceForm.endorsements || []), endorsement]; setInsuranceForm({ ...insuranceForm, endorsements: updatedEndorsements }); setNewEndorsement({ amount: 0, description: '', date: '' }); };
    const handleDeleteEndorsement = (id: string) => { setInsuranceForm({ ...insuranceForm, endorsements: insuranceForm.endorsements?.filter(e => e.id !== id) }); };
    const calculateInsuranceTotal = () => { const base = Number(insuranceForm.cost) || 0; const endorsed = (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); return base + endorsed; };

    // --- Currency Handlers ---
    const handleAddCurrencyTranche = async () => {
        if (!selectedRecord || !newCurrencyTranche.amount) return;
        const tranche: CurrencyTranche = { id: generateUUID(), date: newCurrencyTranche.date || '', amount: Number(newCurrencyTranche.amount), currencyType: newCurrencyTranche.currencyType || selectedRecord.mainCurrency || 'EUR', brokerName: newCurrencyTranche.brokerName || '', exchangeName: newCurrencyTranche.exchangeName || '', rate: Number(newCurrencyTranche.rate) || 0, isDelivered: newCurrencyTranche.isDelivered, deliveryDate: newCurrencyTranche.deliveryDate };
        const currentTranches = currencyForm.tranches || [];
        const updatedTranches = [...currentTranches, tranche];
        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
        const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0);
        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
        setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });
    };

    const handleUpdateTrancheDelivery = async (id: string, isDelivered: boolean, deliveryDate?: string) => {
        if (!selectedRecord) return;
        const updatedTranches = (currencyForm.tranches || []).map(t => { if (t.id === id) return { ...t, isDelivered, deliveryDate }; return t; });
        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
        const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0);
        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleRemoveTranche = async (id: string) => {
        if (!selectedRecord) return;
        if (!confirm('آیا از حذف این پارت خرید ارز مطمئن هستید؟')) return;
        const updatedTranches = (currencyForm.tranches || []).filter(t => t.id !== id);
        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
        const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0);
        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    }

    // --- Search Logic ---
    const filteredRecords = records.filter(r => {
        const term = searchTerm.toLowerCase();
        return (
            r.fileNumber.toLowerCase().includes(term) ||
            (r.registrationNumber || '').toLowerCase().includes(term) ||
            r.sellerName.toLowerCase().includes(term) ||
            r.goodsName?.toLowerCase().includes(term) ||
            r.company?.toLowerCase().includes(term)
        );
    });

    // --- Stats Calculation ---
    const stats = {
        totalActive: filteredRecords.filter(r => r.status === 'Active').length,
        totalCurrency: filteredRecords.reduce((acc, r) => acc + (r.currencyPurchaseData?.purchasedAmount || 0), 0),
        pendingInsurance: filteredRecords.filter(r => !r.stages[TradeStage.INSURANCE]?.isCompleted).length,
        allocationQueue: filteredRecords.filter(r => r.stages[TradeStage.ALLOCATION_QUEUE]?.isCompleted === false && r.stages[TradeStage.INSURANCE]?.isCompleted === true).length
    };

    // --- Render ---

    if (viewMode === 'currency_report') {
        return (
             <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                        <div className="bg-green-100 p-2 rounded-lg text-green-700"><Coins size={24}/></div>
                        <div><h2 className="text-xl font-bold text-gray-800">گزارش جامع خرید ارز</h2><p className="text-xs text-gray-500 mt-1">تفکیک بر اساس سفارش و پارت‌های ارزی</p></div>
                    </div>
                    <button onClick={() => setViewMode('dashboard')} className="text-gray-500 hover:text-gray-700 flex items-center gap-1"><ArrowRight size={16}/> بازگشت</button>
                </div>
                
                {/* Global Search inside Report */}
                <div className="mb-6 bg-gray-50 p-3 rounded-xl border flex items-center gap-2 max-w-md">
                     <Search size={20} className="text-gray-400" />
                     <input type="text" placeholder="جستجو (شماره پرونده، ثبت سفارش، فروشنده...)" className="bg-transparent outline-none w-full text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>

                <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm text-right border-collapse">
                        <thead className="bg-slate-800 text-white font-bold text-xs">
                            <tr>
                                <th className="p-3 border-l border-slate-700 w-64">مشخصات سفارش / پرونده</th>
                                <th className="p-3 border-l border-slate-700 w-32 text-center">مبلغ پارت</th>
                                <th className="p-3 border-l border-slate-700 w-16 text-center">ارز</th>
                                <th className="p-3 border-l border-slate-700 w-24 text-center">نرخ (ریال)</th>
                                <th className="p-3 border-l border-slate-700 w-32">تاریخ خرید</th>
                                <th className="p-3 border-l border-slate-700">صرافی / کارگزار</th>
                                <th className="p-3 border-l border-slate-700 w-24 text-center">وضعیت تحویل</th>
                                <th className="p-3 text-center w-24">تاریخ تحویل</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {filteredRecords.map(r => {
                                const tranches = r.currencyPurchaseData?.tranches || [];
                                const rowCount = Math.max(tranches.length, 1);
                                return (
                                    <React.Fragment key={r.id}>
                                        {Array.from({length: rowCount}).map((_, idx) => {
                                            const tranche = tranches[idx];
                                            return (
                                                <tr key={`${r.id}-${idx}`} className="hover:bg-blue-50/30 transition-colors">
                                                    {idx === 0 && (
                                                        <td className="p-3 border-l align-top bg-white" rowSpan={rowCount}>
                                                            <div className="font-bold text-gray-800">{r.fileNumber}</div>
                                                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1"><FileSpreadsheet size={10}/> ثبت سفارش: {r.registrationNumber || '-'}</div>
                                                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Package size={10}/> کالا: {r.goodsName}</div>
                                                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1"><Wallet size={10}/> فروشنده: {r.sellerName}</div>
                                                            <div className="mt-2 inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{r.company}</div>
                                                        </td>
                                                    )}
                                                    {tranche ? (
                                                        <>
                                                            <td className="p-3 border-l text-center font-mono font-bold text-blue-600 dir-ltr">{formatNumberString(tranche.amount.toString())}</td>
                                                            <td className="p-3 border-l text-center">{tranche.currencyType}</td>
                                                            <td className="p-3 border-l text-center font-mono text-gray-500 dir-ltr">{formatCurrency(tranche.rate || 0)}</td>
                                                            <td className="p-3 border-l text-gray-600">{tranche.date}</td>
                                                            <td className="p-3 border-l text-gray-600">{tranche.exchangeName} {tranche.brokerName ? `(${tranche.brokerName})` : ''}</td>
                                                            <td className="p-3 border-l text-center">{tranche.isDelivered ? <span className="inline-flex items-center gap-1 text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded-full"><CheckCircle2 size={12}/> تحویل شده</span> : <span className="text-gray-400 text-xs">-</span>}</td>
                                                            <td className="p-3 text-center text-xs">{tranche.deliveryDate || '-'}</td>
                                                        </>
                                                    ) : (
                                                        <td colSpan={7} className="p-4 text-center text-gray-300 italic">بدون سابقه خرید ارز</td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                        {tranches.length > 0 && (
                                           <tr className="bg-gray-50 border-b-2 border-gray-300">
                                               <td colSpan={1} className="p-2 border-l text-left text-xs font-bold text-gray-500">مجموع این سفارش:</td>
                                               <td colSpan={7} className="p-2 font-mono text-xs font-bold text-gray-700 dir-ltr text-right px-4">
                                                   {formatNumberString(tranches.reduce((acc, t) => acc + t.amount, 0).toString())} {r.mainCurrency}
                                               </td>
                                           </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
             </div>
        );
    }

    if (viewMode === 'details' && selectedRecord) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-100px)] animate-fade-in">
                <div className="bg-slate-800 text-white p-4 flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => { setSelectedRecord(null); setViewMode('dashboard'); }} className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg transition-colors"><ArrowRight size={20} /></button>
                        <div><h2 className="font-bold text-lg flex items-center gap-2"><FileSpreadsheet size={20} className="text-blue-400"/> پرونده: {selectedRecord.fileNumber}</h2><div className="text-xs text-slate-400 flex gap-3 mt-1"><span>{selectedRecord.goodsName}</span><span>|</span><span>{selectedRecord.sellerName}</span><span>|</span><span>{selectedRecord.company}</span></div></div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => handleDeleteRecord(selectedRecord.id)} className="bg-red-500/20 hover:bg-red-500 text-red-100 p-2 rounded-lg transition-colors"><Trash2 size={18} /></button>
                    </div>
                </div>
                
                <div className="flex flex-1 overflow-hidden">
                    <div className="w-64 bg-slate-50 border-l border-gray-200 flex flex-col">
                        <button onClick={() => setActiveTab('timeline')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'timeline' ? 'bg-white border-r-4 border-r-blue-600 text-blue-700 font-bold shadow-sm' : 'text-gray-600'}`}><LayoutDashboard size={18} /> نمای کلی و مراحل</button>
                        <button onClick={() => setActiveTab('proforma')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'proforma' ? 'bg-white border-r-4 border-r-amber-500 text-amber-700 font-bold shadow-sm' : 'text-gray-600'}`}><FileSpreadsheet size={18} /> مجوزها و پروفرما</button>
                        <button onClick={() => setActiveTab('insurance')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'insurance' ? 'bg-white border-r-4 border-r-purple-500 text-purple-700 font-bold shadow-sm' : 'text-gray-600'}`}><Shield size={18} /> بیمه و الحاقیه‌ها</button>
                        <button onClick={() => setActiveTab('currency_purchase')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'currency_purchase' ? 'bg-white border-r-4 border-r-green-500 text-green-700 font-bold shadow-sm' : 'text-gray-600'}`}><Coins size={18} /> خرید و تحویل ارز</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                        {activeTab === 'timeline' && (
                             <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                                <LayoutDashboard size={48} className="opacity-20"/>
                                <p>نمای کلی پرونده و وضعیت مراحل در حال تکمیل است...</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mt-8">
                                    {STAGES.map((s, idx) => {
                                        const isDone = selectedRecord.stages[s]?.isCompleted;
                                        return (
                                            <div key={idx} className={`p-4 rounded-xl border flex items-center gap-3 ${isDone ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
                                                {isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                                <span className="text-sm font-bold">{s}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                             </div>
                        )}

                        {activeTab === 'proforma' && (
                            <div className="space-y-6 animate-fade-in">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2"><FileSpreadsheet size={20} className="text-amber-600"/> اطلاعات ثبت سفارش و مجوزها</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">شماره ثبت سفارش</label><input className="w-full border rounded-lg p-2 text-sm" value={selectedRecord.registrationNumber || ''} onChange={e => handleUpdateProforma('registrationNumber', e.target.value)} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">تاریخ صدور ثبت سفارش</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" placeholder="YYYY/MM/DD" value={selectedRecord.registrationDate || ''} onChange={e => handleUpdateProforma('registrationDate', e.target.value)} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">مهلت ثبت سفارش</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" placeholder="YYYY/MM/DD" value={selectedRecord.registrationExpiry || ''} onChange={e => handleUpdateProforma('registrationExpiry', e.target.value)} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">بانک عامل</label><select className="w-full border rounded-lg p-2 text-sm" value={selectedRecord.operatingBank || ''} onChange={e => handleUpdateProforma('operatingBank', e.target.value)}><option value="">انتخاب بانک...</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                </div>
                                <div className="mt-8">
                                    <h4 className="font-bold text-gray-700 mb-3">هزینه‌های مجوز و ثبت سفارش</h4>
                                    <div className="flex gap-2 mb-4 items-end bg-gray-50 p-3 rounded-lg border">
                                        <input className="border rounded px-2 py-1 text-sm w-32" placeholder="مبلغ (ریال)" value={newLicenseTx.amount || ''} onChange={e => setNewLicenseTx({...newLicenseTx, amount: Number(e.target.value)})} />
                                        <input className="border rounded px-2 py-1 text-sm" placeholder="شرح (مثال: کارمزد ثبت)" value={newLicenseTx.description || ''} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})} />
                                        <input className="border rounded px-2 py-1 text-sm w-24" placeholder="تاریخ" value={newLicenseTx.date || ''} onChange={e => setNewLicenseTx({...newLicenseTx, date: e.target.value})} />
                                        <button onClick={handleAddLicenseTx} className="bg-amber-600 text-white px-3 py-1 rounded text-sm hover:bg-amber-700">افزودن</button>
                                    </div>
                                    <table className="w-full text-sm text-right border">
                                        <thead className="bg-gray-100"><tr><th className="p-2 border">شرح</th><th className="p-2 border">تاریخ</th><th className="p-2 border">مبلغ</th><th className="p-2 border w-10"></th></tr></thead>
                                        <tbody>
                                            {selectedRecord.licenseData?.transactions.map(t => (
                                                <tr key={t.id}><td className="p-2 border">{t.description}</td><td className="p-2 border">{t.date}</td><td className="p-2 border">{formatCurrency(t.amount)}</td><td className="p-2 border"><button onClick={() => handleRemoveLicenseTx(t.id)} className="text-red-500"><Trash2 size={14}/></button></td></tr>
                                            ))}
                                            <tr className="bg-amber-50 font-bold"><td colSpan={2} className="p-2 border text-left">جمع کل:</td><td className="p-2 border">{formatCurrency(selectedRecord.stages[TradeStage.LICENSES]?.costRial || 0)}</td><td></td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'insurance' && (
                            <div className="space-y-6 animate-fade-in">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2"><Shield size={20} className="text-purple-600"/> بیمه باربری</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">شماره بیمه‌نامه</label><input className="w-full border rounded-lg p-2 text-sm" value={insuranceForm.policyNumber} onChange={e => setInsuranceForm({...insuranceForm, policyNumber: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">شرکت بیمه</label><input className="w-full border rounded-lg p-2 text-sm" value={insuranceForm.company} onChange={e => setInsuranceForm({...insuranceForm, company: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">حق بیمه پایه (ریال)</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" value={formatNumberString(insuranceForm.cost.toString())} onChange={e => setInsuranceForm({...insuranceForm, cost: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">بانک پرداخت کننده</label><select className="w-full border rounded-lg p-2 text-sm" value={insuranceForm.bank} onChange={e => setInsuranceForm({...insuranceForm, bank: e.target.value})}><option value="">انتخاب...</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Plus size={16}/> الحاقیه‌ها (افزایش/کاهش)</h4>
                                    <div className="flex gap-2 mb-4 items-end bg-purple-50 p-3 rounded-lg border border-purple-100">
                                        <input className="border rounded px-2 py-1 text-sm flex-1" placeholder="شرح الحاقیه" value={newEndorsement.description || ''} onChange={e => setNewEndorsement({...newEndorsement, description: e.target.value})} />
                                        <input className="border rounded px-2 py-1 text-sm w-32 dir-ltr" placeholder="مبلغ (+/-)" value={newEndorsement.amount || ''} onChange={e => setNewEndorsement({...newEndorsement, amount: Number(e.target.value)})} />
                                        <input className="border rounded px-2 py-1 text-sm w-24" placeholder="تاریخ" value={newEndorsement.date || ''} onChange={e => setNewEndorsement({...newEndorsement, date: e.target.value})} />
                                        <button onClick={handleAddEndorsement} className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700">افزودن</button>
                                    </div>
                                    <table className="w-full text-sm text-right border rounded-lg overflow-hidden">
                                        <thead className="bg-gray-100"><tr><th className="p-2 border">شرح</th><th className="p-2 border">تاریخ</th><th className="p-2 border">مبلغ</th><th className="p-2 border w-10"></th></tr></thead>
                                        <tbody>
                                            {insuranceForm.endorsements?.map(e => (
                                                <tr key={e.id}><td className="p-2 border">{e.description}</td><td className="p-2 border">{e.date}</td><td className={`p-2 border dir-ltr ${e.amount < 0 ? 'text-red-500' : 'text-green-600'}`}>{formatCurrency(e.amount)}</td><td className="p-2 border"><button onClick={() => handleDeleteEndorsement(e.id)} className="text-red-500"><Trash2 size={14}/></button></td></tr>
                                            ))}
                                            {(!insuranceForm.endorsements || insuranceForm.endorsements.length === 0) && <tr><td colSpan={4} className="text-center p-4 text-gray-400">بدون الحاقیه</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex justify-between items-center bg-gray-100 p-4 rounded-xl">
                                    <span className="font-bold text-gray-700">جمع کل هزینه بیمه:</span>
                                    <span className="font-mono font-bold text-xl text-blue-600 dir-ltr">{formatCurrency(calculateInsuranceTotal())}</span>
                                </div>
                                <div className="flex justify-end"><button onClick={handleSaveInsurance} className="bg-blue-600 text-white px-6 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-600/20"><Save size={18}/> ذخیره اطلاعات بیمه</button></div>
                            </div>
                        )}

                        {activeTab === 'currency_purchase' && (
                            <div className="space-y-6 animate-fade-in">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2"><Coins size={20} className="text-green-600"/> خرید و تحویل ارز</h3>
                                
                                <div className="bg-white border rounded-xl overflow-hidden mb-6 shadow-sm">
                                    <div className="bg-gray-50 p-3 border-b font-bold text-gray-700 flex justify-between items-center">
                                        <span>لیست پارت‌های خرید ارز (Tranches)</span>
                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">ارز پایه: {selectedRecord.mainCurrency}</span>
                                    </div>
                                    <div className="p-4 grid grid-cols-1 md:grid-cols-6 gap-2 bg-gray-50 border-b items-end">
                                        <div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">مبلغ ارزی</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="Amount" value={newCurrencyTranche.amount || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, amount: Number(e.target.value)})} /></div>
                                        <div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">نوع ارز</label><select className="w-full border rounded p-1.5 text-sm" value={newCurrencyTranche.currencyType} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, currencyType: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                                        <div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">نرخ ریالی</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="Rate" value={newCurrencyTranche.rate || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, rate: Number(e.target.value)})} /></div>
                                        <div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">صرافی</label><input className="w-full border rounded p-1.5 text-sm" placeholder="Exchange" value={newCurrencyTranche.exchangeName || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, exchangeName: e.target.value})} /></div>
                                        <div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">تاریخ</label><input className="w-full border rounded p-1.5 text-sm" placeholder="Date" value={newCurrencyTranche.date || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, date: e.target.value})} /></div>
                                        <div className="md:col-span-1"><button onClick={handleAddCurrencyTranche} className="w-full bg-green-600 text-white p-1.5 rounded text-sm hover:bg-green-700 h-[34px]">افزودن پارت</button></div>
                                    </div>
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 text-gray-600">
                                            <tr>
                                                <th className="p-3 border-b">مبلغ</th>
                                                <th className="p-3 border-b">ارز</th>
                                                <th className="p-3 border-b">نرخ</th>
                                                <th className="p-3 border-b">صرافی</th>
                                                <th className="p-3 border-b">تاریخ خرید</th>
                                                <th className="p-3 border-b text-center w-24">وضعیت تحویل</th>
                                                <th className="p-3 border-b w-32">تاریخ تحویل</th>
                                                <th className="p-3 border-b w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {currencyForm.tranches?.map((t, idx) => (
                                                <tr key={t.id || idx}>
                                                    <td className="p-3 font-mono dir-ltr font-bold text-gray-800">{formatNumberString(t.amount.toString())}</td>
                                                    <td className="p-3">{t.currencyType}</td>
                                                    <td className="p-3 font-mono text-gray-500">{formatCurrency(t.rate || 0)}</td>
                                                    <td className="p-3">{t.exchangeName}</td>
                                                    <td className="p-3">{t.date}</td>
                                                    <td className="p-3 text-center">
                                                        <input type="checkbox" checked={t.isDelivered || false} onChange={e => handleUpdateTrancheDelivery(t.id, e.target.checked, t.deliveryDate)} className="w-4 h-4 text-green-600 rounded cursor-pointer" />
                                                    </td>
                                                    <td className="p-3">
                                                        <input 
                                                            disabled={!t.isDelivered}
                                                            className={`w-full border rounded px-1 py-0.5 text-xs ${!t.isDelivered ? 'bg-gray-100 text-gray-400' : 'bg-white'}`}
                                                            placeholder="تاریخ..."
                                                            value={t.deliveryDate || ''}
                                                            onChange={e => handleUpdateTrancheDelivery(t.id, true, e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-3 text-center"><button onClick={() => handleRemoveTranche(t.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button></td>
                                                </tr>
                                            ))}
                                            {(!currencyForm.tranches || currencyForm.tranches.length === 0) && (
                                                <tr><td colSpan={8} className="p-4 text-center text-gray-400">هیچ پارت ارزی ثبت نشده است.</td></tr>
                                            )}
                                        </tbody>
                                        <tfoot className="bg-gray-50 font-bold">
                                            <tr>
                                                <td className="p-3 border-t">جمع کل:</td>
                                                <td className="p-3 border-t font-mono dir-ltr text-blue-600" colSpan={7}>{formatNumberString(currencyForm.purchasedAmount.toString())} {selectedRecord.mainCurrency}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // --- Dashboard View (Default) ---
    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {showNewModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
                        <h3 className="text-xl font-bold mb-6">ایجاد پرونده جدید</h3>
                        <div className="space-y-4">
                            <div><label className="block text-sm font-bold mb-1">شرکت</label><select className="w-full border rounded-lg p-2" value={newRecordCompany} onChange={e => setNewRecordCompany(e.target.value)}><option value="">انتخاب...</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="block text-sm font-bold mb-1">شماره پرونده</label><input className="w-full border rounded-lg p-2" value={newFileNumber} onChange={e => setNewFileNumber(e.target.value)} /></div>
                            <div><label className="block text-sm font-bold mb-1">نام کالا</label><input className="w-full border rounded-lg p-2" value={newGoodsName} onChange={e => setNewGoodsName(e.target.value)} /></div>
                            <div><label className="block text-sm font-bold mb-1">فروشنده</label><input className="w-full border rounded-lg p-2" value={newSellerName} onChange={e => setNewSellerName(e.target.value)} /></div>
                            <div><label className="block text-sm font-bold mb-1">ارز پایه</label><select className="w-full border rounded-lg p-2" value={newMainCurrency} onChange={e => setNewMainCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                            <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowNewModal(false)} className="px-4 py-2 text-gray-600">انصراف</button><button onClick={handleCreateRecord} className="px-4 py-2 bg-blue-600 text-white rounded-lg">ایجاد</button></div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-4">
                 <div className="flex items-center gap-4 w-full md:w-auto">
                     <h2 className="text-xl font-bold text-gray-800 whitespace-nowrap">داشبورد بازرگانی</h2>
                     <button onClick={() => setShowNewModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors whitespace-nowrap"><Plus size={16} /> پرونده جدید</button>
                 </div>
                 
                 <div className="flex-1 w-full md:max-w-xl mx-4 relative">
                     <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                     <input 
                        type="text" 
                        placeholder="جستجو در پرونده‌ها (شماره پرونده، ثبت سفارش، فروشنده...)" 
                        className="w-full pl-4 pr-10 py-2.5 border rounded-xl text-sm outline-none bg-gray-50 focus:bg-white focus:border-blue-500 transition-colors"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                     />
                 </div>

                 <div className="flex gap-2 w-full md:w-auto justify-end">
                     <button onClick={() => setViewMode('currency_report')} className="bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm border border-green-200 hover:bg-green-100 transition-colors flex items-center gap-2"><Coins size={16}/> گزارش ارز</button>
                 </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold mb-1">پرونده‌های فعال</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.totalActive}</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Package size={24} /></div>
                </div>
                <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold mb-1">مجموع ارز خریداری شده</p>
                        <p className="text-lg font-bold text-gray-800 dir-ltr font-mono">{formatNumberString(stats.totalCurrency.toString())}</p>
                    </div>
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg"><Coins size={24} /></div>
                </div>
                <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold mb-1">در انتظار بیمه</p>
                        <p className="text-2xl font-bold text-amber-600">{stats.pendingInsurance}</p>
                    </div>
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Shield size={24} /></div>
                </div>
                <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-gray-500 text-xs font-bold mb-1">در صف تخصیص</p>
                        <p className="text-2xl font-bold text-purple-600">{stats.allocationQueue}</p>
                    </div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><History size={24} /></div>
                </div>
            </div>

            {/* Records Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredRecords.map(record => (
                    <div key={record.id} onClick={() => { setSelectedRecord(record); setViewMode('details'); setActiveTab('timeline'); }} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between h-[180px]">
                        <div className="absolute top-0 right-0 w-1 h-full bg-blue-500 group-hover:w-2 transition-all"></div>
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-bold text-gray-800 text-lg">{record.fileNumber}</h3>
                                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">{record.mainCurrency}</span>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-gray-700 truncate" title={record.goodsName}>{record.goodsName}</p>
                                <p className="text-xs text-gray-500 truncate" title={record.sellerName}>{record.sellerName}</p>
                                {record.registrationNumber && <p className="text-xs text-gray-400 font-mono">ثبت سفارش: {record.registrationNumber}</p>}
                            </div>
                        </div>
                        <div className="flex justify-between items-end border-t pt-3 mt-2">
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{record.company}</span>
                            <span className="text-[10px] text-gray-400">{new Date(record.createdAt).toLocaleDateString('fa-IR')}</span>
                        </div>
                    </div>
                ))}
                {filteredRecords.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                        <Search size={48} className="mb-4 opacity-20" />
                        <p>هیچ پرونده‌ای یافت نشد.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TradeModule;
