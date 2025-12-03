
import React, { useState, useEffect, useRef } from 'react';
import { User, TradeRecord, TradeStage, TradeItem, SystemSettings, InsuranceEndorsement, CurrencyPurchaseData, TradeTransaction, CurrencyTranche, TradeStageData, ShippingDocument, ShippingDocType, DocStatus, InvoiceItem, InspectionData, InspectionPayment, InspectionCertificate, ClearanceData, WarehouseReceipt, ClearancePayment } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, deleteTradeRecord, getSettings, uploadFile } from '../services/storageService';
import { generateUUID, formatCurrency, formatNumberString, deformatNumberString, parsePersianDate, getCurrentShamsiDate } from '../constants';
import { Container, Plus, Search, CheckCircle2, Circle, Save, Trash2, X, Package, ArrowRight, History, Banknote, Coins, Filter, Wallet, FileSpreadsheet, Shield, LayoutDashboard, Printer, FileDown, PieChart as LucidePieChart, BarChart3, ListFilter, Paperclip, Upload, Calendar, Building2, Layers, FolderOpen, ChevronLeft, ArrowLeft, Home, Calculator, Ship, FileText, Scale, Stamp, AlertCircle, Plane, ClipboardCheck, Microscope, Eye, RefreshCw, Warehouse } from 'lucide-react';
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

// Report Types
type ReportType = 'general' | 'allocation_queue' | 'allocated' | 'currency' | 'insurance' | 'shipping' | 'inspection' | 'customs';

const TradeModule: React.FC<TradeModuleProps> = ({ currentUser }) => {
    const [records, setRecords] = useState<TradeRecord[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<TradeRecord | null>(null);
    const [commodityGroups, setCommodityGroups] = useState<string[]>([]);
    const [availableBanks, setAvailableBanks] = useState<string[]>([]);
    const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);

    // Navigation State (Hierarchy)
    const [navLevel, setNavLevel] = useState<'ROOT' | 'COMPANY' | 'GROUP'>('ROOT');
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<'dashboard' | 'details' | 'reports'>('dashboard');
    const [activeReport, setActiveReport] = useState<ReportType>('general');
    const [reportFilterCompany, setReportFilterCompany] = useState<string>('');
    const [reportFilterInternalCompany, setReportFilterInternalCompany] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Form States
    const [showNewModal, setShowNewModal] = useState(false);
    const [newFileNumber, setNewFileNumber] = useState('');
    const [newGoodsName, setNewGoodsName] = useState('');
    const [newSellerName, setNewSellerName] = useState('');
    const [newCommodityGroup, setNewCommodityGroup] = useState('');
    const [newMainCurrency, setNewMainCurrency] = useState('EUR');
    const [newRecordCompany, setNewRecordCompany] = useState('');
    
    const [activeTab, setActiveTab] = useState<'timeline' | 'proforma' | 'insurance' | 'currency_purchase' | 'shipping_docs' | 'inspection' | 'clearance'>('timeline');
    
    // Stage Detail Modal State
    const [editingStage, setEditingStage] = useState<TradeStage | null>(null);
    const [stageFormData, setStageFormData] = useState<Partial<TradeStageData>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadingStageFile, setUploadingStageFile] = useState(false);

    // Items State
    const [newItem, setNewItem] = useState<Partial<TradeItem>>({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });

    // Insurance State
    const [insuranceForm, setInsuranceForm] = useState<NonNullable<TradeRecord['insuranceData']>>({ policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] });
    const [newEndorsement, setNewEndorsement] = useState<Partial<InsuranceEndorsement>>({ amount: 0, description: '', date: '' });
    const [endorsementType, setEndorsementType] = useState<'increase' | 'refund'>('increase');
    
    // Inspection State
    const [inspectionForm, setInspectionForm] = useState<InspectionData>({ certificates: [], payments: [] });
    const [newInspectionCertificate, setNewInspectionCertificate] = useState<Partial<InspectionCertificate>>({ part: '', company: '', certificateNumber: '', amount: 0 });
    const [newInspectionPayment, setNewInspectionPayment] = useState<Partial<InspectionPayment>>({ part: '', amount: 0, date: '', bank: '' });

    // Clearance State
    const [clearanceForm, setClearanceForm] = useState<ClearanceData>({ receipts: [], payments: [] });
    const [newWarehouseReceipt, setNewWarehouseReceipt] = useState<Partial<WarehouseReceipt>>({ number: '', part: '', issueDate: '' });
    const [newClearancePayment, setNewClearancePayment] = useState<Partial<ClearancePayment>>({ amount: 0, part: '', bank: '', date: '' });

    // License Transactions State
    const [newLicenseTx, setNewLicenseTx] = useState<Partial<TradeTransaction>>({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });

    // Currency Purchase State
    const [currencyForm, setCurrencyForm] = useState<CurrencyPurchaseData>({
        payments: [], purchasedAmount: 0, purchasedCurrencyType: '', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: '', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: []
    });
    
    // Currency Tranche State
    const [newCurrencyTranche, setNewCurrencyTranche] = useState<Partial<CurrencyTranche>>({ amount: 0, currencyType: 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });

    // Shipping Docs State
    const [activeShippingSubTab, setActiveShippingSubTab] = useState<ShippingDocType>('Commercial Invoice');
    const [shippingDocForm, setShippingDocForm] = useState<Partial<ShippingDocument>>({
        status: 'Draft',
        documentNumber: '',
        documentDate: '',
        attachments: [],
        invoiceItems: [],
        freightCost: 0
    });
    const [newInvoiceItem, setNewInvoiceItem] = useState<Partial<InvoiceItem>>({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
    const [uploadingDocFile, setUploadingDocFile] = useState(false);
    const docFileInputRef = useRef<HTMLInputElement>(null);


    // PDF Generation State
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

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
            // Insurance Init
            if (selectedRecord.insuranceData) {
                setInsuranceForm(selectedRecord.insuranceData);
            } else {
                setInsuranceForm({ policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] });
            }

            // Inspection Init
            if (selectedRecord.inspectionData) {
                const data = selectedRecord.inspectionData;
                const certs = data.certificates || [];
                if (certs.length === 0 && data.certificateNumber) {
                     certs.push({
                         id: generateUUID(),
                         part: 'Original',
                         certificateNumber: data.certificateNumber,
                         company: data.inspectionCompany || '',
                         amount: data.totalInvoiceAmount || 0
                     });
                }
                setInspectionForm({
                    certificates: certs,
                    payments: data.payments || []
                });
            } else {
                setInspectionForm({ certificates: [], payments: [] });
            }

            // Clearance Init
            if (selectedRecord.clearanceData) {
                setClearanceForm(selectedRecord.clearanceData);
            } else {
                setClearanceForm({ receipts: [], payments: [] });
            }
            
            // Currency Init
            const curData = selectedRecord.currencyPurchaseData || { 
                payments: [], purchasedAmount: 0, purchasedCurrencyType: selectedRecord.mainCurrency || 'EUR', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: selectedRecord.mainCurrency || 'EUR', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: []
            };
            if (!curData.tranches) curData.tranches = [];
            setCurrencyForm(curData);
            
            setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
            setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });
            setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
            setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' });
            setNewInspectionCertificate({ part: '', company: '', certificateNumber: '', amount: 0 });
            setNewWarehouseReceipt({ number: '', part: '', issueDate: '' });
            setNewClearancePayment({ amount: 0, part: '', bank: '', date: '' });

            setShippingDocForm({ status: 'Draft', documentNumber: '', documentDate: '', attachments: [], currency: selectedRecord.mainCurrency || 'EUR', invoiceItems: [], freightCost: 0 });
            setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
        }
    }, [selectedRecord]);

    const loadRecords = async () => {
        const data = await getTradeRecords();
        setRecords(data);
    };

    const goRoot = () => { setNavLevel('ROOT'); setSelectedCompany(null); setSelectedGroup(null); setSearchTerm(''); };
    const goCompany = (company: string) => { setSelectedCompany(company); setNavLevel('COMPANY'); setSelectedGroup(null); setSearchTerm(''); };
    const goGroup = (group: string) => { setSelectedGroup(group); setNavLevel('GROUP'); setSearchTerm(''); };

    const getGroupedData = () => {
        if (navLevel === 'ROOT') {
            const companies: Record<string, number> = {};
            records.forEach(r => { const c = r.company || 'بدون شرکت'; companies[c] = (companies[c] || 0) + 1; });
            return Object.entries(companies).map(([name, count]) => ({ name, count, type: 'company' }));
        } else if (navLevel === 'COMPANY') {
            const groups: Record<string, number> = {};
            records.filter(r => (r.company || 'بدون شرکت') === selectedCompany).forEach(r => { const g = r.commodityGroup || 'سایر'; groups[g] = (groups[g] || 0) + 1; });
            return Object.entries(groups).map(([name, count]) => ({ name, count, type: 'group' }));
        }
        return [];
    };

    const getStageData = (record: TradeRecord | null, stage: TradeStage): TradeStageData => {
        if (!record || !record.stages) return { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: 'EUR', attachments: [], updatedAt: 0, updatedBy: '' };
        return record.stages[stage] || { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: 'EUR', attachments: [], updatedAt: 0, updatedBy: '' };
    };

    const handleCreateRecord = async () => { if (!newFileNumber || !newGoodsName) return; const newRecord: TradeRecord = { id: generateUUID(), company: newRecordCompany, fileNumber: newFileNumber, orderNumber: newFileNumber, goodsName: newGoodsName, sellerName: newSellerName, commodityGroup: newCommodityGroup, mainCurrency: newMainCurrency, items: [], freightCost: 0, startDate: new Date().toISOString(), status: 'Active', stages: {}, createdAt: Date.now(), createdBy: currentUser.fullName, licenseData: { transactions: [] }, shippingDocuments: [] }; STAGES.forEach(stage => { newRecord.stages[stage] = { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: newMainCurrency, attachments: [], updatedAt: Date.now(), updatedBy: '' }; }); await saveTradeRecord(newRecord); await loadRecords(); setShowNewModal(false); setNewFileNumber(''); setNewGoodsName(''); setNewSellerName(''); setNewCommodityGroup(''); setNewMainCurrency('EUR'); setSelectedRecord(newRecord); setActiveTab('proforma'); setViewMode('details'); };
    const handleDeleteRecord = async (id: string) => { if (confirm("آیا از حذف این پرونده بازرگانی اطمینان دارید؟")) { await deleteTradeRecord(id); if (selectedRecord?.id === id) setSelectedRecord(null); loadRecords(); } };
    
    const handleUpdateProforma = (field: keyof TradeRecord, value: string | number) => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, [field]: value }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddItem = async () => { if (!selectedRecord || !newItem.name) return; const item: TradeItem = { id: generateUUID(), name: newItem.name, weight: Number(newItem.weight), unitPrice: Number(newItem.unitPrice), totalPrice: Number(newItem.totalPrice) || (Number(newItem.weight) * Number(newItem.unitPrice)) }; const updatedItems = [...selectedRecord.items, item]; const updatedRecord = { ...selectedRecord, items: updatedItems }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 }); };
    const handleRemoveItem = async (id: string) => { if (!selectedRecord) return; const updatedItems = selectedRecord.items.filter(i => i.id !== id); const updatedRecord = { ...selectedRecord, items: updatedItems }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    const handleAddLicenseTx = async () => { if (!selectedRecord || !newLicenseTx.amount) return; const tx: TradeTransaction = { id: generateUUID(), date: newLicenseTx.date || '', amount: Number(newLicenseTx.amount), bank: newLicenseTx.bank || '', description: newLicenseTx.description || '' }; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = [...(currentLicenseData.transactions || []), tx]; const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; updatedRecord.stages[TradeStage.LICENSES].isCompleted = totalCost > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' }); };
    const handleRemoveLicenseTx = async (id: string) => { if (!selectedRecord) return; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = (currentLicenseData.transactions || []).filter(t => t.id !== id); const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    const handleSaveInsurance = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, insuranceData: insuranceForm }; const totalCost = (Number(insuranceForm.cost) || 0) + (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStageData(updatedRecord, TradeStage.INSURANCE); updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost; updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!insuranceForm.policyNumber; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert("اطلاعات بیمه ذخیره شد."); };
    const handleAddEndorsement = () => { 
        if (!newEndorsement.amount) return;
        const amount = endorsementType === 'increase' ? Number(newEndorsement.amount) : -Number(newEndorsement.amount);
        const endorsement: InsuranceEndorsement = { id: generateUUID(), date: newEndorsement.date || '', amount: amount, description: newEndorsement.description || '' }; 
        const updatedEndorsements = [...(insuranceForm.endorsements || []), endorsement]; 
        setInsuranceForm({ ...insuranceForm, endorsements: updatedEndorsements }); 
        setNewEndorsement({ amount: 0, description: '', date: '' });
        setEndorsementType('increase');
    };
    const handleDeleteEndorsement = (id: string) => { setInsuranceForm({ ...insuranceForm, endorsements: insuranceForm.endorsements?.filter(e => e.id !== id) }); };
    const calculateInsuranceTotal = () => { const base = Number(insuranceForm.cost) || 0; const endorsed = (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); return base + endorsed; };

    const handleAddInspectionCertificate = async () => {
        if (!selectedRecord || !newInspectionCertificate.amount) return;
        const cert: InspectionCertificate = { id: generateUUID(), part: newInspectionCertificate.part || 'Part', company: newInspectionCertificate.company || '', certificateNumber: newInspectionCertificate.certificateNumber || '', amount: Number(newInspectionCertificate.amount), description: '' };
        const updatedCertificates = [...(inspectionForm.certificates || []), cert];
        const updatedData = { ...inspectionForm, certificates: updatedCertificates };
        setInspectionForm(updatedData);
        setNewInspectionCertificate({ part: '', company: '', certificateNumber: '', amount: 0 });
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData };
        if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION);
        updatedRecord.stages[TradeStage.INSPECTION].isCompleted = updatedCertificates.length > 0;
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleDeleteInspectionCertificate = async (id: string) => {
        if (!selectedRecord) return;
        const updatedCertificates = (inspectionForm.certificates || []).filter(c => c.id !== id);
        const updatedData = { ...inspectionForm, certificates: updatedCertificates };
        setInspectionForm(updatedData);
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleAddInspectionPayment = async () => {
        if (!selectedRecord || !newInspectionPayment.amount) return;
        const payment: InspectionPayment = { id: generateUUID(), part: newInspectionPayment.part || 'Part', amount: Number(newInspectionPayment.amount), date: newInspectionPayment.date || '', bank: newInspectionPayment.bank || '', description: '' };
        const updatedPayments = [...(inspectionForm.payments || []), payment];
        const updatedData = { ...inspectionForm, payments: updatedPayments };
        setInspectionForm(updatedData);
        setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' });
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData };
        if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION);
        updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleDeleteInspectionPayment = async (id: string) => {
        if (!selectedRecord) return;
        const updatedPayments = (inspectionForm.payments || []).filter(p => p.id !== id);
        const updatedData = { ...inspectionForm, payments: updatedPayments };
        setInspectionForm(updatedData);
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData };
        if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION);
        updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    // --- Clearance & Warehouse Handlers ---
    const handleAddWarehouseReceipt = async () => {
        if (!selectedRecord || !newWarehouseReceipt.number) return;
        const receipt: WarehouseReceipt = { id: generateUUID(), number: newWarehouseReceipt.number || '', part: newWarehouseReceipt.part || '', issueDate: newWarehouseReceipt.issueDate || '' };
        const updatedReceipts = [...(clearanceForm.receipts || []), receipt];
        const updatedData = { ...clearanceForm, receipts: updatedReceipts };
        setClearanceForm(updatedData);
        setNewWarehouseReceipt({ number: '', part: '', issueDate: '' });
        const updatedRecord = { ...selectedRecord, clearanceData: updatedData };
        if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS);
        updatedRecord.stages[TradeStage.CLEARANCE_DOCS].isCompleted = updatedReceipts.length > 0;
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleDeleteWarehouseReceipt = async (id: string) => {
        if (!selectedRecord) return;
        const updatedReceipts = (clearanceForm.receipts || []).filter(r => r.id !== id);
        const updatedData = { ...clearanceForm, receipts: updatedReceipts };
        setClearanceForm(updatedData);
        const updatedRecord = { ...selectedRecord, clearanceData: updatedData };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleAddClearancePayment = async () => {
        if (!selectedRecord || !newClearancePayment.amount) return;
        const payment: ClearancePayment = { id: generateUUID(), amount: Number(newClearancePayment.amount), part: newClearancePayment.part || '', bank: newClearancePayment.bank || '', date: newClearancePayment.date || '' };
        const updatedPayments = [...(clearanceForm.payments || []), payment];
        const updatedData = { ...clearanceForm, payments: updatedPayments };
        setClearanceForm(updatedData);
        setNewClearancePayment({ amount: 0, part: '', bank: '', date: '' });
        const totalCost = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
        const updatedRecord = { ...selectedRecord, clearanceData: updatedData };
        if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS);
        updatedRecord.stages[TradeStage.CLEARANCE_DOCS].costRial = totalCost;
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleDeleteClearancePayment = async (id: string) => {
        if (!selectedRecord) return;
        const updatedPayments = (clearanceForm.payments || []).filter(p => p.id !== id);
        const updatedData = { ...clearanceForm, payments: updatedPayments };
        setClearanceForm(updatedData);
        const totalCost = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
        const updatedRecord = { ...selectedRecord, clearanceData: updatedData };
        if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS);
        updatedRecord.stages[TradeStage.CLEARANCE_DOCS].costRial = totalCost;
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleAddCurrencyTranche = async () => { if (!selectedRecord || !newCurrencyTranche.amount) return; const tranche: CurrencyTranche = { id: generateUUID(), date: newCurrencyTranche.date || '', amount: Number(newCurrencyTranche.amount), currencyType: newCurrencyTranche.currencyType || selectedRecord.mainCurrency || 'EUR', brokerName: newCurrencyTranche.brokerName || '', exchangeName: newCurrencyTranche.exchangeName || '', rate: Number(newCurrencyTranche.rate) || 0, isDelivered: newCurrencyTranche.isDelivered, deliveryDate: newCurrencyTranche.deliveryDate }; const currentTranches = currencyForm.tranches || []; const updatedTranches = [...currentTranches, tranche]; const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' }); };
    const handleUpdateTrancheDelivery = async (id: string, isDelivered: boolean, deliveryDate?: string) => { if (!selectedRecord) return; const updatedTranches = (currencyForm.tranches || []).map(t => { if (t.id === id) return { ...t, isDelivered, deliveryDate }; return t; }); const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleRemoveTranche = async (id: string) => { if (!selectedRecord) return; if (!confirm('آیا از حذف این پارت خرید ارز مطمئن هستید؟')) return; const updatedTranches = (currencyForm.tranches || []).filter(t => t.id !== id); const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); }

    const handleAddInvoiceItem = () => {
        if (!newInvoiceItem.name) return;
        const newItem: InvoiceItem = { id: generateUUID(), name: newInvoiceItem.name, weight: Number(newInvoiceItem.weight), unitPrice: Number(newInvoiceItem.unitPrice), totalPrice: Number(newInvoiceItem.totalPrice) || (Number(newInvoiceItem.weight) * Number(newInvoiceItem.unitPrice)) };
        const currentItems = shippingDocForm.invoiceItems || [];
        setShippingDocForm({ ...shippingDocForm, invoiceItems: [...currentItems, newItem] });
        setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
    };

    const handleRemoveInvoiceItem = (id: string) => { const currentItems = shippingDocForm.invoiceItems || []; setShippingDocForm({ ...shippingDocForm, invoiceItems: currentItems.filter(i => i.id !== id) }); };
    const getInvoiceTotal = (items: InvoiceItem[]) => { return items.reduce((sum, item) => sum + item.totalPrice, 0); };
    const getDocLabel = (type: ShippingDocType, field: 'number' | 'date') => { if (field === 'number') { if (type === 'Commercial Invoice') return 'شماره اینویس'; if (type === 'Packing List') return 'شماره پکینگ'; if (type === 'Bill of Lading') return 'شماره بارنامه'; if (type === 'Certificate of Origin') return 'شماره گواهی مبدا'; } if (field === 'date') { if (type === 'Commercial Invoice') return 'تاریخ اینویس'; if (type === 'Packing List') return 'تاریخ پکینگ'; if (type === 'Bill of Lading') return 'تاریخ صدور'; if (type === 'Certificate of Origin') return 'تاریخ صدور'; } return ''; };

    const handleSaveShippingDoc = async () => {
        if (!selectedRecord || !shippingDocForm.documentNumber) { alert("شماره سند الزامی است"); return; }
        let totalAmount = 0;
        if (activeShippingSubTab === 'Commercial Invoice') { const itemTotal = getInvoiceTotal(shippingDocForm.invoiceItems || []); totalAmount = itemTotal + (Number(shippingDocForm.freightCost) || 0); } else { totalAmount = Number(shippingDocForm.amount) || 0; }
        const newDoc: ShippingDocument = { id: generateUUID(), type: activeShippingSubTab, status: activeShippingSubTab === 'Commercial Invoice' ? (shippingDocForm.status as DocStatus || 'Draft') : 'Final', documentNumber: shippingDocForm.documentNumber || '', documentDate: shippingDocForm.documentDate || '', attachments: shippingDocForm.attachments || [], partNumber: shippingDocForm.partNumber, description: shippingDocForm.description, invoiceItems: activeShippingSubTab === 'Commercial Invoice' ? shippingDocForm.invoiceItems : undefined, amount: totalAmount, freightCost: activeShippingSubTab === 'Commercial Invoice' ? Number(shippingDocForm.freightCost) : undefined, currency: activeShippingSubTab === 'Commercial Invoice' ? shippingDocForm.currency : undefined, netWeight: activeShippingSubTab === 'Packing List' ? Number(shippingDocForm.netWeight) : undefined, grossWeight: activeShippingSubTab === 'Packing List' ? Number(shippingDocForm.grossWeight) : undefined, packagesCount: activeShippingSubTab === 'Packing List' ? Number(shippingDocForm.packagesCount) : undefined, chamberOfCommerce: activeShippingSubTab === 'Certificate of Origin' ? shippingDocForm.chamberOfCommerce : undefined, vesselName: activeShippingSubTab === 'Bill of Lading' ? shippingDocForm.vesselName : undefined, portOfLoading: activeShippingSubTab === 'Bill of Lading' ? shippingDocForm.portOfLoading : undefined, portOfDischarge: activeShippingSubTab === 'Bill of Lading' ? shippingDocForm.portOfDischarge : undefined, createdAt: Date.now(), createdBy: currentUser.fullName };
        const currentDocs = selectedRecord.shippingDocuments || [];
        const updatedDocs = [newDoc, ...currentDocs];
        const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs };
        if (!updatedRecord.stages[TradeStage.SHIPPING_DOCS]) updatedRecord.stages[TradeStage.SHIPPING_DOCS] = getStageData(updatedRecord, TradeStage.SHIPPING_DOCS);
        updatedRecord.stages[TradeStage.SHIPPING_DOCS].isCompleted = true; 
        updatedRecord.stages[TradeStage.SHIPPING_DOCS].updatedAt = Date.now();
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
        setShippingDocForm({ status: 'Draft', documentNumber: '', documentDate: '', attachments: [], invoiceItems: [], amount: 0, freightCost: 0, netWeight: 0, grossWeight: 0, packagesCount: 0, chamberOfCommerce: '', vesselName: '', portOfLoading: '', portOfDischarge: '', description: '', partNumber: '', currency: selectedRecord.mainCurrency || 'EUR' });
        setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
    };

    const handleDeleteShippingDoc = async (id: string) => { if (!selectedRecord) return; if (!confirm('آیا از حذف این سند مطمئن هستید؟')) return; const currentDocs = selectedRecord.shippingDocuments || []; const updatedDocs = currentDocs.filter(d => d.id !== id); const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingDocFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); const current = shippingDocForm.attachments || []; setShippingDocForm({ ...shippingDocForm, attachments: [...current, { fileName: result.fileName, url: result.url }] }); } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploadingDocFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const removeDocAttachment = (index: number) => { const current = shippingDocForm.attachments || []; setShippingDocForm({ ...shippingDocForm, attachments: current.filter((_, i) => i !== index) }); };

    const getFinalAggregation = () => { if (!selectedRecord?.shippingDocuments) return { totalAmount: 0, totalFreight: 0, finalItems: [], finalCurrency: null }; const finalInvoices = selectedRecord.shippingDocuments.filter(d => d.type === 'Commercial Invoice' && d.status === 'Final'); let totalAmount = 0; let totalFreight = 0; const itemAggregation: Record<string, { weight: number, totalPrice: number, name: string }> = {}; finalInvoices.forEach(inv => { totalAmount += (inv.amount || 0); totalFreight += (inv.freightCost || 0); if (inv.invoiceItems) { inv.invoiceItems.forEach(item => { const normalizedName = item.name.trim(); if (!itemAggregation[normalizedName]) { itemAggregation[normalizedName] = { name: item.name, weight: 0, totalPrice: 0 }; } itemAggregation[normalizedName].weight += item.weight; itemAggregation[normalizedName].totalPrice += item.totalPrice; }); } }); const aggregatedItems: InvoiceItem[] = Object.values(itemAggregation).map(agg => ({ id: generateUUID(), name: agg.name, weight: agg.weight, totalPrice: agg.totalPrice, unitPrice: agg.weight > 0 ? agg.totalPrice / agg.weight : 0 })); const finalCurrency = finalInvoices.length > 0 ? finalInvoices[0].currency : null; return { totalAmount, totalFreight, finalItems: aggregatedItems, finalCurrency }; };
    const handleUpdateFinalProforma = async () => { if (!selectedRecord) return; const { totalFreight, finalItems, finalCurrency } = getFinalAggregation(); if (finalItems.length === 0) { alert("هیچ آیتمی در اینویس‌های نهایی یافت نشد."); return; } if (confirm(`آیا مطمئن هستید؟ لیست کالاهای پرونده (پروفرما) و هزینه حمل با اطلاعات جمع‌آوری شده از اینویس‌های نهایی جایگزین می‌شود. کالاهای هم‌نام تجمیع می‌شوند.${finalCurrency ? `\nهمچنین ارز پایه پرونده به ${finalCurrency} تغییر می‌کند.` : ''}`)) { const tradeItems: TradeItem[] = finalItems.map(i => ({ id: generateUUID(), name: i.name, weight: i.weight, unitPrice: i.unitPrice, totalPrice: i.totalPrice })); const updatedRecord = { ...selectedRecord, items: tradeItems, freightCost: totalFreight, mainCurrency: finalCurrency || selectedRecord.mainCurrency }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert("پروفرما نهایی و ارز پایه با موفقیت بروزرسانی شد."); } };

    const handleOpenStage = (stage: TradeStage) => { if (!selectedRecord) return; const data = getStageData(selectedRecord, stage); setStageFormData(data); setEditingStage(stage); };
    const handleSaveStage = async () => { if (!selectedRecord || !editingStage) return; const updatedStageData: TradeStageData = { ...getStageData(selectedRecord, editingStage), ...stageFormData, updatedAt: Date.now(), updatedBy: currentUser.fullName }; const updatedStages = { ...selectedRecord.stages, [editingStage]: updatedStageData }; const updatedRecord = { ...selectedRecord, stages: updatedStages }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setEditingStage(null); };
    const handleStageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingStageFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); const currentAttachments = stageFormData.attachments || []; setStageFormData({ ...stageFormData, attachments: [...currentAttachments, { fileName: result.fileName, url: result.url }] }); } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploadingStageFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const removeStageAttachment = (index: number) => { const currentAttachments = stageFormData.attachments || []; setStageFormData({ ...stageFormData, attachments: currentAttachments.filter((_, i) => i !== index) }); };

    const getFilteredRecords = () => { const term = searchTerm.toLowerCase(); let subset = records; if (!term) { if (navLevel === 'COMPANY' && selectedCompany) { subset = records.filter(r => (r.company || 'بدون شرکت') === selectedCompany); } else if (navLevel === 'GROUP' && selectedCompany && selectedGroup) { subset = records.filter(r => (r.company || 'بدون شرکت') === selectedCompany && (r.commodityGroup || 'سایر') === selectedGroup); } else if (navLevel === 'ROOT') { return []; } } return subset.filter(r => { if (!term) return true; return r.fileNumber.toLowerCase().includes(term) || (r.registrationNumber || '').toLowerCase().includes(term) || r.sellerName.toLowerCase().includes(term) || r.goodsName?.toLowerCase().includes(term) || r.company?.toLowerCase().includes(term); }); };
    const getReportRecords = () => { const term = searchTerm.toLowerCase(); let base = records; if (term) { base = records.filter(r => r.fileNumber.toLowerCase().includes(term) || (r.registrationNumber || '').toLowerCase().includes(term) || r.sellerName.toLowerCase().includes(term) || r.goodsName?.toLowerCase().includes(term) || r.company?.toLowerCase().includes(term)); } if (reportFilterInternalCompany) { base = base.filter(r => r.company === reportFilterInternalCompany); } if (activeReport === 'inspection' && reportFilterCompany) { base = base.filter(r => (r.inspectionData?.certificates || []).some(c => c.company === reportFilterCompany)); } if (activeReport === 'insurance' && reportFilterCompany) { base = base.filter(r => r.insuranceData?.company === reportFilterCompany); } switch (activeReport) { case 'allocation_queue': return base.filter(r => r.stages[TradeStage.ALLOCATION_QUEUE]?.isCompleted === false && r.stages[TradeStage.INSURANCE]?.isCompleted === true); case 'allocated': return base.filter(r => r.stages[TradeStage.ALLOCATION_APPROVED]?.isCompleted === true); case 'shipping': return base.filter(r => r.stages[TradeStage.SHIPPING_DOCS]?.isCompleted === false && r.stages[TradeStage.CURRENCY_PURCHASE]?.isCompleted === true); case 'inspection': return base.filter(r => (r.inspectionData?.certificates || []).length > 0); case 'insurance': return base.filter(r => !!r.insuranceData?.policyNumber); default: return base; } };
    const getUniqueInspectionCompanies = () => { const companies = new Set<string>(); records.forEach(r => { (r.inspectionData?.certificates || []).forEach(c => companies.add(c.company)); }); return Array.from(companies); };
    const getUniqueInsuranceCompanies = () => { const companies = new Set<string>(); records.forEach(r => { if (r.insuranceData?.company) companies.add(r.insuranceData.company); }); return Array.from(companies); };
    const calculateDaysDiff = (dateStr?: string) => { if (!dateStr) return '-'; try { const shamsi = parsePersianDate(dateStr); if (!shamsi) return '-'; const now = new Date(); const diffTime = Math.abs(now.getTime() - shamsi.getTime()); const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); return (shamsi > now ? diffDays : -diffDays).toString(); } catch (e) { return '-'; } };
    const getCurrencyTotal = (r: TradeRecord) => { if (r.currencyPurchaseData?.purchasedAmount && r.currencyPurchaseData.purchasedAmount > 0) return r.currencyPurchaseData.purchasedAmount; return r.items.reduce((acc, i) => acc + i.totalPrice, 0); };

    const handleDownloadPDF = async () => {
        const element = document.getElementById('report-table-container');
        if (!element) return;
        setIsGeneratingPDF(true);
        try {
            const canvas = await (window as any).html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            const { jsPDF } = (window as any).jspdf;
            const pdf = new jsPDF('landscape', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`report-${activeReport}-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (e) {
            alert('خطا در تولید PDF');
        } finally {
            setIsGeneratingPDF(false);
        }
    };
    const handlePrint = () => { window.print(); };

    const ReportHeader = ({ title, icon: Icon }: { title: string, icon: any }) => ( <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 no-print gap-4"><div className="flex items-center gap-4"><div className="p-2 rounded-lg bg-blue-100 text-blue-700"><Icon size={24}/></div><div><h2 className="text-xl font-bold text-gray-800">{title}</h2><p className="text-xs text-gray-500 mt-1">گزارش‌گیری، چاپ و خروجی</p></div></div><div className="flex gap-2 flex-wrap"><button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="flex items-center gap-2 px-3 py-2 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100"><FileDown size={16}/> {isGeneratingPDF ? '...' : 'PDF'}</button><button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"><Printer size={16}/> چاپ</button><button onClick={() => setViewMode('dashboard')} className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"><ArrowRight size={16}/> بازگشت</button></div></div> );

    if (viewMode === 'reports') {
        const reportData = getReportRecords();
        return (
            <div className="flex flex-col md:flex-row md:h-[calc(100vh-100px)] animate-fade-in bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                <div className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-l p-4 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-y-auto no-print">
                    <div className="mb-4 font-bold text-gray-700 px-2 hidden md:block">مرکز گزارشات</div>
                    <button onClick={() => { setActiveReport('general'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors whitespace-nowrap ${activeReport === 'general' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><ListFilter size={18}/> گزارش جامع</button>
                    <button onClick={() => { setActiveReport('allocation_queue'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors whitespace-nowrap ${activeReport === 'allocation_queue' ? 'bg-purple-50 text-purple-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><History size={18}/> در صف تخصیص</button>
                    <button onClick={() => { setActiveReport('allocated'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors whitespace-nowrap ${activeReport === 'allocated' ? 'bg-green-50 text-green-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><CheckCircle2 size={18}/> تخصیص یافته</button>
                    <button onClick={() => { setActiveReport('currency'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors whitespace-nowrap ${activeReport === 'currency' ? 'bg-amber-50 text-amber-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Coins size={18}/> خرید ارز</button>
                    <button onClick={() => { setActiveReport('insurance'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors whitespace-nowrap ${activeReport === 'insurance' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Shield size={18}/> گزارش بیمه</button>
                    <button onClick={() => { setActiveReport('inspection'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors whitespace-nowrap ${activeReport === 'inspection' ? 'bg-rose-50 text-rose-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Microscope size={18}/> گزارش بازرسی</button>
                    <button onClick={() => { setActiveReport('shipping'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors whitespace-nowrap ${activeReport === 'shipping' ? 'bg-cyan-50 text-cyan-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Container size={18}/> در حال حمل</button>
                    <div className="mt-auto pt-4 border-t md:block"><button onClick={() => setViewMode('dashboard')} className="w-full p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center gap-2 text-sm whitespace-nowrap"><Home size={16}/> بازگشت به داشبورد</button></div>
                </div>
                <div className="flex-1 p-4 md:p-8 overflow-y-auto">
                    <ReportHeader title={activeReport === 'general' ? 'گزارش جامع' : activeReport === 'inspection' ? 'گزارش گواهی بازرسی و مغایرت' : 'گزارش'} icon={activeReport === 'inspection' ? Microscope : FileSpreadsheet} />
                    <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 flex flex-wrap items-center gap-4 no-print">
                        <div className="flex flex-col gap-1 w-full md:w-auto"><label className="text-xs font-bold text-gray-700">شرکت داخلی (ما):</label><select className="border rounded-lg p-2 text-sm w-full md:min-w-[200px]" value={reportFilterInternalCompany} onChange={e => setReportFilterInternalCompany(e.target.value)}><option value="">همه شرکت‌ها</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        {activeReport === 'inspection' && (<div className="flex flex-col gap-1 w-full md:w-auto"><label className="text-xs font-bold text-gray-700">شرکت بازرسی (طرف حساب):</label><select className="border rounded-lg p-2 text-sm w-full md:min-w-[200px]" value={reportFilterCompany} onChange={e => setReportFilterCompany(e.target.value)}><option value="">همه شرکت‌ها</option>{getUniqueInspectionCompanies().map(c => <option key={c} value={c}>{c}</option>)}</select></div>)}
                         {activeReport === 'insurance' && (<div className="flex flex-col gap-1 w-full md:w-auto"><label className="text-xs font-bold text-gray-700">شرکت بیمه (طرف حساب):</label><select className="border rounded-lg p-2 text-sm w-full md:min-w-[200px]" value={reportFilterCompany} onChange={e => setReportFilterCompany(e.target.value)}><option value="">همه شرکت‌ها</option>{getUniqueInsuranceCompanies().map(c => <option key={c} value={c}>{c}</option>)}</select></div>)}
                        {(reportFilterCompany || reportFilterInternalCompany) && <button onClick={() => { setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className="text-xs text-red-500 hover:underline mt-2 md:mt-5 bg-red-50 px-3 py-2 rounded-lg">حذف فیلترها</button>}
                    </div>
                    <div id="report-table-container" className="bg-white p-4 md:p-6 rounded-xl border shadow-sm print:shadow-none print:border-none print:p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse min-w-[800px]">
                                <thead className="bg-gray-800 text-white font-bold text-xs print:bg-gray-200 print:text-black">
                                    {activeReport === 'general' && (<tr><th className="p-3">پرونده</th><th className="p-3">کالا</th><th className="p-3">فروشنده</th><th className="p-3">شرکت داخلی</th><th className="p-3 text-center">وضعیت</th></tr>)}
                                    {activeReport === 'allocation_queue' && (<tr><th className="p-3">پرونده</th><th className="p-3">ثبت سفارش</th><th className="p-3">مبلغ ارزی</th><th className="p-3">بانک عامل</th><th className="p-3">تاریخ ورود به صف</th><th className="p-3">تعداد روز در صف</th><th className="p-3">نرخ ارز (تخمینی)</th><th className="p-3">معادل ریالی</th></tr>)}
                                    {activeReport === 'allocated' && (<tr><th className="p-3">پرونده</th><th className="p-3">ثبت سفارش</th><th className="p-3">مبلغ ارزی</th><th className="p-3">بانک</th><th className="p-3">تاریخ تخصیص</th><th className="p-3">مهلت انقضا</th><th className="p-3">مانده (روز)</th><th className="p-3">کد تخصیص</th></tr>)}
                                    {activeReport === 'currency' && (<tr><th className="p-3 w-48">پرونده / ثبت سفارش</th><th className="p-3 text-center">مبلغ</th><th className="p-3 text-center">ارز</th><th className="p-3 text-center">نرخ ریالی</th><th className="p-3 text-center">معادل ریالی</th><th className="p-3">کارگزار/صرافی</th><th className="p-3">تاریخ خرید</th><th className="p-3 text-center">وضعیت تحویل</th></tr>)}
                                    {activeReport === 'insurance' && (<tr><th className="p-3">پرونده / شرکت داخلی</th><th className="p-3">بیمه‌نامه / شرکت</th><th className="p-3 text-center">هزینه‌ها (قرارداد + الحاقیه)</th><th className="p-3 text-center">مانده تعهد (خالص)</th></tr>)}
                                    {activeReport === 'inspection' && (<tr><th className="p-3">پرونده / شرکت داخلی</th><th className="p-3">شرکت بازرسی</th><th className="p-3">شماره گواهی / پارت‌ها</th><th className="p-3">مبلغ قرارداد (بستانکار)</th><th className="p-3">پرداخت‌ها (بدهکار)</th><th className="p-3 text-center">مانده (تراز)</th></tr>)}
                                </thead>
                                <tbody className="divide-y divide-gray-200 print:divide-gray-400">
                                    {reportData.map(r => (
                                        <React.Fragment key={r.id}>
                                            {activeReport === 'general' && (<tr className="hover:bg-gray-50"><td className="p-3 font-bold">{r.fileNumber}</td><td className="p-3">{r.goodsName}</td><td className="p-3">{r.sellerName}</td><td className="p-3">{r.company}</td><td className="p-3 text-center">{r.status}</td></tr>)}
                                            {activeReport === 'inspection' && (<tr className="hover:bg-rose-50/20 valign-top"><td className="p-3 font-bold border-l">{r.fileNumber}<div className="text-xs font-normal text-gray-500 mt-1">{r.company}</div></td><td className="p-3">{(r.inspectionData?.certificates || []).map(c => c.company).filter((v, i, a) => a.indexOf(v) === i).join(', ') || '-'}</td><td className="p-3 font-mono text-xs">{(r.inspectionData?.certificates || []).map(c => (<div key={c.id} className="border-b border-dashed border-gray-300 pb-1 mb-1 last:border-0 last:mb-0"><span className="font-bold">{c.part}:</span> {c.certificateNumber}</div>))}{(r.inspectionData?.certificates || []).length === 0 && '-'}</td><td className="p-3 font-mono dir-ltr font-bold text-gray-700 bg-red-50/50">{formatCurrency((r.inspectionData?.certificates || []).reduce((acc, c) => acc + c.amount, 0))}{(r.inspectionData?.certificates || []).length > 0 && (<div className="text-[10px] text-gray-400 font-normal mt-1">جمع کل قراردادها</div>)}</td><td className="p-3 bg-green-50/50"><div className="font-bold font-mono dir-ltr text-green-700">{formatCurrency((r.inspectionData?.payments || []).reduce((acc, p) => acc + p.amount, 0))}</div>{(r.inspectionData?.payments || []).length > 0 && (<div className="text-[10px] text-gray-500 mt-1 space-y-1">{r.inspectionData?.payments.map(p => (<div key={p.id} className="flex justify-between border-b border-gray-100 pb-0.5"><span>{p.part}</span><span>{formatCurrency(p.amount)}</span></div>))}</div>)}</td><td className="p-3 dir-ltr text-center font-mono font-black">{(() => { const totalDue = (r.inspectionData?.certificates || []).reduce((acc, c) => acc + c.amount, 0); const totalPaid = (r.inspectionData?.payments || []).reduce((acc, p) => acc + p.amount, 0); const balance = totalDue - totalPaid; return (<span className={balance > 0 ? "text-red-600" : balance < 0 ? "text-green-600" : "text-gray-400"}>{balance === 0 ? 'تسویه شده' : formatCurrency(balance)}</span>); })()}</td></tr>)}
                                            {activeReport === 'insurance' && r.insuranceData?.policyNumber && (<tr className="hover:bg-purple-50/20 valign-top"><td className="p-3 font-bold border-l">{r.fileNumber}<div className="text-xs font-normal text-gray-500 mt-1">{r.company}</div></td><td className="p-3"><div className="font-bold text-gray-800">{r.insuranceData.policyNumber}</div><div className="text-xs text-gray-500">{r.insuranceData.company}</div></td><td className="p-3 font-mono text-xs bg-gray-50/50"><div className="flex justify-between items-center border-b border-gray-200 pb-1 mb-1"><span>اصل قرارداد:</span><span className="font-bold text-red-600">{formatCurrency(r.insuranceData.cost)}</span></div>{(r.insuranceData.endorsements || []).map(e => (<div key={e.id} className="flex justify-between items-center border-b border-dashed border-gray-200 pb-1 mb-1 last:border-0 last:mb-0"><span className="truncate max-w-[100px]">{e.description || 'الحاقیه'}:</span><span className={e.amount >= 0 ? "text-red-600" : "text-green-600"}>{formatCurrency(Math.abs(e.amount))} {e.amount >= 0 ? '+' : '-'}</span></div>))}</td><td className="p-3 dir-ltr text-center font-mono font-bold text-lg">{(() => { const total = (r.insuranceData.cost || 0) + (r.insuranceData.endorsements || []).reduce((acc, e) => acc + e.amount, 0); return <span className="text-purple-800">{formatCurrency(total)}</span> })()}</td></tr>)}
                                            {activeReport === 'allocation_queue' && (<tr className="hover:bg-gray-50"><td className="p-3 font-bold">{r.fileNumber}</td><td className="p-3">{r.registrationNumber || '-'}</td><td className="p-3 font-mono dir-ltr">{formatNumberString(getCurrencyTotal(r).toString())} {r.mainCurrency}</td><td className="p-3">{r.operatingBank || '-'}</td><td className="p-3 dir-ltr text-right">{r.stages[TradeStage.ALLOCATION_QUEUE]?.queueDate || '-'}</td><td className="p-3 font-bold text-amber-600 text-center">{calculateDaysDiff(r.stages[TradeStage.ALLOCATION_QUEUE]?.queueDate)} روز</td><td className="p-3 font-mono dir-ltr">{formatCurrency(r.stages[TradeStage.ALLOCATION_QUEUE]?.currencyRate || 0)}</td><td className="p-3 font-mono dir-ltr font-bold">{formatCurrency((r.stages[TradeStage.ALLOCATION_QUEUE]?.currencyRate || 0) * getCurrencyTotal(r))}</td></tr>)}
                                            {activeReport === 'allocated' && (<tr className="hover:bg-gray-50"><td className="p-3 font-bold">{r.fileNumber}</td><td className="p-3">{r.registrationNumber || '-'}</td><td className="p-3 font-mono dir-ltr">{formatNumberString(getCurrencyTotal(r).toString())} {r.mainCurrency}</td><td className="p-3">{r.operatingBank || '-'}</td><td className="p-3 dir-ltr text-right">{r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationDate || '-'}</td><td className="p-3 dir-ltr text-right">{r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationExpiry || '-'}</td><td className={`p-3 font-bold text-center ${Number(calculateDaysDiff(r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationExpiry)) > 10 ? 'text-green-600' : 'text-red-500'}`}>{calculateDaysDiff(r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationExpiry)}</td><td className="p-3">{r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationCode || '-'}</td></tr>)}
                                            {activeReport === 'currency' && (<>{(r.currencyPurchaseData?.tranches || []).length === 0 ? (<tr className="bg-gray-50/50"><td className="p-3 font-bold">{r.fileNumber}</td><td colSpan={7} className="p-3 text-center text-gray-400 italic">بدون خرید ارز</td></tr>) : ((r.currencyPurchaseData?.tranches || []).map((t, i) => (<tr key={`${r.id}-${i}`} className="hover:bg-blue-50/20">{i === 0 && <td rowSpan={(r.currencyPurchaseData?.tranches || []).length} className="p-3 font-bold border-l align-top bg-white">{r.fileNumber}<div className="text-xs font-normal text-gray-500 mt-1">{r.registrationNumber}</div></td>}<td className="p-3 text-center font-mono dir-ltr">{formatNumberString(t.amount.toString())}</td><td className="p-3 text-center">{t.currencyType}</td><td className="p-3 text-center font-mono">{formatCurrency(t.rate || 0)}</td><td className="p-3 text-center font-mono font-bold text-gray-700">{formatCurrency((t.rate || 0) * t.amount)}</td><td className="p-3">{t.exchangeName} / {t.brokerName}</td><td className="p-3">{t.date}</td><td className="p-3 text-center"><span className={`px-2 py-1 rounded text-xs ${t.isDelivered ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.isDelivered ? `تحویل شده: ${t.deliveryDate}` : 'تحویل نشده'}</span></td></tr>)))}</>)}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (viewMode === 'details' && selectedRecord) {
        return (
            <div className="space-y-6 animate-fade-in bg-white rounded-2xl shadow-sm border border-gray-200 min-h-screen flex flex-col">
                <div className="bg-gradient-to-l from-blue-600 to-blue-800 text-white p-6 rounded-t-2xl shadow-lg relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2 opacity-90"><Building2 size={16}/><span className="text-sm">{selectedRecord.company}</span><span className="w-1 h-1 bg-white rounded-full"></span><span className="text-sm opacity-80">{selectedRecord.commodityGroup}</span></div>
                            <h1 className="text-2xl md:text-3xl font-bold mb-2 flex flex-wrap items-center gap-3">{selectedRecord.fileNumber} <span className="text-sm font-normal bg-white/20 px-2 py-1 rounded border border-white/20">وضعیت: {selectedRecord.status}</span></h1>
                            <p className="text-blue-100 text-sm opacity-90">{selectedRecord.goodsName} | فروشنده: {selectedRecord.sellerName}</p>
                        </div>
                        <div className="flex gap-2 self-end md:self-start">
                            <button onClick={() => handleDeleteRecord(selectedRecord.id)} className="p-2 bg-white/10 hover:bg-red-500 hover:text-white rounded-lg transition-colors text-white/80" title="حذف پرونده"><Trash2 size={20}/></button>
                            <button onClick={() => { setViewMode('dashboard'); setSelectedRecord(null); }} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-white"><X size={20}/></button>
                        </div>
                    </div>
                </div>

                <div className="px-6 border-b flex gap-6 overflow-x-auto no-scrollbar">
                    <button onClick={() => setActiveTab('timeline')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'timeline' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>مراحل و تایم‌لاین</button>
                    <button onClick={() => setActiveTab('proforma')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'proforma' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>پروفرما و مجوزها</button>
                    <button onClick={() => setActiveTab('insurance')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'insurance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>بیمه باربری</button>
                    <button onClick={() => setActiveTab('currency_purchase')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'currency_purchase' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>خرید و تخصیص ارز</button>
                    <button onClick={() => setActiveTab('shipping_docs')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'shipping_docs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>اسناد حمل</button>
                    <button onClick={() => setActiveTab('inspection')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'inspection' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>بازرسی</button>
                    <button onClick={() => setActiveTab('clearance')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'clearance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>ترخیصیه و قبض انبار</button>
                </div>

                <div className="p-4 md:p-6 flex-1 bg-gray-50">
                    
                    {activeTab === 'clearance' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Warehouse className="text-orange-600"/> لیست قبض انبار</h3>
                                <div className="bg-gray-50 p-4 rounded-xl border mb-4">
                                    <div className="grid grid-cols-1 gap-2 mb-2">
                                        <div className="flex gap-2">
                                            <input className="flex-1 border rounded-lg p-2 bg-white text-sm" value={newWarehouseReceipt.number} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, number: e.target.value})} placeholder="شماره قبض انبار" />
                                            <input className="flex-1 border rounded-lg p-2 bg-white text-sm" value={newWarehouseReceipt.part} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, part: e.target.value})} placeholder="پارت" />
                                        </div>
                                        <input type="text" className="w-full border rounded-lg p-2 bg-white text-sm dir-ltr text-right" value={newWarehouseReceipt.issueDate} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, issueDate: e.target.value})} placeholder="تاریخ صدور (YYYY/MM/DD)" />
                                        <button onClick={handleAddWarehouseReceipt} disabled={!newWarehouseReceipt.number} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 text-sm">افزودن قبض انبار</button>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {(clearanceForm.receipts || []).map(r => (
                                        <div key={r.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border hover:bg-white transition-colors">
                                            <div>
                                                <div className="font-bold text-sm text-gray-800">شماره: {r.number}</div>
                                                <div className="text-xs text-gray-500">پارت: {r.part} | تاریخ: {r.issueDate}</div>
                                            </div>
                                            <button onClick={() => handleDeleteWarehouseReceipt(r.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                    {(clearanceForm.receipts || []).length === 0 && <div className="text-center text-gray-400 text-sm py-4">هنوز قبض انباری ثبت نشده است.</div>}
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center justify-between"><span className="flex items-center gap-2"><Banknote className="text-green-600"/> هزینه‌های ترخیصیه</span></h3>
                                <div className="bg-gray-50 p-4 rounded-xl border mb-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                        <input className="border rounded p-2 text-sm" placeholder="عنوان هزینه / پارت" value={newClearancePayment.part} onChange={e => setNewClearancePayment({...newClearancePayment, part: e.target.value})} />
                                        <input className="border rounded p-2 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newClearancePayment.amount?.toString())} onChange={e => setNewClearancePayment({...newClearancePayment, amount: deformatNumberString(e.target.value)})} />
                                        <select className="border rounded p-2 text-sm bg-white" value={newClearancePayment.bank} onChange={e => setNewClearancePayment({...newClearancePayment, bank: e.target.value})}><option value="">بانک پرداخت کننده...</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select>
                                        <div className="flex gap-2"><input className="border rounded p-2 text-sm flex-1 dir-ltr text-right" placeholder="تاریخ پرداخت" value={newClearancePayment.date} onChange={e => setNewClearancePayment({...newClearancePayment, date: e.target.value})} /><button onClick={handleAddClearancePayment} disabled={!newClearancePayment.amount} className="bg-green-600 text-white px-3 rounded text-sm hover:bg-green-700"><Plus/></button></div>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {(clearanceForm.payments || []).map(p => (
                                        <div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border hover:bg-white transition-colors">
                                            <div><div className="font-bold text-sm text-gray-800">{p.part}</div><div className="text-xs text-gray-500">{p.date} - {p.bank}</div></div>
                                            <div className="flex items-center gap-3"><span className="font-mono font-bold text-gray-700 dir-ltr">{formatCurrency(p.amount)}</span><button onClick={() => handleDeleteClearancePayment(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div>
                                        </div>
                                    ))}
                                    {(clearanceForm.payments || []).length === 0 && <div className="text-center text-gray-400 text-sm py-4">هنوز هزینه‌ای ثبت نشده است.</div>}
                                </div>
                                <div className="mt-6 pt-4 border-t space-y-2">
                                    <div className="flex justify-between text-base"><span className="font-bold text-gray-800">جمع کل هزینه‌های ترخیصیه:</span><span className="font-black font-mono dir-ltr text-blue-700">{formatCurrency((clearanceForm.payments || []).reduce((acc, p) => acc + p.amount, 0))}</span></div>
                                    <p className="text-xs text-gray-500 mt-2">* این مبلغ به صورت خودکار در مرحله "ترخیصیه و قبض انبار" در تایم‌لاین ثبت می‌شود.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'inspection' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Microscope className="text-rose-600"/> مشخصات گواهی‌های بازرسی (بستانکار)</h3>
                                <div className="bg-gray-50 p-4 rounded-xl border mb-4"><h4 className="font-bold text-sm mb-3">افزودن پارت گواهی</h4><div className="grid grid-cols-1 gap-2 mb-2"><input className="w-full border rounded-lg p-2 bg-white" value={newInspectionCertificate.company} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, company: e.target.value})} placeholder="نام شرکت بازرسی" /><div className="flex gap-2"><input className="flex-1 border rounded-lg p-2 bg-white" value={newInspectionCertificate.part} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, part: e.target.value})} placeholder="عنوان (مثلا اصل گواهی)" /><input className="flex-1 border rounded-lg p-2 bg-white" value={newInspectionCertificate.certificateNumber} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, certificateNumber: e.target.value})} placeholder="شماره گواهی" /></div><input className="w-full border rounded-lg p-2 bg-white font-mono dir-ltr" value={formatNumberString(newInspectionCertificate.amount?.toString() || '')} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, amount: deformatNumberString(e.target.value)})} placeholder="مبلغ (ریال)" /><button onClick={handleAddInspectionCertificate} disabled={!newInspectionCertificate.amount} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">افزودن گواهی</button></div></div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">{(inspectionForm.certificates || []).map(c => (<div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border hover:bg-white transition-colors"><div><div className="font-bold text-sm text-gray-800">{c.part}</div><div className="text-xs text-gray-500">{c.company} - {c.certificateNumber}</div></div><div className="flex items-center gap-3"><span className="font-mono font-bold text-gray-700 dir-ltr">{formatCurrency(c.amount)}</span><button onClick={() => handleDeleteInspectionCertificate(c.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div></div>))}{(inspectionForm.certificates || []).length === 0 && <div className="text-center text-gray-400 text-sm py-4">هنوز گواهی ثبت نشده است.</div>}</div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center justify-between"><span className="flex items-center gap-2"><ListFilter className="text-gray-600"/> لیست پرداخت‌ها (بدهکار)</span></h3>
                                <div className="bg-gray-50 p-4 rounded-xl border mb-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2"><input className="border rounded p-2 text-sm" placeholder="عنوان پارت (مثلا پیش‌پرداخت)" value={newInspectionPayment.part} onChange={e => setNewInspectionPayment({...newInspectionPayment, part: e.target.value})} /><input className="border rounded p-2 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newInspectionPayment.amount?.toString())} onChange={e => setNewInspectionPayment({...newInspectionPayment, amount: deformatNumberString(e.target.value)})} /><input className="border rounded p-2 text-sm" placeholder="نام بانک" value={newInspectionPayment.bank} onChange={e => setNewInspectionPayment({...newInspectionPayment, bank: e.target.value})} /><div className="flex gap-2"><input type="date" className="border rounded p-2 text-sm flex-1" value={newInspectionPayment.date} onChange={e => setNewInspectionPayment({...newInspectionPayment, date: e.target.value})} /><button onClick={handleAddInspectionPayment} disabled={!newInspectionPayment.amount} className="bg-green-600 text-white px-3 rounded text-sm hover:bg-green-700"><Plus/></button></div></div></div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">{(inspectionForm.payments || []).map(p => (<div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border hover:bg-white transition-colors"><div><div className="font-bold text-sm text-gray-800">{p.part}</div><div className="text-xs text-gray-500">{p.date} - {p.bank}</div></div><div className="flex items-center gap-3"><span className="font-mono font-bold text-gray-700 dir-ltr">{formatCurrency(p.amount)}</span><button onClick={() => handleDeleteInspectionPayment(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div></div>))}{(inspectionForm.payments || []).length === 0 && <div className="text-center text-gray-400 text-sm py-4">هنوز پرداختی ثبت نشده است.</div>}</div>
                                <div className="mt-6 pt-4 border-t space-y-2"><div className="flex justify-between text-sm"><span className="text-gray-500">جمع کل قراردادها:</span><span className="font-bold font-mono dir-ltr text-red-600">{formatCurrency((inspectionForm.certificates || []).reduce((acc, c) => acc + c.amount, 0))}</span></div><div className="flex justify-between text-sm"><span className="text-gray-500">جمع کل پرداختی‌ها:</span><span className="font-bold font-mono dir-ltr text-green-600">{formatCurrency((inspectionForm.payments || []).reduce((acc, p) => acc + p.amount, 0))}</span></div><div className="flex justify-between text-base border-t pt-2 mt-2"><span className="font-bold text-gray-800">مانده حساب:</span>{(() => { const balance = ((inspectionForm.certificates || []).reduce((acc, c) => acc + c.amount, 0)) - ((inspectionForm.payments || []).reduce((acc, p) => acc + p.amount, 0)); return <span className={`font-black font-mono dir-ltr ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{balance === 0 ? 'تسویه' : formatCurrency(balance)}</span>; })()}</div></div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'timeline' && (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            <div className="lg:col-span-3 space-y-4">
                                {STAGES.map((stageName, idx) => {
                                    const stageInfo = getStageData(selectedRecord, stageName);
                                    const isDone = stageInfo.isCompleted;
                                    const hasAttachments = stageInfo.attachments && stageInfo.attachments.length > 0;
                                    return (
                                        <div key={idx} className={`relative pl-8 border-l-2 ${isDone ? 'border-blue-500' : 'border-gray-200'} pb-8 last:pb-0 group`}>
                                            <div onClick={() => handleOpenStage(stageName)} className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 cursor-pointer transition-colors ${isDone ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300 group-hover:border-blue-400'}`}></div>
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleOpenStage(stageName)}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className={`font-bold text-lg ${isDone ? 'text-blue-700' : 'text-gray-600'}`}>{stageName}</h3>
                                                    <div className="flex gap-2">
                                                        {hasAttachments && <Paperclip size={18} className="text-gray-400" />}
                                                        {isDone && <CheckCircle2 className="text-green-500" size={20} />}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 text-sm text-gray-500">
                                                    {stageInfo.updatedAt > 0 && <span>آخرین بروزرسانی: {new Date(stageInfo.updatedAt).toLocaleDateString('fa-IR')}</span>}
                                                    {(stageInfo.costRial > 0 || stageInfo.costCurrency > 0) && (
                                                        <span className="flex items-center gap-1 text-gray-700 font-medium bg-gray-100 px-2 rounded w-fit"><Wallet size={12}/> هزینه: {formatCurrency(stageInfo.costRial)} {stageInfo.costCurrency > 0 && `/ ${stageInfo.costCurrency} ${stageInfo.currencyType}`}</span>
                                                    )}
                                                    {stageInfo.description && <span className="truncate max-w-[200px] italic">"{stageInfo.description}"</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="space-y-4">
                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><Calculator size={18}/> خلاصه هزینه‌ها</h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between"><span>ثبت سفارش (مجوز):</span><span className="font-mono">{formatCurrency(selectedRecord.stages[TradeStage.LICENSES]?.costRial || 0)}</span></div>
                                        <div className="flex justify-between"><span>بیمه:</span><span className="font-mono">{formatCurrency(selectedRecord.stages[TradeStage.INSURANCE]?.costRial || 0)}</span></div>
                                        <div className="flex justify-between"><span>بازرسی:</span><span className="font-mono">{formatCurrency(selectedRecord.stages[TradeStage.INSPECTION]?.costRial || 0)}</span></div>
                                        <div className="flex justify-between"><span>ترخیصیه:</span><span className="font-mono">{formatCurrency(selectedRecord.stages[TradeStage.CLEARANCE_DOCS]?.costRial || 0)}</span></div>
                                        <div className="flex justify-between border-t pt-2 font-bold bg-blue-50 p-2 rounded"><span>جمع کل ریالی:</span><span className="font-mono">{formatCurrency(STAGES.reduce((acc, s) => acc + (selectedRecord.stages[s]?.costRial || 0), 0))}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'proforma' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FileText className="text-blue-600"/> اطلاعات پایه و اقلام</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6"><div><label className="text-xs font-bold text-gray-500 block mb-1">شماره ثبت سفارش</label><input className="w-full border rounded-lg p-2 bg-gray-50" value={selectedRecord.registrationNumber || ''} onChange={e => handleUpdateProforma('registrationNumber', e.target.value)} /></div><div><label className="text-xs font-bold text-gray-500 block mb-1">تاریخ صدور</label><input className="w-full border rounded-lg p-2 bg-gray-50 dir-ltr text-right" placeholder="1403/01/01" value={selectedRecord.registrationDate || ''} onChange={e => handleUpdateProforma('registrationDate', e.target.value)} /></div><div><label className="text-xs font-bold text-gray-500 block mb-1">مهلت انقضا</label><input className="w-full border rounded-lg p-2 bg-gray-50 dir-ltr text-right" placeholder="1403/06/01" value={selectedRecord.registrationExpiry || ''} onChange={e => handleUpdateProforma('registrationExpiry', e.target.value)} /></div><div><label className="text-xs font-bold text-gray-500 block mb-1">بانک عامل</label><select className="w-full border rounded-lg p-2 bg-gray-50" value={selectedRecord.operatingBank || ''} onChange={e => handleUpdateProforma('operatingBank', e.target.value)}><option value="">انتخاب...</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div></div>
                                    <div className="bg-gray-50 p-4 rounded-xl border mb-4"><h4 className="font-bold text-sm mb-3">افزودن کالا به لیست</h4><div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end"><div className="col-span-2"><input className="w-full border rounded p-2 text-sm" placeholder="نام کالا" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></div><div><input className="w-full border rounded p-2 text-sm" placeholder="وزن (KG)" type="number" value={newItem.weight || ''} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})} /></div><div><input className="w-full border rounded p-2 text-sm" placeholder={`قیمت (${selectedRecord.mainCurrency})`} type="number" value={newItem.unitPrice || ''} onChange={e => setNewItem({...newItem, unitPrice: Number(e.target.value)})} /></div><button onClick={handleAddItem} className="col-span-2 md:col-span-1 bg-blue-600 text-white p-2 rounded text-sm hover:bg-blue-700">افزودن</button></div></div>
                                    <div className="overflow-x-auto"><table className="w-full text-sm text-right border-collapse min-w-[500px]"><thead className="bg-gray-100 text-gray-600"><tr><th className="p-2 border">ردیف</th><th className="p-2 border">شرح کالا</th><th className="p-2 border">وزن (KG)</th><th className="p-2 border">فی ({selectedRecord.mainCurrency})</th><th className="p-2 border">کل</th><th className="p-2 border">حذف</th></tr></thead><tbody>{selectedRecord.items.map((item, idx) => (<tr key={item.id} className="hover:bg-gray-50"><td className="p-2 border text-center">{idx + 1}</td><td className="p-2 border font-medium">{item.name}</td><td className="p-2 border dir-ltr font-mono">{formatNumberString(item.weight.toString())}</td><td className="p-2 border dir-ltr font-mono">{formatNumberString(item.unitPrice.toString())}</td><td className="p-2 border dir-ltr font-mono font-bold">{formatNumberString(item.totalPrice.toString())}</td><td className="p-2 border text-center"><button onClick={() => handleRemoveItem(item.id)} className="text-red-500"><X size={16}/></button></td></tr>))}<tr className="bg-blue-50 font-bold"><td colSpan={2} className="p-2 border text-center">جمع کل (FOB)</td><td className="p-2 border dir-ltr font-mono">{formatNumberString(selectedRecord.items.reduce((a, b) => a + b.weight, 0).toString())}</td><td className="p-2 border"></td><td className="p-2 border dir-ltr font-mono text-blue-700">{formatNumberString(selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0).toString())}</td><td></td></tr></tbody></table></div>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm"><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Calculator className="text-gray-600"/> محاسبات مالی</h3><div className="space-y-4"><div className="flex justify-between items-center"><span className="text-sm text-gray-600">ارزش کالا (FOB):</span><span className="font-mono font-bold dir-ltr">{formatNumberString(selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0).toString())} {selectedRecord.mainCurrency}</span></div><div className="flex justify-between items-center"><span className="text-sm text-gray-600">هزینه حمل (Freight):</span><input className="w-24 border rounded p-1 text-sm dir-ltr" value={selectedRecord.freightCost || 0} onChange={e => handleUpdateProforma('freightCost', Number(e.target.value))} /></div><div className="border-t pt-2 flex justify-between items-center"><span className="text-sm font-bold text-gray-800">ارزش کل (CFR):</span><span className="font-mono font-black text-blue-700 dir-ltr">{formatNumberString((selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0) + (selectedRecord.freightCost || 0)).toString())} {selectedRecord.mainCurrency}</span></div></div></div>
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm"><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Banknote className="text-green-600"/> هزینه‌های مجوز (ریالی)</h3><div className="bg-gray-50 p-3 rounded-lg border mb-3 space-y-2"><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newLicenseTx.amount?.toString())} onChange={e => setNewLicenseTx({...newLicenseTx, amount: deformatNumberString(e.target.value)})} /><div className="flex gap-1"><input className="flex-1 border rounded p-1.5 text-sm" placeholder="بابت (مثلا کارمزد ثبت)" value={newLicenseTx.description} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})} /><button onClick={handleAddLicenseTx} disabled={!newLicenseTx.amount} className="bg-green-600 text-white px-3 rounded text-sm hover:bg-green-700"><Plus size={16}/></button></div></div><div className="space-y-1 max-h-40 overflow-y-auto">{(selectedRecord.licenseData?.transactions || []).map(tx => (<div key={tx.id} className="text-xs flex justify-between bg-gray-50 p-2 rounded border"><span>{tx.description}</span><div className="flex gap-2 items-center"><span className="font-mono font-bold">{formatCurrency(tx.amount)}</span><button onClick={() => handleRemoveLicenseTx(tx.id)} className="text-red-500"><X size={12}/></button></div></div>))}</div></div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'insurance' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm"><h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Shield className="text-indigo-600"/> مشخصات بیمه‌نامه (هزینه اصلی)</h3><div className="space-y-4"><div><label className="text-xs font-bold text-gray-500 block mb-1">شماره بیمه‌نامه</label><input className="w-full border rounded-lg p-2 bg-gray-50" value={insuranceForm.policyNumber} onChange={e => setInsuranceForm({...insuranceForm, policyNumber: e.target.value})} /></div><div><label className="text-xs font-bold text-gray-500 block mb-1">شرکت بیمه</label><input className="w-full border rounded-lg p-2 bg-gray-50" value={insuranceForm.company} onChange={e => setInsuranceForm({...insuranceForm, company: e.target.value})} /></div><div><label className="text-xs font-bold text-gray-500 block mb-1">هزینه پایه قرارداد (ریال)</label><input className="w-full border rounded-lg p-2 bg-gray-50 font-mono dir-ltr" value={formatNumberString(insuranceForm.cost.toString())} onChange={e => setInsuranceForm({...insuranceForm, cost: deformatNumberString(e.target.value)})} /></div><button onClick={handleSaveInsurance} className="w-full bg-blue-600 text-white py-2 rounded-lg mt-4 hover:bg-blue-700">ذخیره اطلاعات پایه</button></div></div>
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm"><h3 className="font-bold text-gray-800 mb-6 flex items-center justify-between"><span>الحاقیه‌ها (افزایش/کاهش)</span><span className="text-sm bg-indigo-50 text-indigo-700 px-2 py-1 rounded">جمع کل نهایی: {formatCurrency(calculateInsuranceTotal())}</span></h3><div className="bg-gray-50 p-3 rounded-lg border mb-4"><div className="flex gap-2 mb-2 p-1 bg-white rounded-lg border w-fit mx-auto"><button onClick={() => setEndorsementType('increase')} className={`px-3 py-1 text-xs rounded-md transition-colors ${endorsementType === 'increase' ? 'bg-red-50 text-red-600 font-bold shadow-sm' : 'text-gray-500'}`}>افزایش هزینه (+)</button><button onClick={() => setEndorsementType('refund')} className={`px-3 py-1 text-xs rounded-md transition-colors ${endorsementType === 'refund' ? 'bg-green-50 text-green-600 font-bold shadow-sm' : 'text-gray-500'}`}>برگشت وجه (-)</button></div><div className="flex flex-col sm:flex-row gap-2"><input className="flex-1 border rounded p-2 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newEndorsement.amount?.toString())} onChange={e => setNewEndorsement({...newEndorsement, amount: deformatNumberString(e.target.value)})} /><div className="flex gap-2 flex-1"><input className="flex-1 border rounded p-2 text-sm" placeholder="توضیحات" value={newEndorsement.description} onChange={e => setNewEndorsement({...newEndorsement, description: e.target.value})} /><button onClick={handleAddEndorsement} className={`${endorsementType === 'increase' ? 'bg-red-600' : 'bg-green-600'} text-white px-3 rounded hover:opacity-90`}><Plus/></button></div></div></div><div className="space-y-2">{(insuranceForm.endorsements || []).map(e => (<div key={e.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border"><span className="text-sm">{e.description || 'بدون توضیح'}</span><div className="flex items-center gap-3"><span className={`font-mono font-bold ${e.amount >= 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Math.abs(e.amount))} {e.amount >= 0 ? '(+)' : '(-)'}</span><button onClick={() => handleDeleteEndorsement(e.id)} className="text-gray-400 hover:text-red-600"><Trash2 size={16}/></button></div></div>))}{(insuranceForm.endorsements || []).length === 0 && <div className="text-center text-gray-400 text-sm">بدون الحاقیه</div>}</div></div>
                        </div>
                    )}

                    {activeTab === 'currency_purchase' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm"><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Coins className="text-amber-500"/> مدیریت خرید ارز (پارت‌ها)</h3><div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mb-6"><div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end"><div className="lg:col-span-2"><label className="text-xs text-gray-500 block mb-1">کارگزار / صرافی</label><input className="w-full border rounded p-2 text-sm" value={newCurrencyTranche.exchangeName} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, exchangeName: e.target.value})} placeholder="نام صرافی..." /></div><div><label className="text-xs text-gray-500 block mb-1">نوع ارز</label><select className="w-full border rounded p-2 text-sm bg-white" value={newCurrencyTranche.currencyType} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, currencyType: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div><div><label className="text-xs text-gray-500 block mb-1">مبلغ ارزی</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newCurrencyTranche.amount?.toString())} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, amount: deformatNumberString(e.target.value)})} placeholder="0.00" /></div><div><label className="text-xs text-gray-500 block mb-1">نرخ ریالی</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newCurrencyTranche.rate?.toString())} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, rate: deformatNumberString(e.target.value)})} placeholder="0" /></div><div><button onClick={handleAddCurrencyTranche} disabled={!newCurrencyTranche.amount} className="w-full bg-amber-600 text-white p-2 rounded text-sm hover:bg-amber-700 flex justify-center gap-1"><Plus size={16}/> ثبت پارت</button></div><div className="lg:col-span-6 flex gap-4 mt-2 border-t border-amber-200 pt-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={newCurrencyTranche.isDelivered} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, isDelivered: e.target.checked})} className="w-4 h-4 text-amber-600 rounded" /><span className="text-sm font-bold text-gray-700">تحویل شده؟</span></label>{newCurrencyTranche.isDelivered && <input type="date" className="border rounded p-1 text-sm" value={newCurrencyTranche.deliveryDate} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, deliveryDate: e.target.value})} />}</div></div></div><div className="overflow-x-auto"><table className="w-full text-sm text-right border-collapse min-w-[700px]"><thead className="bg-gray-100 text-gray-600"><tr><th className="p-3">ردیف</th><th className="p-3">صرافی</th><th className="p-3 text-center">مبلغ ارزی</th><th className="p-3 text-center">نوع</th><th className="p-3 text-center">نرخ (ریال)</th><th className="p-3 text-center">معادل ریالی</th><th className="p-3 text-center">وضعیت تحویل</th><th className="p-3 text-center">عملیات</th></tr></thead><tbody>{(currencyForm.tranches || []).map((t, idx) => (<tr key={t.id} className="hover:bg-gray-50"><td className="p-3 text-center">{idx + 1}</td><td className="p-3 font-medium">{t.exchangeName}</td><td className="p-3 text-center dir-ltr font-mono">{formatNumberString(t.amount.toString())}</td><td className="p-3 text-center">{t.currencyType}</td><td className="p-3 text-center dir-ltr font-mono">{formatCurrency(t.rate || 0)}</td><td className="p-3 text-center dir-ltr font-mono font-bold text-gray-700">{formatCurrency((t.rate || 0) * t.amount)}</td><td className="p-3">{t.exchangeName} / {t.brokerName}</td><td className="p-3 text-center"><span className={`px-2 py-1 rounded text-xs ${t.isDelivered ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.isDelivered ? `تحویل شده: ${t.deliveryDate}` : 'تحویل نشده'}</span></td><td className="p-3 text-center"><button onClick={() => handleRemoveTranche(t.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td></tr>))}<tr className="bg-gray-50 font-bold border-t-2 border-gray-200"><td colSpan={2} className="p-3 text-center">جمع کل</td><td className="p-3 text-center dir-ltr font-mono text-lg">{formatNumberString((currencyForm.tranches || []).reduce((a,b)=>a+b.amount,0).toString())}</td><td colSpan={2}></td><td className="p-3 text-center dir-ltr font-mono text-lg text-amber-700">{formatCurrency((currencyForm.tranches || []).reduce((a,b)=>a+((b.rate||0)*b.amount),0))}</td><td colSpan={2}></td></tr></tbody></table></div></div>
                        </div>
                    )}

                    {activeTab === 'shipping_docs' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm"><div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4"><h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText className="text-cyan-600"/> ثبت اسناد حمل</h3><div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto max-w-full"><button onClick={() => setActiveShippingSubTab('Commercial Invoice')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${activeShippingSubTab === 'Commercial Invoice' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Invoice</button><button onClick={() => setActiveShippingSubTab('Packing List')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${activeShippingSubTab === 'Packing List' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Packing</button><button onClick={() => setActiveShippingSubTab('Bill of Lading')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${activeShippingSubTab === 'Bill of Lading' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>BL</button><button onClick={() => setActiveShippingSubTab('Certificate of Origin')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all whitespace-nowrap ${activeShippingSubTab === 'Certificate of Origin' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>CO</button></div></div>
                                <div className="bg-cyan-50/50 p-6 rounded-xl border border-cyan-100 mb-6"><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4"><div><label className="text-xs font-bold text-gray-500 block mb-1">{getDocLabel(activeShippingSubTab, 'number')}</label><input className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.documentNumber} onChange={e => setShippingDocForm({...shippingDocForm, documentNumber: e.target.value})} /></div><div><label className="text-xs font-bold text-gray-500 block mb-1">{getDocLabel(activeShippingSubTab, 'date')}</label><input className="w-full border rounded p-2 text-sm bg-white dir-ltr text-right" value={shippingDocForm.documentDate} onChange={e => setShippingDocForm({...shippingDocForm, documentDate: e.target.value})} placeholder="YYYY/MM/DD" /></div><div><label className="text-xs font-bold text-gray-500 block mb-1">شماره پارت (اختیاری)</label><input className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.partNumber} onChange={e => setShippingDocForm({...shippingDocForm, partNumber: e.target.value})} placeholder="مثلا Part 1" /></div><div><label className="text-xs font-bold text-gray-500 block mb-1">وضعیت سند</label><select className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.status} onChange={e => setShippingDocForm({...shippingDocForm, status: e.target.value as DocStatus})}><option value="Draft">پیش‌نویس (Draft)</option><option value="Final">نهایی (Original)</option></select></div></div>
                                    {activeShippingSubTab === 'Commercial Invoice' && (<div className="bg-white p-4 rounded-xl border border-gray-200 mb-4"><div className="flex justify-between items-center mb-2"><h4 className="font-bold text-sm text-gray-700">اقلام اینویس</h4><div className="flex items-center gap-2"><span className="text-xs text-gray-500">ارز اینویس:</span><select className="border rounded text-xs p-1" value={shippingDocForm.currency} onChange={e => setShippingDocForm({...shippingDocForm, currency: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div></div><div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end mb-2"><div className="col-span-2"><input className="w-full border rounded p-1.5 text-xs" placeholder="نام کالا" value={newInvoiceItem.name} onChange={e => setNewInvoiceItem({...newInvoiceItem, name: e.target.value})} /></div><div><input className="w-full border rounded p-1.5 text-xs" type="number" placeholder="وزن" value={newInvoiceItem.weight || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, weight: Number(e.target.value)})} /></div><div><input className="w-full border rounded p-1.5 text-xs" type="number" placeholder="فی" value={newInvoiceItem.unitPrice || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, unitPrice: Number(e.target.value)})} /></div><button onClick={handleAddInvoiceItem} className="bg-blue-600 text-white p-1.5 rounded text-xs hover:bg-blue-700">افزودن</button></div><div className="space-y-1 max-h-32 overflow-y-auto">{(shippingDocForm.invoiceItems || []).map(item => (<div key={item.id} className="flex justify-between text-xs bg-gray-50 p-1.5 rounded"><span>{item.name} ({item.weight} KG)</span><div className="flex gap-2"><span>{formatNumberString(item.totalPrice.toString())}</span><button onClick={() => handleRemoveInvoiceItem(item.id)} className="text-red-500"><X size={12}/></button></div></div>))}</div><div className="flex justify-between items-center mt-2 border-t pt-2"><div className="flex items-center gap-2 text-xs"><label>هزینه حمل (Freight):</label><input className="w-20 border rounded p-1 dir-ltr" value={shippingDocForm.freightCost || 0} onChange={e => setShippingDocForm({...shippingDocForm, freightCost: Number(e.target.value)})} /></div><span className="font-bold text-sm text-blue-700">{formatNumberString((getInvoiceTotal(shippingDocForm.invoiceItems || []) + (Number(shippingDocForm.freightCost) || 0)).toString())} {shippingDocForm.currency}</span></div></div>)}
                                    <div className="flex justify-end gap-2"><div className="relative"><input type="file" ref={docFileInputRef} className="hidden" onChange={handleDocFileChange} /><button onClick={() => docFileInputRef.current?.click()} className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 flex items-center gap-1">{uploadingDocFile ? '...' : <Paperclip size={16}/>}</button></div><button onClick={handleSaveShippingDoc} className="px-6 py-2 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700 font-bold">ذخیره سند</button></div>
                                    {(shippingDocForm.attachments || []).length > 0 && <div className="flex gap-2 mt-2">{shippingDocForm.attachments?.map((att, i) => (<div key={i} className="bg-white border px-2 py-1 rounded text-xs flex items-center gap-1"><span className="truncate max-w-[100px]">{att.fileName}</span><button onClick={() => removeDocAttachment(i)} className="text-red-500"><X size={12}/></button></div>))}</div>}
                                </div>
                                <div className="space-y-2">{(selectedRecord.shippingDocuments || []).map(doc => (<div key={doc.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border hover:bg-white transition-colors"><div><div className="font-bold text-sm text-gray-800">{doc.type} - {doc.documentNumber}</div><div className="text-xs text-gray-500">{doc.status === 'Draft' ? 'پیش‌نویس' : 'نهایی'} | {doc.documentDate} {doc.partNumber ? `| ${doc.partNumber}` : ''}</div></div><div className="flex items-center gap-3"><span className="font-mono font-bold text-gray-700 dir-ltr">{formatNumberString(doc.amount?.toString() || '0')} {doc.currency}</span><div className="flex gap-1">{doc.attachments.map((a, i) => <a key={i} href={a.url} target="_blank" className="text-blue-500"><Paperclip size={14}/></a>)}</div><button onClick={() => handleDeleteShippingDoc(doc.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div></div>))}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    // Default View (Dashboard)
    const filteredRecords = getFilteredRecords();
    const groupedData = getGroupedData();

    return (
        <div className="space-y-6 animate-fade-in min-w-0 pb-20">
            {/* STAGE EDIT MODAL (FOR TIMELINE DETAILS) */}
            {editingStage && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h3 className="font-bold text-lg">{editingStage}</h3>
                            <button onClick={() => setEditingStage(null)}><X size={20} className="text-gray-400"/></button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div><label className="text-sm font-bold block mb-1">وضعیت</label><div className="flex items-center gap-2"><input type="checkbox" className="w-5 h-5" checked={stageFormData.isCompleted || false} onChange={e => setStageFormData({...stageFormData, isCompleted: e.target.checked})} /><span className="text-sm">تکمیل شده</span></div></div>
                            <div><label className="text-sm font-bold block mb-1">توضیحات تکمیلی</label><textarea className="w-full border rounded-lg p-2 text-sm h-24" value={stageFormData.description || ''} onChange={e => setStageFormData({...stageFormData, description: e.target.value})} placeholder="توضیحات مربوط به این مرحله..." /></div>
                            
                            {/* Specific Fields for Allocation Queue */}
                            {editingStage === TradeStage.ALLOCATION_QUEUE && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div><label className="text-xs font-bold block mb-1">تاریخ ورود به صف</label><input className="w-full border rounded p-2 text-sm dir-ltr text-right" placeholder="YYYY/MM/DD" value={stageFormData.queueDate || ''} onChange={e => setStageFormData({...stageFormData, queueDate: e.target.value})} /></div>
                                    <div><label className="text-xs font-bold block mb-1">نرخ ارز (تخمینی)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={stageFormData.currencyRate || ''} onChange={e => setStageFormData({...stageFormData, currencyRate: Number(e.target.value)})} /></div>
                                </div>
                            )}

                            {/* Specific Fields for Allocation Approved */}
                            {editingStage === TradeStage.ALLOCATION_APPROVED && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div><label className="text-xs font-bold block mb-1">تاریخ تخصیص</label><input className="w-full border rounded p-2 text-sm dir-ltr text-right" placeholder="YYYY/MM/DD" value={stageFormData.allocationDate || ''} onChange={e => setStageFormData({...stageFormData, allocationDate: e.target.value})} /></div>
                                    <div><label className="text-xs font-bold block mb-1">مهلت انقضا</label><input className="w-full border rounded p-2 text-sm dir-ltr text-right" placeholder="YYYY/MM/DD" value={stageFormData.allocationExpiry || ''} onChange={e => setStageFormData({...stageFormData, allocationExpiry: e.target.value})} /></div>
                                    <div className="col-span-2"><label className="text-xs font-bold block mb-1">کد تخصیص (فیش)</label><input className="w-full border rounded p-2 text-sm" value={stageFormData.allocationCode || ''} onChange={e => setStageFormData({...stageFormData, allocationCode: e.target.value})} /></div>
                                </div>
                            )}

                            {/* Cost Override */}
                            <div className="grid grid-cols-2 gap-2 border-t pt-2">
                                <div><label className="text-xs font-bold block mb-1">هزینه ریالی (دستی)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={stageFormData.costRial || 0} onChange={e => setStageFormData({...stageFormData, costRial: Number(e.target.value)})} /></div>
                                <div><label className="text-xs font-bold block mb-1">هزینه ارزی (دستی)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={stageFormData.costCurrency || 0} onChange={e => setStageFormData({...stageFormData, costCurrency: Number(e.target.value)})} /></div>
                            </div>

                            <div className="border-t pt-2">
                                <label className="text-sm font-bold block mb-2 flex items-center gap-2"><Paperclip size={16}/> فایل‌های ضمیمه</label>
                                <div className="space-y-2 mb-2">
                                    {(stageFormData.attachments || []).map((att, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded text-xs border">
                                            <a href={att.url} target="_blank" className="text-blue-600 truncate max-w-[200px] hover:underline">{att.fileName}</a>
                                            <button onClick={() => removeStageAttachment(idx)} className="text-red-500"><X size={14}/></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleStageFileChange} />
                                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingStageFile} className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded text-xs hover:bg-gray-200 border">
                                        {uploadingStageFile ? 'در حال آپلود...' : 'افزودن فایل'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setEditingStage(null)} className="px-4 py-2 text-sm text-gray-600">انصراف</button>
                            <button onClick={handleSaveStage} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">ذخیره تغییرات</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border shadow-sm">
                <div><h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><LayoutDashboard className="text-blue-600"/> داشبورد بازرگانی</h1><p className="text-sm text-gray-500 mt-1">مدیریت پرونده‌های واردات و صادرات</p></div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    <button onClick={() => setViewMode('reports')} className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"><FileSpreadsheet size={18} /> گزارشات</button>
                    {(currentUser.role === 'admin' || currentUser.role === 'ceo' || currentUser.canManageTrade) && (
                        <button onClick={() => setShowNewModal(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-lg shadow-blue-600/20"><Plus size={18} /> ثبت پرونده جدید</button>
                    )}
                </div>
            </div>

            {/* BREADCRUMB NAV */}
            <div className="flex items-center gap-2 text-sm text-gray-600 overflow-x-auto whitespace-nowrap pb-2">
                <button onClick={goRoot} className={`flex items-center gap-1 hover:text-blue-600 ${navLevel === 'ROOT' ? 'font-bold text-blue-600' : ''}`}><Home size={14}/> شرکت‌ها</button>
                {selectedCompany && <><span className="text-gray-400">/</span><button onClick={() => goCompany(selectedCompany)} className={`hover:text-blue-600 ${navLevel === 'COMPANY' ? 'font-bold text-blue-600' : ''}`}>{selectedCompany}</button></>}
                {selectedGroup && <><span className="text-gray-400">/</span><span className="font-bold text-blue-600">{selectedGroup}</span></>}
            </div>

            {navLevel !== 'GROUP' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {groupedData.map((item) => (
                        <div key={item.name} onClick={() => item.type === 'company' ? goCompany(item.name) : goGroup(item.name)} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-lg ${item.type === 'company' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                                    {item.type === 'company' ? <Building2 size={24}/> : <Package size={24}/>}
                                </div>
                                <div><h3 className="font-bold text-gray-800">{item.name}</h3><p className="text-xs text-gray-500 mt-1">{item.type === 'company' ? 'شرکت' : 'گروه کالایی'}</p></div>
                            </div>
                            <div className="flex items-center gap-2"><span className="text-lg font-bold text-gray-700">{item.count}</span><span className="text-xs text-gray-400">پرونده</span></div>
                        </div>
                    ))}
                </div>
            )}
            
            {(navLevel === 'GROUP' || (navLevel === 'COMPANY' && groupedData.length === 0)) && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/50">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2"><FolderOpen className="text-gray-500"/> لیست پرونده‌ها</h3>
                        <div className="relative w-full sm:w-64"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input type="text" placeholder="جستجو (شماره پرونده، کالا...)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-4 pr-10 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-100" /></div>
                    </div>
                    {filteredRecords.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right">
                                <thead className="bg-gray-100 text-gray-600"><tr><th className="px-6 py-3">شماره پرونده</th><th className="px-6 py-3">کالا</th><th className="px-6 py-3">فروشنده</th><th className="px-6 py-3">وضعیت</th><th className="px-6 py-3 text-center">عملیات</th></tr></thead>
                                <tbody className="divide-y divide-gray-100">{filteredRecords.map(record => (<tr key={record.id} className="hover:bg-gray-50/80 transition-colors cursor-pointer" onClick={() => { setSelectedRecord(record); setViewMode('details'); window.scrollTo(0, 0); }}><td className="px-6 py-4 font-bold text-blue-600">{record.fileNumber}</td><td className="px-6 py-4">{record.goodsName}</td><td className="px-6 py-4 text-gray-600">{record.sellerName}</td><td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${record.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{record.status === 'Active' ? 'فعال' : 'بایگانی'}</span></td><td className="px-6 py-4 text-center"><button onClick={(e) => { e.stopPropagation(); setSelectedRecord(record); setViewMode('details'); window.scrollTo(0, 0); }} className="text-blue-600 hover:text-blue-800 text-xs font-bold bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors">مشاهده جزئیات</button></td></tr>))}</tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-8 text-center text-gray-400">هیچ پرونده‌ای یافت نشد.</div>
                    )}
                </div>
            )}

            {/* NEW RECORD MODAL */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
                        <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-gray-800">ایجاد پرونده جدید</h3><button onClick={() => setShowNewModal(false)}><X size={24} className="text-gray-400 hover:text-red-500" /></button></div>
                        <div className="space-y-4">
                            <div><label className="text-sm font-bold text-gray-700 block mb-1">شماره پرونده</label><input autoFocus className="w-full border rounded-xl px-4 py-3 bg-gray-50 focus:bg-white transition-colors" value={newFileNumber} onChange={e => setNewFileNumber(e.target.value)} placeholder="مثال: 1403-A-101" /></div>
                            <div><label className="text-sm font-bold text-gray-700 block mb-1">نام کالا</label><input className="w-full border rounded-xl px-4 py-3 bg-gray-50 focus:bg-white transition-colors" value={newGoodsName} onChange={e => setNewGoodsName(e.target.value)} placeholder="مثال: قطعات الکترونیکی" /></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-sm font-bold text-gray-700 block mb-1">فروشنده</label><input className="w-full border rounded-xl px-4 py-3 bg-gray-50 focus:bg-white transition-colors" value={newSellerName} onChange={e => setNewSellerName(e.target.value)} /></div><div><label className="text-sm font-bold text-gray-700 block mb-1">ارز پایه</label><select className="w-full border rounded-xl px-4 py-3 bg-gray-50 focus:bg-white transition-colors" value={newMainCurrency} onChange={e => setNewMainCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div></div>
                            <div><label className="text-sm font-bold text-gray-700 block mb-1">شرکت (صاحب پرونده)</label><select className="w-full border rounded-xl px-4 py-3 bg-gray-50 focus:bg-white transition-colors" value={newRecordCompany} onChange={e => setNewRecordCompany(e.target.value)}><option value="">انتخاب شرکت...</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="text-sm font-bold text-gray-700 block mb-1">گروه کالایی</label><select className="w-full border rounded-xl px-4 py-3 bg-gray-50 focus:bg-white transition-colors" value={newCommodityGroup} onChange={e => setNewCommodityGroup(e.target.value)}><option value="">انتخاب گروه...</option>{commodityGroups.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                            <button onClick={handleCreateRecord} disabled={!newFileNumber || !newGoodsName} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-600/20 mt-4 disabled:opacity-70 transition-all">ایجاد پرونده</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TradeModule;
