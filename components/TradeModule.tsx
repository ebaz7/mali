
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
    const [newCurrencyTranche, setNewCurrencyTranche] = useState<Partial<CurrencyTranche>>({ amount: 0, currencyType: 'EUR', date: '', exchangeName: '', brokerName: '' });

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
            setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '' });

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
    const handleUpdateProforma = (field: 'registrationNumber' | 'freightCost' | 'operatingBank', value: string | number) => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, [field]: value }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    
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
        const tranche: CurrencyTranche = { id: generateUUID(), date: newCurrencyTranche.date || '', amount: Number(newCurrencyTranche.amount), currencyType: newCurrencyTranche.currencyType || selectedRecord.mainCurrency || 'EUR', brokerName: newCurrencyTranche.brokerName || '', exchangeName: newCurrencyTranche.exchangeName || '', rate: Number(newCurrencyTranche.rate) || 0 };
        const currentTranches = currencyForm.tranches || [];
        const updatedTranches = [...currentTranches, tranche];
        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
        const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
        setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '' });
    };

    const handleRemoveCurrencyTranche = async (id: string) => {
         if (!selectedRecord) return;
         const updatedTranches = (currencyForm.tranches || []).filter(t => t.id !== id);
         const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
         const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased };
         setCurrencyForm(updatedForm);
         const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
         await updateTradeRecord(updatedRecord);
         setSelectedRecord(updatedRecord);
    };

    const handleUpdateExchangeRate = (rate: number) => { setExchangeRate(rate); if (selectedRecord) { const updatedRecord = { ...selectedRecord, exchangeRate: rate }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); } };
    const handleSaveInsurance = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, insuranceData: insuranceForm }; if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStage(updatedRecord, TradeStage.INSURANCE); updatedRecord.stages[TradeStage.INSURANCE].isCompleted = true; updatedRecord.stages[TradeStage.INSURANCE].description = `بیمه شده توسط: ${insuranceForm.company} - شماره: ${insuranceForm.policyNumber}`; const totalEndorsement = insuranceForm.endorsements?.reduce((acc, e) => acc + e.amount, 0) || 0; updatedRecord.stages[TradeStage.INSURANCE].costRial = insuranceForm.cost + totalEndorsement; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert("اطلاعات بیمه ذخیره شد."); };
    const handleAddEndorsement = () => { if (!selectedRecord || !newEndorsement.amount) return; const endorsement: InsuranceEndorsement = { id: generateUUID(), date: newEndorsement.date || '', amount: Number(newEndorsement.amount), description: newEndorsement.description || '' }; const currentData = selectedRecord.insuranceData || { policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] }; const updatedRecord = { ...selectedRecord, insuranceData: { ...currentData, endorsements: [...(currentData.endorsements || []), endorsement] } }; setInsuranceForm(updatedRecord.insuranceData); updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewEndorsement({ amount: 0, description: '', date: '' }); };
    const handleRemoveEndorsement = (id: string) => { if (!selectedRecord || !selectedRecord.insuranceData) return; const updatedRecord = { ...selectedRecord, insuranceData: { ...selectedRecord.insuranceData, endorsements: selectedRecord.insuranceData.endorsements?.filter(e => e.id !== id) || [] } }; setInsuranceForm(updatedRecord.insuranceData); updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleSaveGuaranteeCheque = async () => { if (!selectedRecord) return; const updatedData: CurrencyPurchaseData = { ...currencyForm, guaranteeCheque: guaranteeCheque }; const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedData }; setCurrencyForm(updatedData); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert('چک تضمین ذخیره شد.'); };
    const handleAddRialPayment = async () => { if (!selectedRecord || !newRialPayment.amount || !newRialPayment.date) return; const payment: CurrencyPayment = { id: generateUUID(), date: newRialPayment.date, amount: Number(newRialPayment.amount), bank: newRialPayment.bank || '', type: newRialPayment.type || 'PAYMENT', description: newRialPayment.description || '' }; const updatedPayments = [...currencyForm.payments, payment]; const updatedData = { ...currencyForm, payments: updatedPayments }; const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedData }; setCurrencyForm(updatedData); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewRialPayment({ type: 'PAYMENT', amount: 0, date: '', bank: '', description: '' }); };
    const handleRemoveRialPayment = async (id: string) => { if (!selectedRecord) return; const updatedPayments = currencyForm.payments.filter(p => p.id !== id); const updatedData = { ...currencyForm, payments: updatedPayments }; const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedData }; setCurrencyForm(updatedData); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleSaveCurrencyFinalization = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, currencyPurchaseData: currencyForm }; const netRial = currencyForm.payments.reduce((acc, curr) => curr.type === 'PAYMENT' ? acc + curr.amount : acc - curr.amount, 0); if(!updatedRecord.stages[TradeStage.CURRENCY_PURCHASE]) updatedRecord.stages[TradeStage.CURRENCY_PURCHASE] = getStage(updatedRecord, TradeStage.CURRENCY_PURCHASE); updatedRecord.stages[TradeStage.CURRENCY_PURCHASE].isCompleted = true; updatedRecord.stages[TradeStage.CURRENCY_PURCHASE].costRial = netRial; updatedRecord.stages[TradeStage.CURRENCY_PURCHASE].description = `خرید ارز`; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert('اطلاعات خرید ارز ذخیره شد.'); };
    const handleEditStage = (stage: TradeStage) => { if (!selectedRecord) return; setEditingStage(stage); setStageData({ ...getStage(selectedRecord, stage) }); };
    const handleSaveStage = async () => { if (!selectedRecord || !editingStage) return; const updatedRecord = { ...selectedRecord }; const oldData = getStage(updatedRecord, editingStage); const newData = { ...oldData, ...stageData, updatedAt: Date.now(), updatedBy: currentUser.fullName }; if (editingStage === TradeStage.ALLOCATION_APPROVED && newData.isCompleted && !oldData.isCompleted) { const shamsi = getCurrentShamsiDate(); newData.allocationDate = `${shamsi.year}/${String(shamsi.month).padStart(2,'0')}/${String(shamsi.day).padStart(2,'0')}`; } updatedRecord.stages[editingStage] = newData; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setEditingStage(null); loadRecords(); };
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 150 * 1024 * 1024) { alert('حجم فایل بالا است'); return; } setUploading(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setStageData(prev => ({ ...prev, attachments: [...(prev.attachments || []), { fileName: result.fileName, url: result.url }] })); } catch (error) { alert('خطا در آپلود'); } finally { setUploading(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const calculateDaysPassed = (dateStr?: string, endDateStr?: string) => { if (!dateStr) return 0; try { const startDate = parsePersianDate(dateStr); if (!startDate) return 0; const endDate = endDateStr ? parsePersianDate(endDateStr) : new Date(); if (!endDate) return 0; const diffTime = endDate.getTime() - startDate.getTime(); const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); return diffDays > 0 ? diffDays : 0; } catch (e) { return 0; } };
    const calculateCosts = (record: TradeRecord) => { if (!record) return { totalRial: 0, totalCurrency: 0, finishedPrice: 0, pricePerKg: 0 }; let totalRial = 0; let totalCurrency = 0; Object.values(record.stages || {}).forEach(s => { totalRial += s.costRial || 0; totalCurrency += s.costCurrency || 0; }); const totalFOB = record.items?.reduce((acc, i) => acc + i.totalPrice, 0) || 0; totalCurrency += totalFOB + (record.freightCost || 0); const rate = exchangeRate || 0; const finishedPrice = totalRial + (totalCurrency * rate); const totalWeight = record.items?.reduce((acc, i) => acc + i.weight, 0) || 1; const pricePerKg = finishedPrice / (totalWeight || 1); return { totalRial, totalCurrency, finishedPrice, pricePerKg }; };
    const convertToUsd = (amount: number, currency: string) => { if (!amount) return 0; if (currency === 'USD') return amount; const rate = crossRates[currency as keyof typeof crossRates] || 0; return amount * rate; };
    const getNetRialPayments = (record: TradeRecord) => { if (!record.currencyPurchaseData) return 0; return record.currencyPurchaseData.payments.reduce((acc, curr) => curr.type === 'PAYMENT' ? acc + curr.amount : acc - curr.amount, 0); };
    const filteredRecords = records.filter(r => { if (sidebarCompanyFilter && r.company !== sidebarCompanyFilter) return false; if (sidebarCommodityFilter && r.commodityGroup !== sidebarCommodityFilter) return false; return true; });
    const costs = selectedRecord ? calculateCosts(selectedRecord) : null;
    const getRecordsForReport = () => { return records.filter(r => !reportCurrencyFilter || r.company === reportCurrencyFilter).filter(r => { const stageQueue = getStage(r, TradeStage.ALLOCATION_QUEUE); const stageAllocated = getStage(r, TradeStage.ALLOCATION_APPROVED); const stagePurchase = getStage(r, TradeStage.CURRENCY_PURCHASE); if (reportTab === 'queue') return stageQueue.isCompleted && !stageAllocated.isCompleted; if (reportTab === 'allocated') { if (!stageAllocated.isCompleted) return false; if (stageAllocated.allocationDate) { const diff = calculateDaysPassed(stageAllocated.allocationDate); return diff <= 30; } return true; } if (reportTab === 'expired') { if (!stageAllocated.isCompleted) return false; if (stageAllocated.allocationDate) { const diff = calculateDaysPassed(stageAllocated.allocationDate); return diff > 30 && !stagePurchase.isCompleted; } return false; } if (reportTab === 'cheques') { const hasCheque = !!r.currencyPurchaseData?.guaranteeCheque?.amount; if (!hasCheque) return false; const isReturned = r.currencyPurchaseData?.guaranteeCheque?.isReturned; if (reportChequeStatus === 'bank') return !isReturned; if (reportChequeStatus === 'returned') return isReturned; return true; } if (reportTab === 'delivery') { const cp = r.currencyPurchaseData; if (!cp) return false; const remaining = (cp.purchasedAmount || 0) - ((cp.deliveredAmount || 0) + (cp.remittedAmount || 0)); if (reportDeliveryStatus === 'delivered') return remaining === 0; if (reportDeliveryStatus === 'pending') return remaining > 0; } return true; }); };
    const reportRecords = getRecordsForReport();
    const reportSummary = (() => { let title1 = '', value1 = 0, subValue1 = 0, type1 = 'USD'; let title2 = '', value2 = 0, subValue2 = 0, type2 = 'USD'; if (reportTab === 'queue') { title1 = 'مجموع دلاری در صف'; type1 = 'USD'; value1 = reportRecords.reduce((acc, r) => acc + convertToUsd((r.items?.reduce((a,b)=>a+b.totalPrice,0)||0)+(r.freightCost||0), r.mainCurrency||'EUR'), 0); subValue1 = value1 * nimaRate; } else if (reportTab === 'allocated') { title1 = 'مجموع دلاری تخصیص یافته'; type1 = 'USD'; value1 = reportRecords.reduce((acc, r) => acc + convertToUsd((r.items?.reduce((a,b)=>a+b.totalPrice,0)||0)+(r.freightCost||0), r.mainCurrency||'EUR'), 0); subValue1 = value1 * nimaRate; } else if (reportTab === 'cheques') { type1 = 'RIAL'; type2 = 'RIAL'; title1 = 'مجموع چک‌های نزد بانک'; const relevantRecords = records.filter(r => !reportCurrencyFilter || r.company === reportCurrencyFilter); const activeCheques = relevantRecords.filter(r => r.currencyPurchaseData?.guaranteeCheque?.amount && !r.currencyPurchaseData.guaranteeCheque.isReturned); value1 = activeCheques.reduce((acc, r) => acc + (r.currencyPurchaseData?.guaranteeCheque?.amount || 0), 0); title2 = 'مجموع چک‌های عودت شده'; const returnedCheques = relevantRecords.filter(r => r.currencyPurchaseData?.guaranteeCheque?.amount && r.currencyPurchaseData.guaranteeCheque.isReturned); value2 = returnedCheques.reduce((acc, r) => acc + (r.currencyPurchaseData?.guaranteeCheque?.amount || 0), 0); } else { title1 = 'مجموع دلاری تحویل شده'; type1 = 'USD'; title2 = 'مجموع دلاری تحویل نشده'; type2 = 'USD'; reportRecords.forEach(r => { const cp = r.currencyPurchaseData; if (cp) { value1 += convertToUsd(cp.deliveredAmount || 0, cp.deliveredCurrencyType || r.mainCurrency || 'EUR'); const remaining = (cp.purchasedAmount || 0) - ((cp.deliveredAmount || 0) + (cp.remittedAmount || 0)); if(remaining > 0) value2 += convertToUsd(remaining, cp.purchasedCurrencyType || r.mainCurrency || 'EUR'); } }); } return { title1, value1, subValue1, type1, title2, value2, subValue2, type2 }; })();
    const filteredReports = records.filter(r => reportInsuranceCompany ? r.insuranceData?.company === reportInsuranceCompany : false);
    const totalDebtInReport = filteredReports.reduce((acc, r) => { const cost = r.insuranceData?.cost || 0; const endoSum = r.insuranceData?.endorsements?.reduce((a, b) => a + b.amount, 0) || 0; const isPaid = !!r.insuranceData?.bank; const mainDebt = isPaid ? 0 : cost; return acc + mainDebt + endoSum; }, 0);
    const isProformaView = reportTab === 'allocated' || reportTab === 'queue';
    const isChequeView = reportTab === 'cheques';
    
    // Export handlers
    const handleExportExcel = async () => { 
        let tableContent = ''; 
        let fileName = `report_${reportTab}_${new Date().toISOString().slice(0,10)}.xls`; 
        if (viewMode === 'insurance_report') { 
            const rows = filteredReports.map(rec => { 
                const cost = rec.insuranceData?.cost || 0; 
                const endo = rec.insuranceData?.endorsements?.reduce((a, b) => a+b.amount, 0) || 0; 
                const isPaid = !!rec.insuranceData?.bank; 
                const balance = (cost + endo) - (isPaid ? cost : 0); 
                return `<tr><td>${rec.company}</td><td>${rec.fileNumber}</td><td>${rec.registrationNumber || '-'}</td><td>${rec.insuranceData?.policyNumber}</td><td>${rec.insuranceData?.company}</td><td>${rec.commodityGroup}</td><td>${formatNumberString(cost)}</td><td>${rec.insuranceData?.bank || '-'}</td><td>${formatNumberString(endo)}</td><td>${formatNumberString(balance)}</td></tr>`; 
            }).join(''); 
            tableContent = `<table border="1" style="direction: rtl;"><thead><tr style="background-color: #f0f0f0;"><th>شرکت</th><th>پرونده</th><th>شماره ثبت سفارش</th><th>بیمه نامه</th><th>شرکت بیمه</th><th>گروه کالا</th><th>هزینه</th><th>بانک</th><th>جمع الحاقیه</th><th>مانده</th></tr></thead><tbody>${rows}</tbody></table>`; 
        } else { 
            let rows = ''; 
            let header = ''; 
            if (isChequeView) { 
                header = `<tr style="background-color: #f0f0f0;"><th>شرکت</th><th>پرونده</th><th>شماره ثبت سفارش</th><th>شماره چک</th><th>مبلغ چک</th><th>سررسید</th><th>بانک</th><th>وضعیت</th></tr>`; 
                rows = reportRecords.map(rec => { const ch = rec.currencyPurchaseData?.guaranteeCheque; return `<tr><td>${rec.company||''}</td><td>${rec.fileNumber}</td><td>${rec.registrationNumber||'-'}</td><td>${ch?.chequeNumber}</td><td>${formatNumberString(ch?.amount)}</td><td>${ch?.dueDate}</td><td>${ch?.bank}</td><td>${ch?.isReturned?'عودت شده':'نزد بانک'}</td></tr>`; }).join(''); 
            } else if (isProformaView) { 
                header = `<tr style="background-color: #f0f0f0;"><th>شرکت</th><th>پرونده</th><th>شماره ثبت سفارش</th><th>نام فروشنده</th><th>مبلغ پروفرما (کل)</th><th>ارز پایه</th><th>تاریخ تخصیص</th><th>مهلت باقی‌مانده</th></tr>`; 
                rows = reportRecords.map(rec => { const totalProforma = (rec.items?.reduce((a, b) => a + b.totalPrice, 0) || 0) + (rec.freightCost || 0); const allocDate = getStage(rec, TradeStage.ALLOCATION_APPROVED).allocationDate || '-'; const queueDate = getStage(rec, TradeStage.ALLOCATION_QUEUE).queueDate || '-'; const displayDate = reportTab === 'allocated' ? allocDate : queueDate; return `<tr><td>${rec.company || ''}</td><td>${rec.fileNumber}</td><td>${rec.registrationNumber || '-'}</td><td>${rec.sellerName || '-'}</td><td>${formatNumberString(totalProforma)}</td><td>${rec.mainCurrency || 'EUR'}</td><td>${displayDate}</td><td>-</td></tr>`; }).join(''); 
            } else { 
                header = `<tr style="background-color: #f0f0f0;"><th>شرکت</th><th>پرونده</th><th>شماره ثبت سفارش</th><th>تاریخ خرید</th><th>مبلغ خرید</th><th>نوع ارز</th><th>کارگزار</th><th>تاریخ تحویل</th><th>تحویل گیرنده</th><th>مبلغ تحویل</th><th>نوع ارز تحویل</th><th>حواله شده</th><th>مانده تحویل</th></tr>`; 
                rows = reportRecords.map(rec => { const cp = rec.currencyPurchaseData; const remaining = (cp?.purchasedAmount || 0) - ((cp?.deliveredAmount || 0) + (cp?.remittedAmount || 0)); return `<tr><td>${rec.company || ''}</td><td>${rec.fileNumber}</td><td>${rec.registrationNumber || '-'}</td><td>${cp?.purchaseDate || '-'}</td><td>${formatNumberString(cp?.purchasedAmount)}</td><td>${cp?.purchasedCurrencyType || '-'}</td><td>${cp?.brokerName || '-'}</td><td>${cp?.deliveryDate || '-'}</td><td>${cp?.recipientName || '-'}</td><td>${formatNumberString(cp?.deliveredAmount)}</td><td>${cp?.deliveredCurrencyType || '-'}</td><td>${formatNumberString(cp?.remittedAmount)}</td><td>${formatNumberString(remaining)}</td></tr>`; }).join(''); 
            } 
            tableContent = `<table border="1" style="direction: rtl;"><thead>${header}</thead><tbody>${rows}</tbody></table>`; 
        } 
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body>${tableContent}</body></html>`; 
        const blob = new Blob([html], { type: 'application/vnd.ms-excel' }); 
        
        const win = window as any;
        if (typeof win.showSaveFilePicker === 'function') { 
            try { 
                const handle = await win.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Excel File', accept: { 'application/vnd.ms-excel': ['.xls'] }, }], }); 
                const writable = await handle.createWritable(); 
                await writable.write(blob); 
                await writable.close(); 
                return; 
            } catch (err: any) { 
                if (err.name === 'AbortError') return; 
            } 
        } 
        const url = URL.createObjectURL(blob); 
        const link = document.createElement('a'); 
        link.href = url; 
        link.download = fileName; 
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link); 
        URL.revokeObjectURL(url); 
    };

    const handleExportPDF = async () => { 
        const element = document.getElementById('report-print-area'); 
        if (element) { 
            try { 
                /* @ts-ignore */ 
                const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true }); 
                const imgData = canvas.toDataURL('image/jpeg', 0.9); 
                /* @ts-ignore */ 
                const { jsPDF } = window.jspdf; 
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); 
                const pdfWidth = pdf.internal.pageSize.getWidth(); 
                const pdfHeight = pdf.internal.pageSize.getHeight(); 
                const imgProps = pdf.getImageProperties(imgData); 
                const imgHeight = (imgProps.height * pdfWidth) / imgProps.width; 
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight > pdfHeight ? pdfHeight : imgHeight); 
                const fileName = `report_${new Date().toISOString().slice(0,10)}.pdf`; 
                
                const win = window as any;
                if (typeof win.showSaveFilePicker === 'function') { 
                    try { 
                        const handle = await win.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'PDF File', accept: { 'application/pdf': ['.pdf'] }, }], }); 
                        const writable = await handle.createWritable(); 
                        const blob = pdf.output('blob'); 
                        await writable.write(blob); 
                        await writable.close(); 
                        return; 
                    } catch (err: any) { 
                        if (err.name === 'AbortError') return; 
                    } 
                } 
                pdf.save(fileName); 
            } catch(e) { 
                alert("خطا در ایجاد PDF"); 
            } 
        } 
    };
    
    const undeliveredTotals = (() => { const totals: Record<string, number> = {}; reportRecords.forEach(rec => { const cp = rec.currencyPurchaseData; const currency = cp?.purchasedCurrencyType || rec.mainCurrency || 'EUR'; const remaining = (cp.purchasedAmount || 0) - ((cp.deliveredAmount || 0) + (cp.remittedAmount || 0)); totals[currency] = (totals[currency] || 0) + remaining; }); return totals; })();
    const activeFilesCount = records.length; const queueCount = records.filter(r => getStage(r, TradeStage.ALLOCATION_QUEUE).isCompleted && !getStage(r, TradeStage.ALLOCATION_APPROVED).isCompleted).length; const shippingCount = records.filter(r => getStage(r, TradeStage.SHIPPING_DOCS).isCompleted && !getStage(r, TradeStage.FINAL_COST).isCompleted).length; const totalValueUSD = records.reduce((acc, r) => { const total = (r.items?.reduce((a,b)=>a+b.totalPrice,0)||0)+(r.freightCost||0); return acc + convertToUsd(total, r.mainCurrency || 'EUR'); }, 0); const commodityStats = commodityGroups.map(g => ({ name: g, value: records.filter(r => r.commodityGroup === g).length })).filter(i => i.value > 0);

    return (
        <div className="flex h-[calc(100vh-100px)] gap-6 animate-fade-in relative">
            
            {/* HIDDEN PRINT AREA */}
            <div id="report-print-area" style={{ position: 'fixed', top: 0, left: '-10000px', width: '297mm', background: 'white', padding: '10mm', zIndex: -100, fontFamily: 'Tahoma' }}>
                <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px', backgroundColor: '#f3f4f6', paddingTop: '10px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0', color: '#1f2937' }}>{viewMode === 'currency_report' ? `گزارش ارزی - ${reportTab === 'queue' ? 'در صف' : reportTab === 'allocated' ? 'تخصیص یافته' : reportTab === 'cheques' ? 'چک‌های تضمین' : 'وضعیت تحویل'}` : 'گزارش وضعیت بیمه'}</h1>
                    <p style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>تاریخ گزارش: {new Date().toLocaleDateString('fa-IR')}</p>
                    {reportCurrencyFilter && <p style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '5px' }}>شرکت: {reportCurrencyFilter}</p>}
                </div>
                {/* Simulated table content for print preview is generated dynamically by html2canvas based on visible table structure logic */}
                {viewMode === 'currency_report' && (
                    <div dangerouslySetInnerHTML={{ __html: '...' }} /> 
                )}
            </div>

            {/* SIDEBAR */}
            <div className="w-80 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col flex-shrink-0">
                <div className="p-4 border-b">
                    <div className="flex justify-between items-center mb-4"><h2 className="font-bold text-gray-800 flex items-center gap-2"><Container size={20} className="text-blue-600" /> بازرگانی</h2><div className="flex gap-1">{viewMode !== 'dashboard' && <button onClick={() => { setViewMode('dashboard'); setSelectedRecord(null); }} className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200" title="داشبورد"><LayoutDashboard size={20}/></button>}<button onClick={() => setShowNewModal(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100" title="پرونده جدید"><Plus size={20} /></button></div></div>
                    <div className="space-y-2 mb-3"><select className="w-full bg-gray-50 border rounded-lg text-xs p-2" value={sidebarCompanyFilter} onChange={e => setSidebarCompanyFilter(e.target.value)}><option value="">همه شرکت‌ها</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input className="w-full bg-gray-50 border rounded-xl pl-2 pr-9 py-2 text-sm" placeholder="جستجو (کالا/شماره)..." /></div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">{loading ? <div className="text-center p-4"><Loader2 className="animate-spin mx-auto"/></div> : filteredRecords.map(rec => (<div key={rec.id} onClick={() => { setSelectedRecord(rec); setViewMode('details'); }} className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedRecord?.id === rec.id ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:border-blue-100'}`}><div className="flex justify-between items-start mb-1"><span className="font-bold text-sm text-gray-800 truncate max-w-[150px]">{rec.goodsName}</span><span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{rec.status}</span></div><div className="text-xs text-gray-500 mb-1">پرونده: {rec.fileNumber}</div><div className="text-[10px] text-gray-400 flex justify-between"><span>{rec.company || 'بدون شرکت'}</span>{rec.registrationNumber && <span className="text-blue-600 bg-blue-50 px-1 rounded">{rec.registrationNumber}</span>}</div></div>))}</div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                {viewMode === 'dashboard' ? (
                    <div className="p-8 overflow-y-auto h-full animate-fade-in">
                        <h1 className="text-2xl font-bold text-gray-800 mb-6">داشبورد مدیریت بازرگانی</h1>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-2xl shadow-sm border border-blue-200"><div><p className="text-blue-600 text-sm font-bold mb-1">پرونده‌های فعال</p><h3 className="text-3xl font-black text-blue-800">{activeFilesCount}</h3></div><p className="text-xs text-blue-500">کل پرونده‌های باز</p></div>
                            <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-5 rounded-2xl shadow-sm border border-amber-200"><div><p className="text-amber-600 text-sm font-bold mb-1">در صف تخصیص</p><h3 className="text-3xl font-black text-amber-800">{queueCount}</h3></div><p className="text-xs text-amber-500">منتظر ارز</p></div>
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-5 rounded-2xl shadow-sm border border-purple-200"><div><p className="text-purple-600 text-sm font-bold mb-1">در حال حمل/ترخیص</p><h3 className="text-3xl font-black text-purple-800">{shippingCount}</h3></div><p className="text-xs text-purple-500">اسناد حمل تا خروج</p></div>
                            <div className="bg-gradient-to-br from-green-50 to-green-100 p-5 rounded-2xl shadow-sm border border-green-200"><div><p className="text-green-600 text-sm font-bold mb-1">ارزش کل پرونده‌ها</p><h3 className="text-xl font-black text-green-800 dir-ltr">{formatNumberString(totalValueUSD.toFixed(0))} $</h3></div><p className="text-xs text-green-500">مجموع دلاری تقریبی</p></div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                             <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm p-6"><h3 className="font-bold text-gray-700 mb-4">وضعیت گروه‌های کالایی</h3><div className="h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={commodityStats}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{fontSize: 12, fontFamily: 'Vazirmatn'}} /><YAxis /><Tooltip contentStyle={{fontFamily: 'Vazirmatn', borderRadius: '8px'}} /><Bar dataKey="value" fill="#3b82f6" radius={[4,4,0,0]} barSize={40} /></BarChart></ResponsiveContainer></div></div>
                             <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 flex flex-col justify-center gap-4">
                                 <button onClick={() => { setViewMode('currency_report'); }} className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 p-4 rounded-xl flex items-center gap-4 transition-all group"><div className="bg-blue-200 p-3 rounded-full group-hover:bg-white transition-colors"><Coins size={24}/></div><div className="text-right"><p className="font-bold">گزارشات ارزی</p><p className="text-xs opacity-70">وضعیت خرید، تخصیص و بدهی</p></div></button>
                                 <button onClick={() => { setViewMode('insurance_report'); }} className="w-full bg-purple-50 hover:bg-purple-100 text-purple-700 p-4 rounded-xl flex items-center gap-4 transition-all group"><div className="bg-purple-200 p-3 rounded-full group-hover:bg-white transition-colors"><Shield size={24}/></div><div className="text-right"><p className="font-bold">گزارشات بیمه</p><p className="text-xs opacity-70">قراردادها و الحاقیه‌ها</p></div></button>
                                 <button onClick={() => setShowNewModal(true)} className="w-full bg-green-50 hover:bg-green-100 text-green-700 p-4 rounded-xl flex items-center gap-4 transition-all group"><div className="bg-green-200 p-3 rounded-full group-hover:bg-white transition-colors"><Plus size={24}/></div><div className="text-right"><p className="font-bold">ثبت پرونده جدید</p><p className="text-xs opacity-70">شروع فرآیند بازرگانی</p></div></button>
                             </div>
                        </div>
                    </div>
                ) : viewMode === 'currency_report' ? (
                    <div className="p-8 flex flex-col h-full animate-fade-in overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Coins className="text-green-600" /> گزارشات ارزی</h2>
                            <div className="flex gap-2"><button onClick={handleExportExcel} className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-100"><FileSpreadsheet size={16}/> اکسل</button><button onClick={handleExportPDF} className="flex items-center gap-1 bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm hover:bg-red-100"><FileDown size={16}/> PDF</button><button onClick={() => setViewMode('details')} className="text-gray-500 hover:text-gray-800 flex items-center gap-2 ml-4">بازگشت <ArrowRight size={18}/></button></div>
                        </div>
                        <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
                            <button onClick={() => setReportTab('delivery')} className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${reportTab === 'delivery' ? 'bg-white shadow text-blue-700 font-bold' : 'text-gray-500'}`}>وضعیت تحویل (جامع)</button>
                            <button onClick={() => setReportTab('queue')} className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${reportTab === 'queue' ? 'bg-white shadow text-amber-700 font-bold' : 'text-gray-500'}`}>در صف تخصیص</button>
                            <button onClick={() => setReportTab('allocated')} className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${reportTab === 'allocated' ? 'bg-white shadow text-green-700 font-bold' : 'text-gray-500'}`}>تخصیص یافته</button>
                            <button onClick={() => setReportTab('expired')} className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${reportTab === 'expired' ? 'bg-white shadow text-red-700 font-bold' : 'text-gray-500'}`}>منقضی / تمدید</button>
                            <button onClick={() => setReportTab('cheques')} className={`flex-1 px-4 py-2 rounded-lg text-sm transition-colors ${reportTab === 'cheques' ? 'bg-white shadow text-purple-700 font-bold' : 'text-gray-500'}`}>گزارش چک‌ها</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div className="bg-blue-50 border border-blue-200 p-6 rounded-2xl shadow-sm"><h3 className="text-blue-800 font-bold mb-2">{reportSummary.title1}</h3><p className="text-2xl font-black text-blue-600 dir-ltr flex items-center gap-2">{reportSummary.type1 === 'USD' ? formatNumberString(reportSummary.value1) + ' $' : formatCurrency(reportSummary.value1)}</p>{reportSummary.subValue1 > 0 && <p className="text-xl font-bold text-blue-800 mt-1 flex items-center gap-1 border-t border-blue-200 pt-2"><span className="text-xs font-normal">معادل ریالی:</span>{formatCurrency(reportSummary.subValue1)}</p>}</div>
                            <div className="bg-indigo-50 border border-indigo-200 p-6 rounded-2xl shadow-sm"><h3 className="text-indigo-800 font-bold mb-2">{reportSummary.title2}</h3><p className="text-2xl font-black text-indigo-600 dir-ltr flex items-center gap-2">{reportSummary.type2 === 'USD' ? formatNumberString(reportSummary.value2) + ' $' : formatCurrency(reportSummary.value2)}</p>{reportSummary.subValue2 > 0 && <p className="text-xl font-bold text-indigo-800 mt-1 flex items-center gap-1 border-t border-indigo-200 pt-2"><span className="text-xs font-normal">معادل ریالی:</span>{formatCurrency(reportSummary.subValue2)}</p>}</div>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                                <div className="flex flex-col gap-3">
                                    <div className="bg-white p-2 rounded-lg border border-blue-200 flex items-center gap-2"><label className="text-xs font-bold text-blue-700 whitespace-nowrap">نرخ حواله (مبادله/نیما):</label><input type="text" inputMode="numeric" className="w-32 border rounded px-2 py-1 text-sm font-mono dir-ltr" value={formatNumberString(nimaRate)} onChange={e => setNimaRate(deformatNumberString(e.target.value))} placeholder="0"/></div>
                                    <div><label className="text-xs font-bold text-gray-500 block mb-2">نرخ برابری (Cross Rates) به دلار:</label><div className="flex gap-2 flex-wrap">{Object.entries(crossRates).map(([curr, rate]) => (<div key={curr} className="flex items-center gap-1 bg-white p-1 rounded border"><span className="text-[10px]">{curr}:</span><input className="w-12 text-center text-xs" value={rate} onChange={e => setCrossRates({...crossRates, [curr]: parseFloat(e.target.value)})} /></div>))}</div></div>
                                </div>
                            </div>
                            <div className="w-full md:w-64 space-y-2">
                                <div><label className="text-xs font-bold text-gray-500 block mb-1 flex items-center gap-1"><Filter size={12}/> فیلتر بر اساس شرکت:</label><select className="w-full border rounded-lg p-2 text-sm bg-white" value={reportCurrencyFilter} onChange={e => setReportCurrencyFilter(e.target.value)}><option value="">نمایش کل (همه شرکت‌ها)</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                {isChequeView && (<div><label className="text-xs font-bold text-gray-500 block mb-1 flex items-center gap-1"><Filter size={12}/> وضعیت چک:</label><select className="w-full border rounded-lg p-2 text-sm bg-white" value={reportChequeStatus} onChange={e => setReportChequeStatus(e.target.value as any)}><option value="all">همه</option><option value="bank">نزد بانک</option><option value="returned">عودت شده</option></select></div>)}
                                {reportTab === 'delivery' && (<div><label className="text-xs font-bold text-gray-500 block mb-1 flex items-center gap-1"><Filter size={12}/> وضعیت تحویل:</label><select className="w-full border rounded-lg p-2 text-sm bg-white" value={reportDeliveryStatus} onChange={e => setReportDeliveryStatus(e.target.value as any)}><option value="all">همه</option><option value="delivered">تحویل شده (کامل)</option><option value="pending">تحویل نشده (مانده دار)</option></select></div>)}
                            </div>
                        </div>
                        <div className="border rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                            {isChequeView ? (
                                <table className="w-full text-xs text-right min-w-[1200px]">
                                    <thead className="bg-gray-100 text-gray-700 whitespace-nowrap"><tr><th className="p-3">شرکت</th><th className="p-3">پرونده</th><th className="p-3 bg-blue-50">شماره ثبت سفارش</th><th className="p-3">شماره چک</th><th className="p-3">مبلغ چک</th><th className="p-3">سررسید</th><th className="p-3">بانک</th><th className="p-3">وضعیت</th></tr></thead>
                                    <tbody className="divide-y divide-gray-100">{reportRecords.map((rec, i) => { const ch = rec.currencyPurchaseData?.guaranteeCheque; return (<tr key={rec.id} className="hover:bg-gray-50"><td className="p-3">{rec.company}</td><td className="p-3 font-mono">{rec.fileNumber}</td><td className="p-3 font-mono bg-blue-50">{rec.registrationNumber}</td><td className="p-3 font-mono">{ch?.chequeNumber}</td><td className="p-3 font-mono dir-ltr font-bold">{formatNumberString(ch?.amount)}</td><td className="p-3">{ch?.dueDate}</td><td className="p-3">{ch?.bank}</td><td className={`p-3 font-bold ${ch?.isReturned?'text-red-500':'text-green-600'}`}>{ch?.isReturned?'عودت شده':'نزد بانک'}</td></tr>) })}</tbody>
                                </table>
                            ) : isProformaView ? (
                                <table className="w-full text-xs text-right min-w-[1200px]">
                                    <thead className="bg-gray-100 text-gray-700 whitespace-nowrap"><tr><th className="p-3">شرکت</th><th className="p-3">پرونده</th><th className="p-3 bg-blue-50">شماره ثبت سفارش</th><th className="p-3">نام فروشنده</th><th className="p-3 bg-blue-50">مبلغ پروفرما (کل)</th><th className="p-3 bg-blue-50">ارز پایه</th><th className="p-3">{reportTab === 'queue' ? 'تاریخ صف' : 'تاریخ تخصیص'}</th><th className="p-3 font-bold bg-amber-50">{reportTab === 'queue' ? 'مدت در صف' : 'مهلت باقی‌مانده'}</th></tr></thead>
                                    <tbody className="divide-y divide-gray-100">{reportRecords.map(rec => { const totalProforma = (rec.items?.reduce((a, b) => a + b.totalPrice, 0) || 0) + (rec.freightCost || 0); const allocDate = getStage(rec, TradeStage.ALLOCATION_APPROVED).allocationDate || '-'; const queueDate = getStage(rec, TradeStage.ALLOCATION_QUEUE).queueDate || '-'; const displayDate = reportTab === 'allocated' ? allocDate : queueDate; let deadlineText = '-'; if (reportTab === 'allocated' && allocDate !== '-') { const diff = calculateDaysPassed(allocDate); deadlineText = `${30 - diff} روز`; } else if (reportTab === 'queue' && queueDate !== '-') { const days = calculateDaysPassed(queueDate); deadlineText = `${days} روز در صف`; } return (<tr key={rec.id} className="hover:bg-gray-50"><td className="p-3 text-gray-600 truncate max-w-[120px]" title={rec.company}>{rec.company}</td><td className="p-3 font-mono">{rec.fileNumber}</td><td className="p-3 font-mono bg-blue-50">{rec.registrationNumber || '-'}</td><td className="p-3 text-gray-600">{rec.sellerName || '-'}</td><td className="p-3 font-mono dir-ltr font-bold text-blue-700 bg-blue-50">{formatNumberString(totalProforma)}</td><td className="p-3 bg-blue-50">{rec.mainCurrency || 'EUR'}</td><td className="p-3 font-mono">{displayDate}</td><td className={`p-3 font-bold ${deadlineText.includes('منقضی') ? 'text-red-600' : 'text-amber-600'}`}>{deadlineText}</td></tr>); })}</tbody>
                                </table>
                            ) : (
                                <table className="w-full text-xs text-right min-w-[1200px]">
                                    <thead className="bg-gray-100 text-gray-700 whitespace-nowrap"><tr><th className="p-3">شرکت</th><th className="p-3">پرونده</th><th className="p-3 bg-blue-50">شماره ثبت سفارش</th><th className="p-3">تاریخ خرید</th><th className="p-3 bg-blue-50">مبلغ خرید</th><th className="p-3 bg-blue-50">نوع ارز</th><th className="p-3">کارگزار</th><th className="p-3">تاریخ تحویل</th><th className="p-3">تحویل گیرنده</th><th className="p-3">مبلغ تحویل</th><th className="p-3">نوع ارز تحویل</th><th className="p-3">حواله شده</th><th className="p-3">مانده تحویل</th></tr></thead>
                                    <tbody className="divide-y divide-gray-100">{reportRecords.map((rec, idx) => { const cp = rec.currencyPurchaseData; const remaining = (cp?.purchasedAmount || 0) - ((cp?.deliveredAmount || 0) + (cp?.remittedAmount || 0)); return (<tr key={rec.id} className="hover:bg-gray-50"><td className="p-3 text-gray-600 truncate max-w-[100px]" title={rec.company}>{rec.company}</td><td className="p-3 font-mono">{rec.fileNumber}</td><td className="p-3 font-mono bg-blue-50">{rec.registrationNumber || '-'}</td><td className="p-3 font-mono">{cp?.purchaseDate || '-'}</td><td className="p-3 font-mono dir-ltr font-bold text-blue-700 bg-blue-50">{formatNumberString(cp?.purchasedAmount)}</td><td className="p-3 bg-blue-50">{cp?.purchasedCurrencyType || rec.mainCurrency}</td><td className="p-3 text-gray-600">{cp?.brokerName || '-'}</td><td className="p-3 font-mono">{cp?.deliveryDate || '-'}</td><td className="p-3 text-gray-600">{cp?.recipientName || '-'}</td><td className="p-3 font-mono dir-ltr text-green-600">{formatNumberString(cp?.deliveredAmount)}</td><td className="p-3 dir-ltr">{cp?.deliveredCurrencyType || '-'}</td><td className="p-3 font-mono dir-ltr text-purple-600">{formatNumberString(cp?.remittedAmount)}</td><td className="p-3 font-mono dir-ltr text-red-600 font-bold bg-red-50">{formatNumberString(remaining)}</td></tr>); }) }</tbody>
                                    <tfoot className="bg-gray-100 font-bold text-gray-800"><tr><td colSpan={11} className="p-3 text-left">جمع کل مانده ارزهای تحویل نشده:</td><td className="p-3 dir-ltr text-red-600">{Object.entries(undeliveredTotals).map(([cur, amount]) => (amount > 0 && <div key={cur}>{formatNumberString(amount)} {cur}</div>))}</td></tr></tfoot>
                                </table>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'insurance_report' ? (
                     <div className="p-8 flex flex-col h-full animate-fade-in">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Shield className="text-purple-600" /> گزارشات و مغایرت‌گیری بیمه</h2>
                            <div className="flex gap-2"><button onClick={handleExportExcel} className="flex items-center gap-1 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-100"><FileSpreadsheet size={16}/> اکسل</button><button onClick={handleExportPDF} className="flex items-center gap-1 bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm hover:bg-red-100"><FileDown size={16}/> PDF</button><button onClick={() => setViewMode('details')} className="text-gray-500 hover:text-gray-800 flex items-center gap-2 ml-4">بازگشت <ArrowRight size={18}/></button></div>
                        </div>
                        <div className="bg-purple-50 p-6 rounded-xl border border-purple-100 mb-6">
                            <label className="text-sm font-bold text-purple-900 block mb-2">انتخاب شرکت بیمه طرف قرارداد</label>
                            <select className="w-full md:w-1/2 border border-purple-200 rounded-lg p-3 bg-white" value={reportInsuranceCompany} onChange={e => setReportInsuranceCompany(e.target.value)}><option value="">-- انتخاب کنید --</option>{Array.from(new Set(records.map(r => r.insuranceData?.company).filter(Boolean))).map(c => <option key={c as string} value={c as string}>{c as string}</option>)}</select>
                        </div>
                        {reportInsuranceCompany && (
                            <div className="border rounded-xl overflow-hidden shadow-sm">
                                <table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-4">شرکت مالک</th><th className="p-4">شماره پرونده</th><th className="p-4">شماره بیمه‌نامه</th><th className="p-4">گروه کالا</th><th className="p-4">حق بیمه پایه</th><th className="p-4">وضعیت پرداخت</th><th className="p-4">جمع الحاقیه</th><th className="p-4 bg-gray-200">مانده حساب (بدهی)</th></tr></thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredReports.length === 0 ? (<tr><td colSpan={8} className="text-center p-8 text-gray-400">اطلاعاتی یافت نشد</td></tr>) : filteredReports.map(rec => {
                                            const cost = rec.insuranceData?.cost || 0;
                                            const endoSum = rec.insuranceData?.endorsements?.reduce((acc, curr) => acc + curr.amount, 0) || 0;
                                            const isPaid = !!rec.insuranceData?.bank;
                                            const paidAmount = isPaid ? cost : 0;
                                            const balance = (cost + endoSum) - paidAmount;
                                            return (<tr key={rec.id} className="hover:bg-gray-50"><td className="p-4 font-bold text-xs">{rec.company}</td><td className="p-4 font-mono">{rec.fileNumber}</td><td className="p-4 font-mono text-blue-600">{rec.insuranceData?.policyNumber}</td><td className="p-4 font-medium text-gray-800">{rec.commodityGroup || '-'}</td><td className="p-4">{formatCurrency(cost)}</td><td className="p-4 text-xs">{isPaid ? (<span className="text-green-600 bg-green-50 px-2 py-1 rounded">پرداخت شده ({rec.insuranceData?.bank})</span>) : (<span className="text-red-500 bg-red-50 px-2 py-1 rounded">پرداخت نشده</span>)}</td><td className={`p-4 font-bold ${endoSum > 0 ? 'text-red-500' : endoSum < 0 ? 'text-green-600' : 'text-gray-400'}`}>{endoSum !== 0 ? formatCurrency(Math.abs(endoSum)) : '-'}</td><td className={`p-4 bg-gray-50 font-bold border-r ${balance === 0 ? 'text-green-600' : 'text-gray-900'}`}>{balance === 0 ? 'تسویه (۰)' : formatCurrency(balance)}</td></tr>);
                                        })}
                                    </tbody>
                                    <tfoot className="bg-purple-100 font-bold text-purple-900"><tr><td colSpan={7} className="p-4 text-left">جمع کل مانده بدهی به بیمه {reportInsuranceCompany}:</td><td className="p-4 text-xl">{formatCurrency(totalDebtInReport)}</td></tr></tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                ) : selectedRecord ? (
                    <div className="flex flex-col h-full">
                        <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-4 flex flex-col md:flex-row justify-between items-center shadow-md z-10">
                             <div className="flex items-center gap-6">
                                 <div><span className="text-xs text-slate-300 block mb-1">جمع هزینه‌های ریالی</span><span className="font-bold text-lg">{formatCurrency(costs?.totalRial || 0)}</span></div>
                                 <div className="w-px h-8 bg-slate-600"></div>
                                 <div><span className="text-xs text-slate-300 block mb-1">جمع هزینه‌های ارزی</span><span className="font-bold text-lg dir-ltr">{formatNumberString(costs?.totalCurrency || 0)} {selectedRecord.mainCurrency || 'EUR'}</span></div>
                                 <div className="w-px h-8 bg-slate-600"></div>
                                 <div className="bg-slate-600/50 p-2 rounded-lg border border-slate-500"><label className="text-[10px] text-blue-200 block mb-1">نرخ ارز (ریال)</label><input type="text" inputMode="numeric" className="bg-transparent border-none text-white font-mono text-sm w-24 focus:ring-0 p-0" value={formatNumberString(exchangeRate)} onChange={e => handleUpdateExchangeRate(deformatNumberString(e.target.value))} placeholder="0"/></div>
                             </div>
                             <div className="flex gap-4 items-center mt-3 md:mt-0">
                                 <div className="text-right"><div className="text-xs text-slate-300">قیمت تمام شده کل</div><div className="text-xl font-bold text-green-400">{formatCurrency(costs?.finishedPrice || 0)}</div></div>
                                 <div className="bg-green-600/20 p-2 rounded-lg border border-green-500/30 text-right"><div className="text-[10px] text-green-200">قیمت تمام شده هر کیلو</div><div className="text-lg font-bold text-green-400">{formatCurrency(costs?.pricePerKg || 0)}</div></div>
                             </div>
                        </div>
                        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                {isEditingMetadata ? (
                                    <div className="flex flex-col gap-2 bg-white p-3 rounded-xl border shadow-sm">
                                        <div className="flex gap-2"><input className="border rounded px-2 py-1 text-sm w-32" value={editMetadataForm.fileNumber} onChange={e => setEditMetadataForm({...editMetadataForm, fileNumber: e.target.value})} placeholder="شماره پرونده" /><input className="border rounded px-2 py-1 text-sm w-48" value={editMetadataForm.goodsName} onChange={e => setEditMetadataForm({...editMetadataForm, goodsName: e.target.value})} placeholder="نام کالا" /><input className="border rounded px-2 py-1 text-sm w-32" value={editMetadataForm.sellerName} onChange={e => setEditMetadataForm({...editMetadataForm, sellerName: e.target.value})} placeholder="فروشنده" /></div>
                                        <div className="flex gap-2 items-center">
                                            <select className="border rounded px-2 py-1 text-sm w-36" value={editMetadataForm.company} onChange={e => setEditMetadataForm({...editMetadataForm, company: e.target.value})}>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                            <select className="border rounded px-2 py-1 text-sm w-20" value={editMetadataForm.mainCurrency} onChange={e => setEditMetadataForm({...editMetadataForm, mainCurrency: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
                                            <button onClick={handleSaveMetadata} className="bg-green-600 text-white p-1 rounded"><Save size={16}/></button><button onClick={() => setIsEditingMetadata(false)} className="bg-gray-300 text-gray-700 p-1 rounded"><X size={16}/></button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h1 className="text-xl font-bold text-gray-800 mb-1 flex items-center gap-2">{selectedRecord.goodsName}<span className="text-xs font-normal text-white bg-blue-600 px-2 py-0.5 rounded-full">{selectedRecord.company}</span></h1>
                                        <div className="text-sm text-gray-500 flex gap-4"><span className="bg-white px-2 py-0.5 rounded border border-gray-200">شماره پرونده: {selectedRecord.fileNumber || selectedRecord.orderNumber}</span><span>فروشنده: {selectedRecord.sellerName}</span>{selectedRecord.commodityGroup && <span className="text-amber-600">گروه: {selectedRecord.commodityGroup}</span>}{selectedRecord.mainCurrency && <span className="text-purple-600 font-bold bg-purple-50 px-2 rounded">ارز پایه: {selectedRecord.mainCurrency}</span>}</div>
                                    </>
                                )}
                            </div>
                            <div className="flex gap-1 bg-gray-200 p-1 rounded-lg">
                                <button onClick={() => setActiveTab('timeline')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${activeTab === 'timeline' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>مراحل</button>
                                <button onClick={() => setActiveTab('proforma')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${activeTab === 'proforma' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>پروفرما</button>
                                <button onClick={() => setActiveTab('insurance')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${activeTab === 'insurance' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>بیمه</button>
                                <button onClick={() => setActiveTab('currency_purchase')} className={`px-3 py-1.5 rounded-md text-sm transition-colors ${activeTab === 'currency_purchase' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>خرید ارز</button>
                            </div>
                        </div>

                        {activeTab === 'insurance' && (
                            <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-fade-in">
                                <div className="bg-purple-50 p-6 rounded-xl border border-purple-100">
                                    <h3 className="text-lg font-bold text-purple-900 mb-4 flex items-center gap-2"><Shield className="text-purple-600" /> مشخصات بیمه‌نامه اصلی</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                        <div className="space-y-2"><label className="text-sm font-bold text-gray-700 block">شماره بیمه‌نامه</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={insuranceForm.policyNumber} onChange={e => setInsuranceForm({...insuranceForm, policyNumber: e.target.value})}/></div>
                                        <div className="space-y-2"><label className="text-sm font-bold text-gray-700 block">نام شرکت بیمه</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={insuranceForm.company} onChange={e => setInsuranceForm({...insuranceForm, company: e.target.value})} placeholder="مثال: بیمه ایران"/></div>
                                        <div className="space-y-2"><label className="text-sm font-bold text-gray-700 block">حق بیمه پایه (ریال)</label><input type="text" inputMode="numeric" className="w-full border rounded-lg px-3 py-2 text-sm dir-ltr text-left" value={formatNumberString(insuranceForm.cost)} onChange={e => setInsuranceForm({...insuranceForm, cost: deformatNumberString(e.target.value)})}/></div>
                                        <div className="space-y-2"><label className="text-sm font-bold text-gray-700 block">بانک پرداخت کننده (در صورت پرداخت)</label><select className="w-full border rounded-lg px-3 py-2 text-sm bg-white" value={insuranceForm.bank} onChange={e => setInsuranceForm({...insuranceForm, bank: e.target.value})}><option value="">-- انتخاب (پرداخت نشده) --</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    </div>
                                    <div className="flex justify-end"><button onClick={handleSaveInsurance} className="bg-purple-600 text-white px-6 py-2 rounded-xl flex items-center gap-2 font-medium hover:bg-purple-700 transition-colors"><Save size={18}/> ذخیره اطلاعات بیمه</button></div>
                                </div>

                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Plus className="text-green-600"/> الحاقیه‌ها (افزایش/کاهش)</h3>
                                    <div className="flex gap-2 items-end mb-4 bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300">
                                        <div className="w-32"><label className="text-xs text-gray-500">تاریخ</label><input className="w-full border rounded p-1.5 text-sm" placeholder="1403/xx/xx" value={newEndorsement.date} onChange={e => setNewEndorsement({...newEndorsement, date: e.target.value})}/></div>
                                        <div className="w-40"><label className="text-xs text-gray-500">مبلغ (ریال)</label><input type="text" inputMode="numeric" className="w-full border rounded p-1.5 text-sm dir-ltr text-left" placeholder="+/-" value={formatNumberString(newEndorsement.amount)} onChange={e => setNewEndorsement({...newEndorsement, amount: deformatNumberString(e.target.value)})}/></div>
                                        <div className="flex-1"><label className="text-xs text-gray-500">توضیحات (علت صدور)</label><input className="w-full border rounded p-1.5 text-sm" value={newEndorsement.description} onChange={e => setNewEndorsement({...newEndorsement, description: e.target.value})}/></div>
                                        <button onClick={handleAddEndorsement} disabled={!newEndorsement.amount} className="bg-green-600 text-white p-1.5 rounded h-[34px] w-10 flex items-center justify-center disabled:opacity-50"><Plus size={20} /></button>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        {selectedRecord.insuranceData?.endorsements?.length === 0 && <div className="text-center text-gray-400 py-4 text-sm">هیچ الحاقیه‌ای ثبت نشده است.</div>}
                                        {selectedRecord.insuranceData?.endorsements?.map((endo) => (
                                            <div key={endo.id} className="flex items-center justify-between bg-white p-3 rounded border border-gray-200 shadow-sm">
                                                <div className="flex gap-4 items-center text-sm text-gray-700">
                                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{endo.date}</span>
                                                    <span>{endo.description}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className={`font-mono font-bold ${endo.amount > 0 ? 'text-red-500' : 'text-green-600'}`}>{endo.amount > 0 ? '+' : ''}{formatCurrency(endo.amount)}</span>
                                                    <button onClick={() => handleRemoveEndorsement(endo.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                                                </div>
                                            </div>
                                        ))}
                                        {((selectedRecord.insuranceData?.endorsements?.length || 0) > 0 || (selectedRecord.insuranceData?.cost || 0) > 0) && (
                                            <div className="flex justify-between items-center pt-4 mt-2 border-t font-bold text-gray-800 bg-gray-50 p-3 rounded-lg">
                                                <span>جمع کل هزینه بیمه (پایه + الحاقیه‌ها):</span>
                                                <span className="font-mono text-xl text-purple-700">{formatCurrency((selectedRecord.insuranceData?.cost || 0) + (selectedRecord.insuranceData?.endorsements?.reduce((acc, curr) => acc + curr.amount, 0) || 0))}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'currency_purchase' && (
                            <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-fade-in bg-gray-50/50">
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Wallet className="text-amber-600" size={20}/> چک تضمین (غیر هزینه‌ای)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                        <div className="space-y-1"><label className="text-xs text-gray-600">شماره چک</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm" value={guaranteeCheque.chequeNumber} onChange={e => setGuaranteeCheque({...guaranteeCheque, chequeNumber: normalizeInputNumber(e.target.value)})}/></div>
                                        <div className="space-y-1"><label className="text-xs text-gray-600">مبلغ چک (ریال)</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm dir-ltr text-left" value={formatNumberString(guaranteeCheque.amount)} onChange={e => setGuaranteeCheque({...guaranteeCheque, amount: deformatNumberString(e.target.value)})}/></div>
                                        <div className="space-y-1"><label className="text-xs text-gray-600">سررسید (1403/xx/xx)</label><input className="w-full border rounded-lg p-2 text-sm" value={guaranteeCheque.dueDate} onChange={e => setGuaranteeCheque({...guaranteeCheque, dueDate: e.target.value})}/></div>
                                        <div className="space-y-1"><label className="text-xs text-gray-600">بانک صادرکننده</label><select className="w-full border rounded-lg p-2 text-sm bg-white" value={guaranteeCheque.bank} onChange={e => setGuaranteeCheque({...guaranteeCheque, bank: e.target.value})}><option value="">-- انتخاب --</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    </div>
                                    <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="checkbox" 
                                                id="chequeReturned" 
                                                checked={guaranteeCheque.isReturned} 
                                                onChange={e => setGuaranteeCheque({...guaranteeCheque, isReturned: e.target.checked})}
                                                className="w-4 h-4 text-amber-600"
                                            />
                                            <label htmlFor="chequeReturned" className="text-sm font-bold text-gray-700">چک به شرکت عودت داده شد</label>
                                        </div>
                                        {guaranteeCheque.isReturned && (<div className="flex items-center gap-2"><label className="text-xs text-gray-600">تاریخ عودت:</label><input className="border rounded p-1 text-sm" placeholder="1403/xx/xx" value={guaranteeCheque.returnDate} onChange={e => setGuaranteeCheque({...guaranteeCheque, returnDate: e.target.value})}/></div>)}
                                        <div className="flex-1 flex justify-end"><button onClick={handleSaveGuaranteeCheque} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-amber-700 flex items-center gap-1"><Save size={16}/> ذخیره چک تضمین</button></div>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><RefreshCw className="text-blue-600" size={20}/> جریان پرداخت‌های ریالی خرید ارز</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-4 bg-gray-50 p-4 rounded-lg border">
                                        <div><label className="text-xs text-gray-600">نوع عملیات</label><select className="w-full border rounded p-2 text-sm" value={newRialPayment.type} onChange={e => setNewRialPayment({...newRialPayment, type: e.target.value as any})}><option value="PAYMENT">واریز به صرافی</option><option value="REFUND">عودت وجه (برگشت)</option></select></div>
                                        <div><label className="text-xs text-gray-600">مبلغ (ریال)</label><input type="text" inputMode="numeric" className="w-full border rounded p-2 text-sm dir-ltr text-left" value={formatNumberString(newRialPayment.amount)} onChange={e => setNewRialPayment({...newRialPayment, amount: deformatNumberString(e.target.value)})}/></div>
                                        <div><label className="text-xs text-gray-600">تاریخ</label><input className="w-full border rounded p-2 text-sm" placeholder="1403/xx/xx" value={newRialPayment.date} onChange={e => setNewRialPayment({...newRialPayment, date: e.target.value})}/></div>
                                        <div><label className="text-xs text-gray-600">بانک / توضیحات</label><input className="w-full border rounded p-2 text-sm" value={newRialPayment.description} onChange={e => setNewRialPayment({...newRialPayment, description: e.target.value})}/></div>
                                        <button onClick={handleAddRialPayment} disabled={!newRialPayment.amount} className="bg-blue-600 text-white p-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">ثبت تراکنش</button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-right border rounded-lg overflow-hidden">
                                            <thead className="bg-gray-100"><tr><th className="p-3">نوع</th><th className="p-3">مبلغ</th><th className="p-3">تاریخ</th><th className="p-3">توضیحات</th><th className="p-3 w-10"></th></tr></thead>
                                            <tbody className="divide-y">
                                                {currencyForm.payments.map((p) => (
                                                    <tr key={p.id}><td className="p-3">{p.type === 'PAYMENT' ? <span className="text-red-600 bg-red-50 px-2 py-1 rounded text-xs font-bold">پرداخت</span> : <span className="text-green-600 bg-green-50 px-2 py-1 rounded text-xs font-bold">عودت</span>}</td><td className="p-3 font-mono dir-ltr">{formatCurrency(p.amount)}</td><td className="p-3">{p.date}</td><td className="p-3 text-gray-600">{p.description}</td><td className="p-3"><button onClick={() => handleRemoveRialPayment(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td></tr>
                                                ))}
                                                <tr className="bg-blue-50 font-bold border-t-2 border-blue-100"><td className="p-3 text-blue-900">خالص پرداختی ریالی:</td><td className="p-3 dir-ltr text-left font-mono text-blue-900">{formatCurrency(getNetRialPayments(selectedRecord))}</td><td colSpan={3}></td></tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><CheckCircle2 className="text-green-600" size={20}/> تخصیص و تحویل ارز (پارت‌ها)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-4 bg-green-50 p-4 rounded-lg border border-green-100"><div><label className="text-xs text-gray-600">کارگزار</label><input className="w-full border rounded p-2 text-sm" value={newCurrencyTranche.brokerName || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, brokerName: e.target.value})}/></div><div><label className="text-xs text-gray-600">صرافی/بانک</label><input className="w-full border rounded p-2 text-sm" value={newCurrencyTranche.exchangeName || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, exchangeName: e.target.value})}/></div><div><label className="text-xs text-gray-600">تاریخ خرید</label><input className="w-full border rounded p-2 text-sm" placeholder="1403/xx/xx" value={newCurrencyTranche.date || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, date: e.target.value})}/></div><div><label className="text-xs text-gray-600 font-bold">مقدار ارز</label><div className="flex gap-1"><input type="text" inputMode="numeric" className="w-full border rounded p-2 text-sm dir-ltr text-left" value={formatNumberString(newCurrencyTranche.amount)} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, amount: deformatNumberString(e.target.value)})}/><select className="border rounded p-2 text-xs w-16" value={newCurrencyTranche.currencyType} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, currencyType: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div></div><button onClick={handleAddCurrencyTranche} disabled={!newCurrencyTranche.amount} className="bg-green-600 text-white p-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">افزودن پارت</button></div>
                                    <div className="overflow-x-auto mb-6"><table className="w-full text-sm text-right border rounded-lg overflow-hidden"><thead className="bg-gray-100"><tr><th className="p-3">تاریخ</th><th className="p-3">کارگزار</th><th className="p-3">صرافی</th><th className="p-3">مقدار ارز</th><th className="p-3 w-10"></th></tr></thead><tbody className="divide-y">{(currencyForm.tranches || []).map((t) => (<tr key={t.id}><td className="p-3">{t.date}</td><td className="p-3">{t.brokerName}</td><td className="p-3">{t.exchangeName}</td><td className="p-3 font-mono dir-ltr text-blue-700 font-bold">{formatNumberString(t.amount)} {t.currencyType}</td><td className="p-3"><button onClick={() => handleRemoveCurrencyTranche(t.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td></tr>))}<tr className="bg-blue-50 font-bold border-t-2 border-blue-100"><td colSpan={3} className="p-3 text-blue-900 text-left">جمع کل ارز خریداری شده:</td><td className="p-3 dir-ltr text-left font-mono text-blue-900">{formatNumberString(currencyForm.purchasedAmount)} {selectedRecord.mainCurrency}</td><td></td></tr></tbody></table></div>
                                    <div className="bg-gray-50 p-4 rounded-xl flex flex-col justify-center items-center text-center border border-gray-200 mb-6"><span className="text-sm text-gray-500 mb-2">قیمت تمام شده ارز (نرخ واقعی میانگین)</span><div className="text-3xl font-black text-blue-700 dir-ltr font-mono mb-2">{currencyForm.purchasedAmount > 0 ? formatCurrency(getNetRialPayments(selectedRecord) / currencyForm.purchasedAmount) : '0'}</div><span className="text-xs text-gray-400">خالص پرداختی ریالی / کل مقدار ارز</span></div>
                                    <div className="border-t pt-4">
                                        <h4 className="text-sm font-bold text-gray-700 mb-3">وضعیت تحویل</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div className="space-y-1"><label className="text-xs text-gray-600">ارز تحویل شده</label><div className="flex gap-2"><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm dir-ltr text-left" value={formatNumberString(currencyForm.deliveredAmount)} onChange={e => setCurrencyForm({...currencyForm, deliveredAmount: deformatNumberString(e.target.value)})}/><select className="border rounded-lg p-2 text-xs bg-gray-50" value={currencyForm.deliveredCurrencyType || selectedRecord.mainCurrency || 'EUR'} onChange={e => setCurrencyForm({...currencyForm, deliveredCurrencyType: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div></div>
                                            <div className="space-y-1"><label className="text-xs text-gray-600">ارز حواله شده</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm dir-ltr text-left" value={formatNumberString(currencyForm.remittedAmount)} onChange={e => setCurrencyForm({...currencyForm, remittedAmount: deformatNumberString(e.target.value)})}/></div>
                                            <div className="space-y-1"><label className="text-xs text-gray-600">تاریخ تحویل (شمسی)</label><input className="w-full border rounded-lg p-2 text-sm" placeholder="1403/xx/xx" value={currencyForm.deliveryDate || ''} onChange={e => setCurrencyForm({...currencyForm, deliveryDate: e.target.value})}/></div>
                                            <div className="space-y-1"><label className="text-xs text-gray-600">نام تحویل گیرنده</label><input className="w-full border rounded-lg p-2 text-sm" value={currencyForm.recipientName || ''} onChange={e => setCurrencyForm({...currencyForm, recipientName: e.target.value})}/></div>
                                        </div>
                                        <div className="flex items-center gap-2 pt-2"><button onClick={() => setCurrencyForm({...currencyForm, isDelivered: !currencyForm.isDelivered})} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${currencyForm.isDelivered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{currencyForm.isDelivered ? <CheckSquare size={18}/> : <Square size={18}/>} تحویل نهایی و تسویه</button></div>
                                    </div>
                                    <div className="mt-6 flex justify-end"><button onClick={handleSaveCurrencyFinalization} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-xl flex items-center gap-2 font-medium shadow-sm transition-colors"><Save size={18} /> ثبت و بروزرسانی اطلاعات</button></div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'proforma' && (
                            <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 p-4 rounded-xl border">
                                    <div className="space-y-2"><label className="text-sm font-bold text-gray-700 block">شماره ثبت سفارش</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={selectedRecord.registrationNumber || ''} onChange={e => handleUpdateProforma('registrationNumber', e.target.value)}/></div>
                                    <div className="space-y-2"><label className="text-sm font-bold text-gray-700 block">بانک عامل (ثبت سفارش)</label><select className="w-full border rounded-lg px-3 py-2 text-sm bg-white" value={selectedRecord.operatingBank || ''} onChange={e => handleUpdateProforma('operatingBank', e.target.value)}><option value="">-- انتخاب --</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    <div className="space-y-2"><label className="text-sm font-bold text-gray-700 block">هزینه حمل ({selectedRecord.mainCurrency || 'EUR'})</label><input type="text" inputMode="numeric" className="w-full border rounded-lg px-3 py-2 text-sm dir-ltr text-left" value={formatNumberString(selectedRecord.freightCost)} onChange={e => handleUpdateProforma('freightCost', deformatNumberString(e.target.value))}/></div>
                                </div>
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                                    <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2"><Banknote size={16} /> هزینه‌های ثبت سفارش (ریالی)</h3>
                                    <div className="flex gap-2 items-end mb-4 bg-white p-3 rounded-lg border">
                                         <div className="w-32"><label className="text-xs text-gray-500">تاریخ</label><input className="w-full border rounded p-1.5 text-sm" placeholder="1403/xx/xx" value={newLicenseTx.date} onChange={e => setNewLicenseTx({...newLicenseTx, date: e.target.value})}/></div>
                                         <div className="w-40"><label className="text-xs text-gray-500">مبلغ (ریال)</label><input type="text" inputMode="numeric" className="w-full border rounded p-1.5 text-sm dir-ltr text-left" value={formatNumberString(newLicenseTx.amount)} onChange={e => setNewLicenseTx({...newLicenseTx, amount: deformatNumberString(e.target.value)})}/></div>
                                         <div className="flex-1"><label className="text-xs text-gray-500">توضیحات / بانک</label><input className="w-full border rounded p-1.5 text-sm" value={newLicenseTx.description} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})}/></div>
                                         <button onClick={handleAddLicenseTx} disabled={!newLicenseTx.amount} className="bg-amber-600 text-white p-1.5 rounded h-[34px] w-10 flex items-center justify-center disabled:opacity-50"><Plus size={20} /></button>
                                     </div>
                                     <div className="space-y-2">{selectedRecord.licenseData?.transactions?.map((tx) => (<div key={tx.id} className="flex items-center justify-between bg-white p-3 rounded border border-amber-200 shadow-sm"><div className="flex gap-4 items-center text-sm text-gray-700"><span className="text-xs text-gray-400 bg-gray-100 px-2 rounded">{tx.date}</span><span>{tx.description} {tx.bank ? `(${tx.bank})` : ''}</span></div><div className="flex items-center gap-4"><span className="font-mono font-bold text-amber-700">{formatCurrency(tx.amount)}</span><button onClick={() => handleRemoveLicenseTx(tx.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></div></div>))}
                                     <div className="flex justify-between items-center pt-2 mt-2 border-t border-amber-200 font-bold text-amber-900"><span className="text-sm">جمع کل هزینه‌ها:</span><span className="font-mono">{formatCurrency(selectedRecord.stages[TradeStage.LICENSES].costRial)}</span></div></div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Package className="text-amber-600"/> لیست اقلام کالا</h3>
                                    <div className="flex gap-2 items-end mb-4 bg-gray-50 p-3 rounded-xl border border-dashed border-gray-300">
                                        <div className="flex-1"><label className="text-xs text-gray-500">نام کالا</label><input className="w-full border rounded p-1.5 text-sm" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></div>
                                        <div className="w-24"><label className="text-xs text-gray-500">وزن (KG)</label><input type="number" className="w-full border rounded p-1.5 text-sm dir-ltr text-left" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})} /></div>
                                        <div className="w-32"><label className="text-xs text-gray-500">فی ({selectedRecord.mainCurrency || 'EUR'})</label><input type="text" inputMode="numeric" className="w-full border rounded p-1.5 text-sm dir-ltr text-left" value={formatNumberString(newItem.unitPrice)} onChange={e => setNewItem({...newItem, unitPrice: deformatNumberString(e.target.value)})} /></div>
                                        <button onClick={handleAddItem} disabled={!newItem.name} className="bg-blue-600 text-white p-1.5 rounded h-[34px] w-10 flex items-center justify-center disabled:opacity-50"><Plus size={20} /></button>
                                    </div>
                                    <table className="w-full text-sm text-right border rounded-lg overflow-hidden">
                                        <thead className="bg-gray-100 text-gray-600"><tr><th className="p-3">ردیف</th><th className="p-3">شرح کالا</th><th className="p-3">وزن (KG)</th><th className="p-3">فی</th><th className="p-3">قیمت کل</th><th className="p-3">حذف</th></tr></thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {selectedRecord.items?.map((item, idx) => (
                                                <tr key={item.id}><td className="p-3">{idx + 1}</td><td className="p-3 font-medium">{item.name}</td><td className="p-3 dir-ltr text-right">{formatNumberString(item.weight)}</td><td className="p-3 dir-ltr text-right">{formatNumberString(item.unitPrice)}</td><td className="p-3 dir-ltr text-right font-bold text-gray-800">{formatNumberString(item.totalPrice)}</td><td className="p-3 text-center"><button onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'timeline' && (
                            <div className="flex-1 overflow-y-auto p-6 animate-fade-in">
                                <div className="relative border-r border-gray-200 mr-4 space-y-8">
                                    {STAGES.map((stage, idx) => {
                                        const data = getStage(selectedRecord, stage);
                                        const isEditing = editingStage === stage;
                                        const isQueueStage = stage === TradeStage.ALLOCATION_QUEUE;
                                        let daysInQueue = 0;
                                        if (isQueueStage && data.queueDate) {
                                            const allocatedStage = getStage(selectedRecord, TradeStage.ALLOCATION_APPROVED);
                                            if (allocatedStage.isCompleted && allocatedStage.allocationDate) {
                                                daysInQueue = calculateDaysPassed(data.queueDate, allocatedStage.allocationDate);
                                            } else {
                                                daysInQueue = calculateDaysPassed(data.queueDate);
                                            }
                                        }
                                        const isAllocationStage = stage === TradeStage.ALLOCATION_APPROVED;
                                        let deadlineText = '';
                                        if (isAllocationStage && data.isCompleted && data.allocationDate) {
                                            const allocDate = parsePersianDate(data.allocationDate);
                                            if (allocDate) {
                                                const deadline = new Date(allocDate);
                                                deadline.setDate(allocDate.getDate() + 30);
                                                const diff = Math.ceil((deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                                const deadlineShamsi = deadline.toLocaleDateString('fa-IR-u-ca-persian');
                                                if (diff > 0) deadlineText = `${diff} روز مهلت باقیست (تا ${deadlineShamsi})`;
                                                else deadlineText = `${Math.abs(diff)} روز گذشته (منقضی شده) - ${deadlineShamsi}`;
                                            }
                                        }

                                        return (
                                            <div key={stage} className="relative pr-8">
                                                <div className={`absolute -right-3 top-1 w-6 h-6 rounded-full border-4 flex items-center justify-center bg-white ${data.isCompleted ? 'border-green-500 text-green-500' : 'border-gray-300 text-gray-300'}`}>{data.isCompleted ? <CheckCircle2 size={12} className="fill-green-500 text-white" /> : <Circle size={10} className="fill-gray-100" />}</div>
                                                <div className={`border rounded-xl transition-all ${data.isCompleted ? 'bg-green-50/30 border-green-100' : isEditing ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' : 'bg-white border-gray-200'}`}>
                                                    <div className="p-4 flex justify-between items-center cursor-pointer" onClick={() => !isEditing && handleEditStage(stage)}>
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex items-center gap-3"><span className="font-bold text-gray-700">{stage}</span>{data.isCompleted && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">تکمیل شده</span>}</div>
                                                            {isQueueStage && data.queueDate && (<div className="flex gap-2 text-xs text-amber-600 items-center"><span>تاریخ صف: {data.queueDate}</span><span className="bg-amber-100 px-1.5 rounded">{daysInQueue} روز</span>{data.hasFinancialProvision && <span className="bg-green-100 text-green-700 px-1.5 rounded flex items-center gap-1"><CheckCircle2 size={10}/> تامین مالی</span>}</div>)}
                                                            {isAllocationStage && data.isCompleted && (<div className="text-xs font-bold text-purple-600">تاریخ تخصیص: {data.allocationDate} | {deadlineText}</div>)}
                                                        </div>
                                                        {!isEditing && (<div className="text-xs text-gray-500 flex gap-4">{data.costRial > 0 && <span>{formatCurrency(data.costRial)}</span>}{data.costCurrency > 0 && <span className="dir-ltr">{formatNumberString(data.costCurrency)} {data.currencyType}</span>}{data.attachments.length > 0 && <span className="flex items-center gap-1"><Paperclip size={12}/> {data.attachments.length}</span>}</div>)}
                                                    </div>
                                                    {isEditing && (
                                                        <div className="p-4 border-t border-blue-100 bg-white/50 space-y-4 animate-fade-in">
                                                            <div className="flex items-center gap-2 mb-2"><input type="checkbox" id={`check-${stage}`} checked={stageData.isCompleted} onChange={e => setStageData({...stageData, isCompleted: e.target.checked})} className="w-4 h-4 text-green-600 rounded focus:ring-green-500"/><label htmlFor={`check-${stage}`} className="text-sm font-medium">مرحله تکمیل شد</label></div>
                                                            {isQueueStage && (<div className="bg-amber-50 p-3 rounded-lg border border-amber-100 grid grid-cols-1 md:grid-cols-2 gap-4"><div className="space-y-1"><label className="text-xs text-gray-600 flex items-center gap-1"><Calendar size={12}/> تاریخ ورود به صف (1403/xx/xx)</label><input type="text" placeholder="1403/xx/xx" className="w-full border rounded p-1.5 text-sm" value={stageData.queueDate || ''} onChange={e => setStageData({...stageData, queueDate: e.target.value})} /></div><div className="flex items-center gap-2 h-full pt-4"><input type="checkbox" id="fin-prov" checked={stageData.hasFinancialProvision} onChange={e => setStageData({...stageData, hasFinancialProvision: e.target.checked})} className="w-4 h-4" /><label htmlFor="fin-prov" className="text-sm">تامین مالی انجام شده</label></div></div>)}
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div><label className="text-xs text-gray-500 block mb-1">هزینه ریالی</label><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm dir-ltr text-left" value={formatNumberString(stageData.costRial)} onChange={e => setStageData({...stageData, costRial: deformatNumberString(e.target.value)})} /></div><div><label className="text-xs text-gray-500 block mb-1">هزینه ارزی</label><div className="flex gap-1"><input type="text" inputMode="numeric" className="w-full border rounded-lg p-2 text-sm dir-ltr text-left" value={formatNumberString(stageData.costCurrency)} onChange={e => setStageData({...stageData, costCurrency: deformatNumberString(e.target.value)})} /><select className="border rounded-lg p-2 text-sm w-20" value={stageData.currencyType} onChange={e => setStageData({...stageData, currencyType: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div></div></div>
                                                            <div><label className="text-xs text-gray-500 block mb-1">توضیحات</label><textarea className="w-full border rounded-lg p-2 text-sm h-20 resize-none" value={stageData.description} onChange={e => setStageData({...stageData, description: e.target.value})} /></div>
                                                            <div><div className="flex justify-between items-center mb-2"><label className="text-xs text-gray-500">مدارک</label><button onClick={() => fileInputRef.current?.click()} className="text-xs flex items-center gap-1 text-blue-600"><Plus size={12}/> افزودن</button><input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} /></div><div className="space-y-2">{stageData.attachments?.map((file, i) => (<div key={i} className="flex items-center justify-between bg-gray-50 p-2 rounded border text-xs"><span className="truncate">{file.fileName}</span><button onClick={() => setStageData(prev => ({...prev, attachments: prev.attachments?.filter((_, idx) => idx !== i)}))} className="text-red-500"><X size={14}/></button></div>))}</div></div>
                                                            <div className="flex justify-end gap-2 pt-2"><button onClick={() => setEditingStage(null)} className="px-3 py-1.5 text-sm text-gray-600 border rounded-lg">انصراف</button><button onClick={handleSaveStage} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg flex items-center gap-1"><Save size={14} /> ذخیره</button></div>
                                                        </div>
                                                    )}
                                                    {!isEditing && (data.description || data.attachments.length > 0) && (<div className="px-4 pb-4 text-sm text-gray-600">{data.description && <p className="mb-2">{data.description}</p>}{data.attachments.length > 0 && <div className="flex gap-2 flex-wrap">{data.attachments.map((f, i) => <a key={i} href={f.url} target="_blank" className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded text-xs text-blue-600"><Paperclip size={10} /> {f.fileName.substring(0,10)}...</a>)}</div>}</div>)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400"><Container size={64} className="mb-4 opacity-20" /><p>یک پرونده را انتخاب کنید یا پرونده جدید بسازید</p></div>
                )}
            </div>
            
            {showNewModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
                        <h3 className="font-bold text-lg mb-6 flex items-center gap-2"><Plus size={20} className="text-blue-600" /> ایجاد پرونده بازرگانی جدید</h3>
                        <div className="space-y-4">
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">شماره پرونده (داخلی)</label><input className="w-full border rounded-lg px-3 py-2" value={newFileNumber} onChange={e => setNewFileNumber(e.target.value)} placeholder="FILE-1403-001" /></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">شرکت مالک پرونده</label><select className="w-full border rounded-lg px-3 py-2 bg-white" value={newRecordCompany} onChange={e => setNewRecordCompany(e.target.value)}><option value="">-- انتخاب کنید --</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">نام کالا / پروژه</label><input className="w-full border rounded-lg px-3 py-2" value={newGoodsName} onChange={e => setNewGoodsName(e.target.value)} placeholder="مثال: قطعات یدکی..." /></div>
                            <div><label className="block text-sm font-medium text-gray-700 mb-1">گروه کالایی</label><select className="w-full border rounded-lg px-3 py-2 bg-white" value={newCommodityGroup} onChange={e => setNewCommodityGroup(e.target.value)}><option value="">-- انتخاب کنید --</option>{commodityGroups.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">نام فروشنده</label><input className="w-full border rounded-lg px-3 py-2" value={newSellerName} onChange={e => setNewSellerName(e.target.value)} /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">ارز پایه</label><select className="w-full border rounded-lg px-3 py-2 bg-white" value={newMainCurrency} onChange={e => setNewMainCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div></div>
                        </div>
                        <div className="flex justify-end gap-3 mt-8"><button onClick={() => setShowNewModal(false)} className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50">انصراف</button><button onClick={handleCreateRecord} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">ایجاد پرونده</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TradeModule;
