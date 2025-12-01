
import React, { useState, useEffect, useRef } from 'react';
import { User, TradeRecord, TradeStage, TradeStageData, TradeItem, SystemSettings, InsuranceEndorsement, CurrencyPayment, CurrencyPurchaseData, TradeTransaction, CurrencyTranche } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, deleteTradeRecord, uploadFile, getSettings } from '../services/storageService';
import { generateUUID, formatCurrency, formatNumberString, deformatNumberString, getCurrentShamsiDate, parsePersianDate, normalizeInputNumber } from '../constants';
import { Container, Plus, Search, CheckCircle2, Circle, Paperclip, Save, Loader2, Trash2, X, Package, ArrowRight, TrendingDown, TrendingUp, History, Calendar, Banknote, Coins, Filter, RefreshCw, Wallet, CheckSquare, Square, FileSpreadsheet, FileDown, Shield, LayoutDashboard, Plane, Ship, Truck, Layers } from 'lucide-react';
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
    const [reportTab, setReportTab] = useState<'delivery' | 'queue' | 'allocated' | 'expired' | 'cheques'>('delivery');
    const [sidebarCompanyFilter, setSidebarCompanyFilter] = useState('');
    const [sidebarCommodityFilter, setSidebarCommodityFilter] = useState('');
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

    // Currency Purchase
    const [currencyForm, setCurrencyForm] = useState<CurrencyPurchaseData>({
        payments: [], purchasedAmount: 0, purchasedCurrencyType: '', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: '', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: []
    });
    const [newRialPayment, setNewRialPayment] = useState<Partial<CurrencyPayment>>({ type: 'PAYMENT', amount: 0, date: '', bank: '', description: '' });
    const [guaranteeCheque, setGuaranteeCheque] = useState<{ chequeNumber: string, amount: number, dueDate: string, bank: string, isReturned?: boolean, returnDate?: string }>({ chequeNumber: '', amount: 0, dueDate: '', bank: '', isReturned: false, returnDate: '' });
    
    // Currency Tranche State
    const [newCurrencyTranche, setNewCurrencyTranche] = useState<Partial<CurrencyTranche>>({ amount: 0, currencyType: 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });

    const [reportInsuranceCompany, setReportInsuranceCompany] = useState('');
    const [reportCurrencyFilter, setReportCurrencyFilter] = useState(''); 
    const [reportChequeStatus, setReportChequeStatus] = useState<'all' | 'bank' | 'returned'>('all');
    const [reportDeliveryStatus, setReportDeliveryStatus] = useState<'all' | 'delivered' | 'pending'>('all');
    const [crossRates, setCrossRates] = useState({ EUR: 1.08, AED: 0.272, CNY: 0.14, TRY: 0.03 });
    const [nimaRate, setNimaRate] = useState<number>(0);
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [editMetadataForm, setEditMetadataForm] = useState({ fileNumber: '', goodsName: '', sellerName: '', commodityGroup: '', company: '', mainCurrency: '' });
    const [editingStage, setEditingStage] = useState<TradeStage | null>(null);
    const [stageData, setStageData] = useState<Partial<TradeStageData>>({});
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [exchangeRate, setExchangeRate] = useState<number>(0);

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
            if (selectedRecord.insuranceData) {
                setInsuranceForm(selectedRecord.insuranceData);
            } else {
                setInsuranceForm({ policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] });
            }
            if (selectedRecord.currencyPurchaseData) {
                setCurrencyForm({
                    ...selectedRecord.currencyPurchaseData,
                    purchasedCurrencyType: selectedRecord.currencyPurchaseData.purchasedCurrencyType || selectedRecord.mainCurrency || 'EUR',
                    deliveredCurrencyType: selectedRecord.currencyPurchaseData.deliveredCurrencyType || selectedRecord.mainCurrency || 'EUR',
                    tranches: selectedRecord.currencyPurchaseData.tranches || [],
                    purchaseDate: selectedRecord.currencyPurchaseData.purchaseDate || '',
                    deliveryDate: selectedRecord.currencyPurchaseData.deliveryDate || '',
                    recipientName: selectedRecord.currencyPurchaseData.recipientName || '',
                });
                if (selectedRecord.currencyPurchaseData.guaranteeCheque) {
                    setGuaranteeCheque(selectedRecord.currencyPurchaseData.guaranteeCheque);
                } else {
                    setGuaranteeCheque({ chequeNumber: '', amount: 0, dueDate: '', bank: '', isReturned: false, returnDate: '' });
                }
            } else {
                setCurrencyForm({ 
                    payments: [], purchasedAmount: 0, purchasedCurrencyType: selectedRecord.mainCurrency || 'EUR', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: selectedRecord.mainCurrency || 'EUR', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: []
                });
                setGuaranteeCheque({ chequeNumber: '', amount: 0, dueDate: '', bank: '', isReturned: false, returnDate: '' });
            }
            
            setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
            setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });

            setExchangeRate(selectedRecord.exchangeRate || 0);
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
    const handleSaveMetadata = async () => { if (!selectedRecord) return; const updated = { ...selectedRecord, ...editMetadataForm }; await updateTradeRecord(updated); setSelectedRecord(updated); setRecords(prev => prev.map(r => r.id === updated.id ? updated : r)); setIsEditingMetadata(false); };
    const handleAddItem = () => { if (!newItem.name || !selectedRecord) return; const item: TradeItem = { id: generateUUID(), name: newItem.name, weight: Number(newItem.weight) || 0, unitPrice: Number(newItem.unitPrice) || 0, totalPrice: 0 }; item.totalPrice = item.weight > 0 ? item.weight * item.unitPrice : item.unitPrice; const updatedRecord = { ...selectedRecord, items: [...(selectedRecord.items || []), item] }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewItem({ name: '', weight: 0, unitPrice: 0 }); };
    const handleRemoveItem = (itemId: string) => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, items: selectedRecord.items.filter(i => i.id !== itemId) }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleUpdateProforma = (field: keyof TradeRecord, value: string | number) => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, [field]: value }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    
    const handleAddLicenseTx = async () => {
        if (!selectedRecord || !newLicenseTx.amount) return;
        const tx: TradeTransaction = { id: generateUUID(), date: newLicenseTx.date || '', amount: Number(newLicenseTx.amount), bank: newLicenseTx.bank || '', description: newLicenseTx.description || '' };
        const currentLicenseData = selectedRecord.licenseData || { transactions: [] };
        const updatedTransactions = [...(currentLicenseData.transactions || []), tx];
        const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } };
        const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0);
        if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStage(updatedRecord, TradeStage.LICENSES);
        updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost;
        updatedRecord.stages[TradeStage.LICENSES].isCompleted = totalCost > 0;
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
        setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
    };

    const handleRemoveLicenseTx = async (id: string) => {
        if (!selectedRecord) return;
        const currentLicenseData = selectedRecord.licenseData || { transactions: [] };
        const updatedTransactions = (currentLicenseData.transactions || []).filter(t => t.id !== id);
        const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } };
        const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0);
        if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStage(updatedRecord, TradeStage.LICENSES);
        updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost;
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

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
        const updatedTranches = (currencyForm.tranches || []).map(t => {
            if (t.id === id) return { ...t, isDelivered, deliveryDate };
            return t;
        });
        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
        const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0);

        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleSaveInsurance = async () => {
        if (!selectedRecord) return;
        const updatedRecord = { ...selectedRecord, insuranceData: insuranceForm };
        // Update stage data as well
        const totalCost = (Number(insuranceForm.cost) || 0) + (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0);
        if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStage(updatedRecord, TradeStage.INSURANCE);
        updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost;
        updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!insuranceForm.policyNumber;
        
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
        alert("اطلاعات بیمه ذخیره شد.");
    };

    const handleAddEndorsement = () => {
        if (!newEndorsement.amount) return;
        const endorsement: InsuranceEndorsement = { id: generateUUID(), date: newEndorsement.date || '', amount: Number(newEndorsement.amount), description: newEndorsement.description || '' };
        const updatedEndorsements = [...(insuranceForm.endorsements || []), endorsement];
        setInsuranceForm({ ...insuranceForm, endorsements: updatedEndorsements });
        setNewEndorsement({ amount: 0, description: '', date: '' });
    };

    const handleDeleteEndorsement = (id: string) => {
        setInsuranceForm({ ...insuranceForm, endorsements: insuranceForm.endorsements?.filter(e => e.id !== id) });
    };

    const calculateInsuranceTotal = () => {
        const base = Number(insuranceForm.cost) || 0;
        const endorsed = (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0);
        return base + endorsed;
    };

    // --- Render ---

    if (viewMode === 'currency_report') {
        const filteredRecords = records.filter(r => 
            (!reportCurrencyFilter || r.mainCurrency === reportCurrencyFilter) &&
            (!sidebarCompanyFilter || r.company === sidebarCompanyFilter)
        );

        return (
             <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-gray-800">گزارش جامع خرید ارز</h2><button onClick={() => setViewMode('dashboard')} className="text-gray-500 hover:text-gray-700">بازگشت به داشبورد</button></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right border-collapse">
                        <thead className="bg-gray-100 text-gray-700 font-bold">
                            <tr>
                                <th className="p-3 border">شماره پرونده / ثبت سفارش</th>
                                <th className="p-3 border">فروشنده</th>
                                <th className="p-3 border">مبلغ پارت</th>
                                <th className="p-3 border">ارز</th>
                                <th className="p-3 border">نرخ (ریال)</th>
                                <th className="p-3 border">تاریخ خرید</th>
                                <th className="p-3 border">صرافی / کارگزار</th>
                                <th className="p-3 border text-center">وضعیت تحویل</th>
                                <th className="p-3 border text-center">تاریخ تحویل</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.map(r => {
                                const tranches = r.currencyPurchaseData?.tranches || [];
                                const rowCount = Math.max(tranches.length, 1);
                                return (
                                    <React.Fragment key={r.id}>
                                        {Array.from({length: rowCount}).map((_, idx) => {
                                            const tranche = tranches[idx];
                                            return (
                                                <tr key={`${r.id}-${idx}`} className="hover:bg-gray-50 border-b">
                                                    {idx === 0 && (
                                                        <>
                                                            <td className="p-3 border font-medium align-top" rowSpan={rowCount}>
                                                                <div>{r.fileNumber}</div>
                                                                <div className="text-xs text-gray-500 mt-1">{r.registrationNumber || '-'}</div>
                                                            </td>
                                                            <td className="p-3 border align-top" rowSpan={rowCount}>{r.sellerName}</td>
                                                        </>
                                                    )}
                                                    {tranche ? (
                                                        <>
                                                            <td className="p-3 border font-mono dir-ltr">{formatNumberString(tranche.amount.toString())}</td>
                                                            <td className="p-3 border">{tranche.currencyType}</td>
                                                            <td className="p-3 border font-mono dir-ltr">{formatCurrency(tranche.rate || 0)}</td>
                                                            <td className="p-3 border">{tranche.date}</td>
                                                            <td className="p-3 border">{tranche.exchangeName} {tranche.brokerName ? `(${tranche.brokerName})` : ''}</td>
                                                            <td className="p-3 border text-center">{tranche.isDelivered ? <span className="text-green-600 font-bold">تحویل شده</span> : <span className="text-gray-400">نامشخص</span>}</td>
                                                            <td className="p-3 border text-center">{tranche.deliveryDate || '-'}</td>
                                                        </>
                                                    ) : (
                                                        <td colSpan={7} className="p-3 border text-center text-gray-400">بدون خرید ارز</td>
                                                    )}
                                                </tr>
                                            );
                                        })}
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
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-100px)]">
                <div className="bg-slate-800 text-white p-4 flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => { setSelectedRecord(null); setViewMode('dashboard'); }} className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg transition-colors"><ArrowRight size={20} /></button>
                        <div><h2 className="font-bold text-lg flex items-center gap-2"><FileSpreadsheet size={20} className="text-blue-400"/> پرونده: {selectedRecord.fileNumber}</h2><div className="text-xs text-slate-400 flex gap-3 mt-1"><span>{selectedRecord.goodsName}</span><span>|</span><span>{selectedRecord.sellerName}</span><span>|</span><span>{selectedRecord.company}</span></div></div>
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
                             <div className="text-center text-gray-500 py-10">نمای کلی پرونده (تایم‌لاین)</div>
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
                                                </tr>
                                            ))}
                                            {(!currencyForm.tranches || currencyForm.tranches.length === 0) && (
                                                <tr><td colSpan={7} className="p-4 text-center text-gray-400">هیچ پارت ارزی ثبت نشده است.</td></tr>
                                            )}
                                        </tbody>
                                        <tfoot className="bg-gray-50 font-bold">
                                            <tr>
                                                <td className="p-3 border-t">جمع کل:</td>
                                                <td className="p-3 border-t font-mono dir-ltr text-blue-600" colSpan={6}>{formatNumberString(currencyForm.purchasedAmount.toString())} {selectedRecord.mainCurrency}</td>
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
    const filteredRecords = records.filter(r => (!sidebarCompanyFilter || r.company === sidebarCompanyFilter) && (!sidebarCommodityFilter || r.commodityGroup === sidebarCommodityFilter));

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
            
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                 <div className="flex items-center gap-4">
                     <h2 className="text-xl font-bold text-gray-800">داشبورد بازرگانی</h2>
                     <button onClick={() => setShowNewModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors"><Plus size={16} /> پرونده جدید</button>
                 </div>
                 <div className="flex gap-2">
                     <button onClick={() => setViewMode('currency_report')} className="bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm border border-green-200 hover:bg-green-100 transition-colors">گزارش خرید ارز</button>
                 </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredRecords.map(record => (
                    <div key={record.id} onClick={() => { setSelectedRecord(record); setViewMode('details'); setActiveTab('timeline'); }} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-1 h-full bg-blue-500 group-hover:w-2 transition-all"></div>
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="font-bold text-gray-800">{record.fileNumber}</h3>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{record.mainCurrency}</span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1 truncate">{record.goodsName}</p>
                        <p className="text-xs text-gray-400 mb-3 truncate">{record.sellerName}</p>
                        <div className="flex justify-between items-center text-xs text-gray-500 border-t pt-3">
                            <span>{record.company}</span>
                            <span>{new Date(record.createdAt).toLocaleDateString('fa-IR')}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TradeModule;
