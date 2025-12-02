
import React, { useState, useEffect, useRef } from 'react';
import { User, TradeRecord, TradeStage, TradeItem, SystemSettings, InsuranceEndorsement, CurrencyPurchaseData, TradeTransaction, CurrencyTranche, TradeStageData, ShippingDocument, ShippingDocType, DocStatus, InvoiceItem, InspectionData, InspectionPayment } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, deleteTradeRecord, getSettings, uploadFile } from '../services/storageService';
import { generateUUID, formatCurrency, formatNumberString, deformatNumberString, parsePersianDate, getCurrentShamsiDate } from '../constants';
import { Container, Plus, Search, CheckCircle2, Circle, Save, Trash2, X, Package, ArrowRight, History, Banknote, Coins, Filter, Wallet, FileSpreadsheet, Shield, LayoutDashboard, Printer, FileDown, PieChart as PieIcon, BarChart3, ListFilter, Paperclip, Upload, Calendar, Building2, Layers, FolderOpen, ChevronLeft, ArrowLeft, Home, Calculator, Ship, FileText, Scale, Stamp, AlertCircle, Plane, ClipboardCheck, Microscope, Eye, RefreshCw } from 'lucide-react';
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
    const [reportFilterCompany, setReportFilterCompany] = useState<string>(''); // For Inspection/Insurance Provider Filter
    const [reportFilterInternalCompany, setReportFilterInternalCompany] = useState<string>(''); // For Internal Company Filter (Lapan Baft, etc.)
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Form States
    const [showNewModal, setShowNewModal] = useState(false);
    const [newFileNumber, setNewFileNumber] = useState('');
    const [newGoodsName, setNewGoodsName] = useState('');
    const [newSellerName, setNewSellerName] = useState('');
    const [newCommodityGroup, setNewCommodityGroup] = useState('');
    const [newMainCurrency, setNewMainCurrency] = useState('EUR');
    const [newRecordCompany, setNewRecordCompany] = useState('');
    
    const [activeTab, setActiveTab] = useState<'timeline' | 'proforma' | 'insurance' | 'currency_purchase' | 'shipping_docs' | 'inspection'>('timeline');
    
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
    
    // Inspection State
    const [inspectionForm, setInspectionForm] = useState<InspectionData>({ inspectionCompany: '', certificateNumber: '', totalInvoiceAmount: 0, payments: [] });
    const [newInspectionPayment, setNewInspectionPayment] = useState<Partial<InspectionPayment>>({ part: '', amount: 0, date: '', bank: '' });

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
                setInspectionForm(selectedRecord.inspectionData);
            } else {
                setInspectionForm({ inspectionCompany: '', certificateNumber: '', totalInvoiceAmount: 0, payments: [] });
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

            // Reset shipping form
            setShippingDocForm({ status: 'Draft', documentNumber: '', documentDate: '', attachments: [], currency: selectedRecord.mainCurrency || 'EUR', invoiceItems: [], freightCost: 0 });
            setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
        }
    }, [selectedRecord]);

    const loadRecords = async () => {
        const data = await getTradeRecords();
        setRecords(data);
    };

    // Navigation Helpers
    const goRoot = () => { setNavLevel('ROOT'); setSelectedCompany(null); setSelectedGroup(null); setSearchTerm(''); };
    const goCompany = (company: string) => { setSelectedCompany(company); setNavLevel('COMPANY'); setSelectedGroup(null); setSearchTerm(''); };
    const goGroup = (group: string) => { setSelectedGroup(group); setNavLevel('GROUP'); setSearchTerm(''); };

    // Grouping Logic for Dashboard
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
    
    // --- Proforma & Item Handlers ---
    const handleUpdateProforma = (field: keyof TradeRecord, value: string | number) => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, [field]: value }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddItem = async () => { if (!selectedRecord || !newItem.name) return; const item: TradeItem = { id: generateUUID(), name: newItem.name, weight: Number(newItem.weight), unitPrice: Number(newItem.unitPrice), totalPrice: Number(newItem.totalPrice) || (Number(newItem.weight) * Number(newItem.unitPrice)) }; const updatedItems = [...selectedRecord.items, item]; const updatedRecord = { ...selectedRecord, items: updatedItems }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 }); };
    const handleRemoveItem = async (id: string) => { if (!selectedRecord) return; const updatedItems = selectedRecord.items.filter(i => i.id !== id); const updatedRecord = { ...selectedRecord, items: updatedItems }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    // --- License Handlers ---
    const handleAddLicenseTx = async () => { if (!selectedRecord || !newLicenseTx.amount) return; const tx: TradeTransaction = { id: generateUUID(), date: newLicenseTx.date || '', amount: Number(newLicenseTx.amount), bank: newLicenseTx.bank || '', description: newLicenseTx.description || '' }; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = [...(currentLicenseData.transactions || []), tx]; const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; updatedRecord.stages[TradeStage.LICENSES].isCompleted = totalCost > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' }); };
    const handleRemoveLicenseTx = async (id: string) => { if (!selectedRecord) return; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = (currentLicenseData.transactions || []).filter(t => t.id !== id); const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    // --- Insurance Handlers ---
    const handleSaveInsurance = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, insuranceData: insuranceForm }; const totalCost = (Number(insuranceForm.cost) || 0) + (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStageData(updatedRecord, TradeStage.INSURANCE); updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost; updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!insuranceForm.policyNumber; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert("اطلاعات بیمه ذخیره شد."); };
    const handleAddEndorsement = () => { if (!newEndorsement.amount) return; const endorsement: InsuranceEndorsement = { id: generateUUID(), date: newEndorsement.date || '', amount: Number(newEndorsement.amount), description: newEndorsement.description || '' }; const updatedEndorsements = [...(insuranceForm.endorsements || []), endorsement]; setInsuranceForm({ ...insuranceForm, endorsements: updatedEndorsements }); setNewEndorsement({ amount: 0, description: '', date: '' }); };
    const handleDeleteEndorsement = (id: string) => { setInsuranceForm({ ...insuranceForm, endorsements: insuranceForm.endorsements?.filter(e => e.id !== id) }); };
    const calculateInsuranceTotal = () => { const base = Number(insuranceForm.cost) || 0; const endorsed = (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); return base + endorsed; };

    // --- Inspection Handlers (New) ---
    const handleSaveInspectionGeneral = async () => {
        if (!selectedRecord) return;
        const updatedData: InspectionData = { ...inspectionForm };
        const updatedRecord = { ...selectedRecord, inspectionData: updatedData };
        
        // Sync with Stage Info
        if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION);
        updatedRecord.stages[TradeStage.INSPECTION].isCompleted = !!updatedData.certificateNumber;
        // Cost is the Sum of Payments, but we might want to store TotalInvoice somewhere else if needed.
        // For the stage visual, usually "Cost" implies money spent (Payments).
        updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedData.payments.reduce((acc, p) => acc + p.amount, 0);

        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
        alert("اطلاعات بازرسی ذخیره شد.");
    };

    const handleAddInspectionPayment = async () => {
        if (!selectedRecord || !newInspectionPayment.amount) return;
        const payment: InspectionPayment = {
            id: generateUUID(),
            part: newInspectionPayment.part || 'Part',
            amount: Number(newInspectionPayment.amount),
            date: newInspectionPayment.date || '',
            bank: newInspectionPayment.bank || '',
            description: ''
        };
        const updatedPayments = [...(inspectionForm.payments || []), payment];
        const updatedData = { ...inspectionForm, payments: updatedPayments };
        setInspectionForm(updatedData);
        setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' });
        
        // Auto Save to record for cost update
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


    // --- Currency Handlers ---
    const handleAddCurrencyTranche = async () => { if (!selectedRecord || !newCurrencyTranche.amount) return; const tranche: CurrencyTranche = { id: generateUUID(), date: newCurrencyTranche.date || '', amount: Number(newCurrencyTranche.amount), currencyType: newCurrencyTranche.currencyType || selectedRecord.mainCurrency || 'EUR', brokerName: newCurrencyTranche.brokerName || '', exchangeName: newCurrencyTranche.exchangeName || '', rate: Number(newCurrencyTranche.rate) || 0, isDelivered: newCurrencyTranche.isDelivered, deliveryDate: newCurrencyTranche.deliveryDate }; const currentTranches = currencyForm.tranches || []; const updatedTranches = [...currentTranches, tranche]; const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' }); };
    const handleUpdateTrancheDelivery = async (id: string, isDelivered: boolean, deliveryDate?: string) => { if (!selectedRecord) return; const updatedTranches = (currencyForm.tranches || []).map(t => { if (t.id === id) return { ...t, isDelivered, deliveryDate }; return t; }); const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleRemoveTranche = async (id: string) => { if (!selectedRecord) return; if (!confirm('آیا از حذف این پارت خرید ارز مطمئن هستید؟')) return; const updatedTranches = (currencyForm.tranches || []).filter(t => t.id !== id); const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); }

    // --- Shipping Documents Handlers ---

    // Invoice Item Handling
    const handleAddInvoiceItem = () => {
        if (!newInvoiceItem.name) return;
        const newItem: InvoiceItem = {
            id: generateUUID(),
            name: newInvoiceItem.name,
            weight: Number(newInvoiceItem.weight),
            unitPrice: Number(newInvoiceItem.unitPrice),
            totalPrice: Number(newInvoiceItem.totalPrice) || (Number(newInvoiceItem.weight) * Number(newInvoiceItem.unitPrice))
        };
        const currentItems = shippingDocForm.invoiceItems || [];
        setShippingDocForm({ ...shippingDocForm, invoiceItems: [...currentItems, newItem] });
        setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
    };

    const handleRemoveInvoiceItem = (id: string) => {
        const currentItems = shippingDocForm.invoiceItems || [];
        setShippingDocForm({ ...shippingDocForm, invoiceItems: currentItems.filter(i => i.id !== id) });
    };

    const getInvoiceTotal = (items: InvoiceItem[]) => {
        return items.reduce((sum, item) => sum + item.totalPrice, 0);
    };

    const getDocLabel = (type: ShippingDocType, field: 'number' | 'date') => {
        if (field === 'number') {
            if (type === 'Commercial Invoice') return 'شماره اینویس';
            if (type === 'Packing List') return 'شماره پکینگ';
            if (type === 'Bill of Lading') return 'شماره بارنامه';
            if (type === 'Certificate of Origin') return 'شماره گواهی مبدا';
        }
        if (field === 'date') {
            if (type === 'Commercial Invoice') return 'تاریخ اینویس';
            if (type === 'Packing List') return 'تاریخ پکینگ';
            if (type === 'Bill of Lading') return 'تاریخ صدور';
            if (type === 'Certificate of Origin') return 'تاریخ صدور';
        }
        return '';
    };

    const handleSaveShippingDoc = async () => {
        if (!selectedRecord || !shippingDocForm.documentNumber) { alert("شماره سند الزامی است"); return; }
        
        // Calculate Total Amount for Invoice
        let totalAmount = 0;
        if (activeShippingSubTab === 'Commercial Invoice') {
            const itemTotal = getInvoiceTotal(shippingDocForm.invoiceItems || []);
            totalAmount = itemTotal + (Number(shippingDocForm.freightCost) || 0);
        } else {
            totalAmount = Number(shippingDocForm.amount) || 0;
        }

        const newDoc: ShippingDocument = {
            id: generateUUID(),
            type: activeShippingSubTab,
            status: activeShippingSubTab === 'Commercial Invoice' ? (shippingDocForm.status as DocStatus || 'Draft') : 'Final', // Others default to Final/Standard
            documentNumber: shippingDocForm.documentNumber || '',
            documentDate: shippingDocForm.documentDate || '',
            attachments: shippingDocForm.attachments || [],
            
            // Shared
            partNumber: shippingDocForm.partNumber,
            description: shippingDocForm.description,

            // Invoice Specific
            invoiceItems: activeShippingSubTab === 'Commercial Invoice' ? shippingDocForm.invoiceItems : undefined,
            amount: totalAmount,
            freightCost: activeShippingSubTab === 'Commercial Invoice' ? Number(shippingDocForm.freightCost) : undefined,
            currency: activeShippingSubTab === 'Commercial Invoice' ? shippingDocForm.currency : undefined,
            
            // Packing Specific
            netWeight: activeShippingSubTab === 'Packing List' ? Number(shippingDocForm.netWeight) : undefined,
            grossWeight: activeShippingSubTab === 'Packing List' ? Number(shippingDocForm.grossWeight) : undefined,
            packagesCount: activeShippingSubTab === 'Packing List' ? Number(shippingDocForm.packagesCount) : undefined,

            // CO Specific
            chamberOfCommerce: activeShippingSubTab === 'Certificate of Origin' ? shippingDocForm.chamberOfCommerce : undefined,

            // BL Specific
            vesselName: activeShippingSubTab === 'Bill of Lading' ? shippingDocForm.vesselName : undefined,
            portOfLoading: activeShippingSubTab === 'Bill of Lading' ? shippingDocForm.portOfLoading : undefined,
            portOfDischarge: activeShippingSubTab === 'Bill of Lading' ? shippingDocForm.portOfDischarge : undefined,
            
            createdAt: Date.now(),
            createdBy: currentUser.fullName
        };

        const currentDocs = selectedRecord.shippingDocuments || [];
        // Add to top
        const updatedDocs = [newDoc, ...currentDocs];
        const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs };
        
        // Update generic stage completion status if necessary
        if (!updatedRecord.stages[TradeStage.SHIPPING_DOCS]) updatedRecord.stages[TradeStage.SHIPPING_DOCS] = getStageData(updatedRecord, TradeStage.SHIPPING_DOCS);
        updatedRecord.stages[TradeStage.SHIPPING_DOCS].isCompleted = true; // Assumes if we add a doc, we are working on it
        updatedRecord.stages[TradeStage.SHIPPING_DOCS].updatedAt = Date.now();

        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
        
        // Reset Form
        setShippingDocForm({ 
            status: 'Draft', 
            documentNumber: '', 
            documentDate: '', 
            attachments: [], 
            invoiceItems: [],
            amount: 0, 
            freightCost: 0,
            netWeight: 0, 
            grossWeight: 0, 
            packagesCount: 0,
            chamberOfCommerce: '',
            vesselName: '',
            portOfLoading: '',
            portOfDischarge: '',
            description: '',
            partNumber: '',
            currency: selectedRecord.mainCurrency || 'EUR'
        });
        setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
    };

    const handleDeleteShippingDoc = async (id: string) => {
        if (!selectedRecord) return;
        if (!confirm('آیا از حذف این سند مطمئن هستید؟')) return;
        const currentDocs = selectedRecord.shippingDocuments || [];
        const updatedDocs = currentDocs.filter(d => d.id !== id);
        const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return; 
        setUploadingDocFile(true); 
        const reader = new FileReader(); 
        reader.onload = async (ev) => { 
            const base64 = ev.target?.result as string; 
            try { 
                const result = await uploadFile(file.name, base64); 
                const current = shippingDocForm.attachments || [];
                setShippingDocForm({ ...shippingDocForm, attachments: [...current, { fileName: result.fileName, url: result.url }] }); 
            } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploadingDocFile(false); } 
        }; 
        reader.readAsDataURL(file); e.target.value = '';
    };

    const removeDocAttachment = (index: number) => {
        const current = shippingDocForm.attachments || [];
        setShippingDocForm({ ...shippingDocForm, attachments: current.filter((_, i) => i !== index) });
    };

    // Calculate Final Proforma Aggregation
    const getFinalAggregation = () => {
        if (!selectedRecord?.shippingDocuments) return { totalAmount: 0, totalFreight: 0, finalItems: [], finalCurrency: null };
        const finalInvoices = selectedRecord.shippingDocuments.filter(d => d.type === 'Commercial Invoice' && d.status === 'Final');
        
        let totalAmount = 0;
        let totalFreight = 0;
        
        // Aggregation Map for Items (Group by Name)
        const itemAggregation: Record<string, { weight: number, totalPrice: number, name: string }> = {};

        finalInvoices.forEach(inv => {
            totalAmount += (inv.amount || 0);
            totalFreight += (inv.freightCost || 0);
            
            if (inv.invoiceItems) {
                inv.invoiceItems.forEach(item => {
                    const normalizedName = item.name.trim(); // Can add toLowerCase() if needed for strict matching
                    if (!itemAggregation[normalizedName]) {
                        itemAggregation[normalizedName] = {
                            name: item.name,
                            weight: 0,
                            totalPrice: 0
                        };
                    }
                    itemAggregation[normalizedName].weight += item.weight;
                    itemAggregation[normalizedName].totalPrice += item.totalPrice;
                });
            }
        });

        // Convert Map back to InvoiceItem array
        const aggregatedItems: InvoiceItem[] = Object.values(itemAggregation).map(agg => ({
            id: generateUUID(),
            name: agg.name,
            weight: agg.weight,
            totalPrice: agg.totalPrice,
            // Derived Unit Price
            unitPrice: agg.weight > 0 ? agg.totalPrice / agg.weight : 0
        }));

        const finalCurrency = finalInvoices.length > 0 ? finalInvoices[0].currency : null;

        return { totalAmount, totalFreight, finalItems: aggregatedItems, finalCurrency };
    };

    const handleUpdateFinalProforma = async () => {
        if (!selectedRecord) return;
        const { totalFreight, finalItems, finalCurrency } = getFinalAggregation();
        
        if (finalItems.length === 0) {
            alert("هیچ آیتمی در اینویس‌های نهایی یافت نشد.");
            return;
        }

        if (confirm(`آیا مطمئن هستید؟ لیست کالاهای پرونده (پروفرما) و هزینه حمل با اطلاعات جمع‌آوری شده از اینویس‌های نهایی جایگزین خواهد شد. کالاهای هم‌نام تجمیع می‌شوند.${finalCurrency ? `\nهمچنین ارز پایه پرونده به ${finalCurrency} تغییر می‌کند.` : ''}`)) {
            // Convert InvoiceItems to TradeItems
            const tradeItems: TradeItem[] = finalItems.map(i => ({
                id: generateUUID(),
                name: i.name,
                weight: i.weight,
                unitPrice: i.unitPrice,
                totalPrice: i.totalPrice
            }));

            const updatedRecord = { 
                ...selectedRecord, 
                items: tradeItems,
                freightCost: totalFreight,
                mainCurrency: finalCurrency || selectedRecord.mainCurrency // Update main currency if found
            };

            await updateTradeRecord(updatedRecord);
            setSelectedRecord(updatedRecord);
            alert("پروفرما نهایی و ارز پایه با موفقیت بروزرسانی شد.");
        }
    };


    // --- Stage Modal Logic ---
    const handleOpenStage = (stage: TradeStage) => { if (!selectedRecord) return; const data = getStageData(selectedRecord, stage); setStageFormData(data); setEditingStage(stage); };
    const handleSaveStage = async () => { if (!selectedRecord || !editingStage) return; const updatedStageData: TradeStageData = { ...getStageData(selectedRecord, editingStage), ...stageFormData, updatedAt: Date.now(), updatedBy: currentUser.fullName }; const updatedStages = { ...selectedRecord.stages, [editingStage]: updatedStageData }; const updatedRecord = { ...selectedRecord, stages: updatedStages }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setEditingStage(null); };
    const handleStageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingStageFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); const currentAttachments = stageFormData.attachments || []; setStageFormData({ ...stageFormData, attachments: [...currentAttachments, { fileName: result.fileName, url: result.url }] }); } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploadingStageFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const removeStageAttachment = (index: number) => { const currentAttachments = stageFormData.attachments || []; setStageFormData({ ...stageFormData, attachments: currentAttachments.filter((_, i) => i !== index) }); };

    // --- Search & Filter Logic (Hierarchy Aware) ---
    const getFilteredRecords = () => {
        const term = searchTerm.toLowerCase();
        let subset = records;
        if (!term) {
            if (navLevel === 'COMPANY' && selectedCompany) { subset = records.filter(r => (r.company || 'بدون شرکت') === selectedCompany); }
            else if (navLevel === 'GROUP' && selectedCompany && selectedGroup) { subset = records.filter(r => (r.company || 'بدون شرکت') === selectedCompany && (r.commodityGroup || 'سایر') === selectedGroup); }
            else if (navLevel === 'ROOT') { return []; }
        }
        return subset.filter(r => {
            if (!term) return true;
             return r.fileNumber.toLowerCase().includes(term) || (r.registrationNumber || '').toLowerCase().includes(term) || r.sellerName.toLowerCase().includes(term) || r.goodsName?.toLowerCase().includes(term) || r.company?.toLowerCase().includes(term);
        });
    };

    const getReportRecords = () => {
        const term = searchTerm.toLowerCase();
        let base = records;
        if (term) { base = records.filter(r => r.fileNumber.toLowerCase().includes(term) || (r.registrationNumber || '').toLowerCase().includes(term) || r.sellerName.toLowerCase().includes(term) || r.goodsName?.toLowerCase().includes(term) || r.company?.toLowerCase().includes(term)); }
        
        // Filter by Internal Company (Our Company)
        if (reportFilterInternalCompany) {
            base = base.filter(r => r.company === reportFilterInternalCompany);
        }

        // Filter by specific Inspection/Insurance Company if selected
        if (activeReport === 'inspection' && reportFilterCompany) {
            base = base.filter(r => r.inspectionData?.inspectionCompany === reportFilterCompany);
        }
        if (activeReport === 'insurance' && reportFilterCompany) {
            base = base.filter(r => r.insuranceData?.company === reportFilterCompany);
        }

        switch (activeReport) {
            case 'allocation_queue': return base.filter(r => r.stages[TradeStage.ALLOCATION_QUEUE]?.isCompleted === false && r.stages[TradeStage.INSURANCE]?.isCompleted === true);
            case 'allocated': return base.filter(r => r.stages[TradeStage.ALLOCATION_APPROVED]?.isCompleted === true);
            case 'shipping': return base.filter(r => r.stages[TradeStage.SHIPPING_DOCS]?.isCompleted === false && r.stages[TradeStage.CURRENCY_PURCHASE]?.isCompleted === true);
            case 'inspection': return base.filter(r => !!r.inspectionData?.inspectionCompany);
            case 'insurance': return base.filter(r => !!r.insuranceData?.policyNumber);
            default: return base;
        }
    };

    const getUniqueInspectionCompanies = () => {
        const companies = new Set<string>();
        records.forEach(r => { if (r.inspectionData?.inspectionCompany) companies.add(r.inspectionData.inspectionCompany); });
        return Array.from(companies);
    };

    const getUniqueInsuranceCompanies = () => {
        const companies = new Set<string>();
        records.forEach(r => { if (r.insuranceData?.company) companies.add(r.insuranceData.company); });
        return Array.from(companies);
    };

    // Helper Calculations for Reports
    const calculateDaysDiff = (dateStr?: string) => {
        if (!dateStr) return '-';
        try {
            const shamsi = parsePersianDate(dateStr);
            if (!shamsi) return '-';
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - shamsi.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            // Check if future or past
            return (shamsi > now ? diffDays : -diffDays).toString();
        } catch (e) { return '-'; }
    };
    
    // Helper to get Total Currency Amount (Fallback to items total if not purchased yet)
    const getCurrencyTotal = (r: TradeRecord) => {
        if (r.currencyPurchaseData?.purchasedAmount && r.currencyPurchaseData.purchasedAmount > 0) return r.currencyPurchaseData.purchasedAmount;
        return r.items.reduce((acc, i) => acc + i.totalPrice, 0);
    };

    // --- Export Helpers ---
    const handleDownloadPDF = async () => {
        const element = document.getElementById('report-table-container');
        if (!element) return;
        setIsGeneratingPDF(true);
        try {
            // @ts-ignore
            const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            // @ts-ignore
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('landscape', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`report-${activeReport}-${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (e) { alert('خطا در تولید PDF'); } finally { setIsGeneratingPDF(false); }
    };
    const handlePrint = () => { window.print(); };

    // --- Sub-Components ---
    const ReportHeader = ({ title, icon: Icon }: { title: string, icon: any }) => (
        <div className="flex justify-between items-center mb-6 no-print">
            <div className="flex items-center gap-4"><div className="p-2 rounded-lg bg-blue-100 text-blue-700"><Icon size={24}/></div><div><h2 className="text-xl font-bold text-gray-800">{title}</h2><p className="text-xs text-gray-500 mt-1">گزارش‌گیری، چاپ و خروجی</p></div></div>
            <div className="flex gap-2"><button onClick={handleDownloadPDF} disabled={isGeneratingPDF} className="flex items-center gap-2 px-3 py-2 text-sm bg-red-50 text-red-700 rounded-lg hover:bg-red-100"><FileDown size={16}/> {isGeneratingPDF ? '...' : 'PDF'}</button><button onClick={handlePrint} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"><Printer size={16}/> چاپ</button><button onClick={() => setViewMode('dashboard')} className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"><ArrowRight size={16}/> بازگشت</button></div>
        </div>
    );

    // --- RENDER REPORTS ---
    if (viewMode === 'reports') {
        const reportData = getReportRecords();
        return (
            <div className="flex h-[calc(100vh-100px)] animate-fade-in bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                <div className="w-64 bg-white border-l p-4 flex flex-col gap-2 overflow-y-auto no-print">
                    <div className="mb-4 font-bold text-gray-700 px-2">مرکز گزارشات</div>
                    <button onClick={() => { setActiveReport('general'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'general' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><ListFilter size={18}/> گزارش جامع</button>
                    <button onClick={() => { setActiveReport('allocation_queue'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'allocation_queue' ? 'bg-purple-50 text-purple-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><History size={18}/> در صف تخصیص</button>
                    <button onClick={() => { setActiveReport('allocated'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'allocated' ? 'bg-green-50 text-green-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><CheckCircle2 size={18}/> تخصیص یافته</button>
                    <button onClick={() => { setActiveReport('currency'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'currency' ? 'bg-amber-50 text-amber-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Coins size={18}/> خرید ارز</button>
                    <button onClick={() => { setActiveReport('insurance'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'insurance' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Shield size={18}/> بیمه و الحاقیه‌ها</button>
                    <button onClick={() => { setActiveReport('inspection'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'inspection' ? 'bg-rose-50 text-rose-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Microscope size={18}/> گواهی بازرسی</button>
                    <button onClick={() => { setActiveReport('shipping'); setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'shipping' ? 'bg-cyan-50 text-cyan-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Container size={18}/> در حال حمل</button>
                    <div className="mt-auto pt-4 border-t"><button onClick={() => setViewMode('dashboard')} className="w-full p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center gap-2 text-sm"><Home size={16}/> بازگشت به داشبورد</button></div>
                </div>

                <div className="flex-1 p-8 overflow-y-auto">
                    <ReportHeader title={activeReport === 'general' ? 'گزارش جامع' : activeReport === 'inspection' ? 'گزارش گواهی بازرسی و مغایرت' : 'گزارش'} icon={activeReport === 'inspection' ? Microscope : FileSpreadsheet} />
                    
                    <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 flex flex-wrap items-center gap-4 no-print">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-gray-700">شرکت داخلی (ما):</label>
                            <select className="border rounded-lg p-2 text-sm min-w-[200px]" value={reportFilterInternalCompany} onChange={e => setReportFilterInternalCompany(e.target.value)}>
                                <option value="">همه شرکت‌ها</option>
                                {availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {activeReport === 'inspection' && (
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-gray-700">شرکت بازرسی (طرف حساب):</label>
                                <select className="border rounded-lg p-2 text-sm min-w-[200px]" value={reportFilterCompany} onChange={e => setReportFilterCompany(e.target.value)}>
                                    <option value="">همه شرکت‌ها</option>
                                    {getUniqueInspectionCompanies().map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        )}

                         {activeReport === 'insurance' && (
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-gray-700">شرکت بیمه (طرف حساب):</label>
                                <select className="border rounded-lg p-2 text-sm min-w-[200px]" value={reportFilterCompany} onChange={e => setReportFilterCompany(e.target.value)}>
                                    <option value="">همه شرکت‌ها</option>
                                    {getUniqueInsuranceCompanies().map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        )}

                        {(reportFilterCompany || reportFilterInternalCompany) && <button onClick={() => { setReportFilterCompany(''); setReportFilterInternalCompany(''); }} className="text-xs text-red-500 hover:underline mt-5 bg-red-50 px-3 py-2 rounded-lg">حذف فیلترها</button>}
                    </div>

                    <div id="report-table-container" className="bg-white p-6 rounded-xl border shadow-sm print:shadow-none print:border-none print:p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                <thead className="bg-gray-800 text-white font-bold text-xs print:bg-gray-200 print:text-black">
                                    {activeReport === 'general' && (<tr><th className="p-3">پرونده</th><th className="p-3">کالا</th><th className="p-3">فروشنده</th><th className="p-3">شرکت داخلی</th><th className="p-3 text-center">وضعیت</th></tr>)}
                                    {activeReport === 'allocation_queue' && (<tr><th className="p-3">پرونده</th><th className="p-3">ثبت سفارش</th><th className="p-3">مبلغ ارزی</th><th className="p-3">بانک عامل</th><th className="p-3">تاریخ ورود به صف</th><th className="p-3">تعداد روز در صف</th><th className="p-3">نرخ ارز (تخمینی)</th><th className="p-3">معادل ریالی</th></tr>)}
                                    {activeReport === 'allocated' && (<tr><th className="p-3">پرونده</th><th className="p-3">ثبت سفارش</th><th className="p-3">مبلغ ارزی</th><th className="p-3">بانک</th><th className="p-3">تاریخ تخصیص</th><th className="p-3">مهلت انقضا</th><th className="p-3">مانده (روز)</th><th className="p-3">کد تخصیص</th></tr>)}
                                    {activeReport === 'currency' && (<tr><th className="p-3 w-48">پرونده / ثبت سفارش</th><th className="p-3 text-center">مبلغ</th><th className="p-3 text-center">ارز</th><th className="p-3 text-center">نرخ ریالی</th><th className="p-3 text-center">معادل ریالی</th><th className="p-3">کارگزار/صرافی</th><th className="p-3">تاریخ خرید</th><th className="p-3 text-center">وضعیت تحویل</th></tr>)}
                                    {activeReport === 'insurance' && (<tr><th className="p-3">پرونده / شرکت داخلی</th><th className="p-3">شماره بیمه</th><th className="p-3">شرکت بیمه</th><th className="p-3">هزینه (بدهی)</th><th className="p-3">الحاقیه (بدهی)</th><th className="p-3">جمع بدهی</th></tr>)}
                                    {activeReport === 'inspection' && (<tr><th className="p-3">پرونده / شرکت داخلی</th><th className="p-3">شرکت بازرسی</th><th className="p-3">شماره گواهی</th><th className="p-3">مبلغ قرارداد (بستانکار)</th><th className="p-3">پرداخت‌ها (بدهکار)</th><th className="p-3 text-center">مانده (تراز)</th></tr>)}
                                </thead>
                                <tbody className="divide-y divide-gray-200 print:divide-gray-400">
                                    {reportData.map(r => (
                                        <React.Fragment key={r.id}>
                                            {activeReport === 'general' && (<tr className="hover:bg-gray-50"><td className="p-3 font-bold">{r.fileNumber}</td><td className="p-3">{r.goodsName}</td><td className="p-3">{r.sellerName}</td><td className="p-3">{r.company}</td><td className="p-3 text-center">{r.status}</td></tr>)}
                                            
                                            {/* INSPECTION REPORT WITH DEBTOR/CREDITOR LOGIC */}
                                            {activeReport === 'inspection' && (
                                                <tr className="hover:bg-rose-50/20 valign-top">
                                                    <td className="p-3 font-bold border-l">{r.fileNumber}<div className="text-xs font-normal text-gray-500 mt-1">{r.company}</div></td>
                                                    <td className="p-3">{r.inspectionData?.inspectionCompany || '-'}</td>
                                                    <td className="p-3 font-mono">{r.inspectionData?.certificateNumber || '-'}</td>
                                                    <td className="p-3 font-mono dir-ltr font-bold text-gray-700 bg-red-50/50">
                                                        {formatCurrency(r.inspectionData?.totalInvoiceAmount || 0)}
                                                    </td>
                                                    <td className="p-3 bg-green-50/50">
                                                        <div className="font-bold font-mono dir-ltr text-green-700">
                                                            {formatCurrency((r.inspectionData?.payments || []).reduce((acc, p) => acc + p.amount, 0))}
                                                        </div>
                                                        {(r.inspectionData?.payments || []).length > 0 && (
                                                            <div className="text-[10px] text-gray-500 mt-1 space-y-1">
                                                                {r.inspectionData?.payments.map(p => (
                                                                    <div key={p.id} className="flex justify-between border-b border-gray-100 pb-0.5">
                                                                        <span>{p.part}</span>
                                                                        <span>{formatCurrency(p.amount)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 dir-ltr text-center font-mono font-black">
                                                        {(() => {
                                                            const totalDue = r.inspectionData?.totalInvoiceAmount || 0;
                                                            const totalPaid = (r.inspectionData?.payments || []).reduce((acc, p) => acc + p.amount, 0);
                                                            const balance = totalDue - totalPaid;
                                                            return (
                                                                <span className={balance > 0 ? "text-red-600" : balance < 0 ? "text-green-600" : "text-gray-400"}>
                                                                    {balance === 0 ? 'تسویه شده' : formatCurrency(balance)}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                </tr>
                                            )}

                                            {activeReport === 'allocation_queue' && (
                                                <tr className="hover:bg-gray-50">
                                                    <td className="p-3 font-bold">{r.fileNumber}</td>
                                                    <td className="p-3">{r.registrationNumber || '-'}</td>
                                                    <td className="p-3 font-mono dir-ltr">{formatNumberString(getCurrencyTotal(r).toString())} {r.mainCurrency}</td>
                                                    <td className="p-3">{r.operatingBank || '-'}</td>
                                                    <td className="p-3 dir-ltr text-right">{r.stages[TradeStage.ALLOCATION_QUEUE]?.queueDate || '-'}</td>
                                                    <td className="p-3 font-bold text-amber-600 text-center">{calculateDaysDiff(r.stages[TradeStage.ALLOCATION_QUEUE]?.queueDate)} روز</td>
                                                    <td className="p-3 font-mono dir-ltr">{formatCurrency(r.stages[TradeStage.ALLOCATION_QUEUE]?.currencyRate || 0)}</td>
                                                    <td className="p-3 font-mono dir-ltr font-bold">{formatCurrency((r.stages[TradeStage.ALLOCATION_QUEUE]?.currencyRate || 0) * getCurrencyTotal(r))}</td>
                                                </tr>
                                            )}
                                            {activeReport === 'allocated' && (
                                                <tr className="hover:bg-gray-50">
                                                    <td className="p-3 font-bold">{r.fileNumber}</td>
                                                    <td className="p-3">{r.registrationNumber || '-'}</td>
                                                    <td className="p-3 font-mono dir-ltr">{formatNumberString(getCurrencyTotal(r).toString())} {r.mainCurrency}</td>
                                                    <td className="p-3">{r.operatingBank || '-'}</td>
                                                    <td className="p-3 dir-ltr text-right">{r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationDate || '-'}</td>
                                                    <td className="p-3 dir-ltr text-right">{r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationExpiry || '-'}</td>
                                                    <td className={`p-3 font-bold text-center ${Number(calculateDaysDiff(r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationExpiry)) > 10 ? 'text-green-600' : 'text-red-500'}`}>{calculateDaysDiff(r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationExpiry)}</td>
                                                    <td className="p-3">{r.stages[TradeStage.ALLOCATION_APPROVED]?.allocationCode || '-'}</td>
                                                </tr>
                                            )}
                                            {activeReport === 'currency' && (
                                                <>
                                                    {(r.currencyPurchaseData?.tranches || []).length === 0 ? (
                                                        <tr className="bg-gray-50/50"><td className="p-3 font-bold">{r.fileNumber}</td><td colSpan={7} className="p-3 text-center text-gray-400 italic">بدون خرید ارز</td></tr>
                                                    ) : (
                                                        (r.currencyPurchaseData?.tranches || []).map((t, i) => (
                                                            <tr key={`${r.id}-${i}`} className="hover:bg-blue-50/20">
                                                                {i === 0 && <td rowSpan={(r.currencyPurchaseData?.tranches || []).length} className="p-3 font-bold border-l align-top bg-white">{r.fileNumber}<div className="text-xs font-normal text-gray-500 mt-1">{r.registrationNumber}</div></td>}
                                                                <td className="p-3 text-center font-mono dir-ltr">{formatNumberString(t.amount.toString())}</td>
                                                                <td className="p-3 text-center">{t.currencyType}</td>
                                                                <td className="p-3 text-center font-mono">{formatCurrency(t.rate || 0)}</td>
                                                                <td className="p-3 text-center font-mono font-bold text-gray-700">{formatCurrency((t.rate || 0) * t.amount)}</td>
                                                                <td className="p-3">{t.exchangeName} / {t.brokerName}</td>
                                                                <td className="p-3">{t.date}</td>
                                                                <td className="p-3 text-center"><span className={`px-2 py-1 rounded text-xs ${t.isDelivered ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.isDelivered ? `تحویل شده: ${t.deliveryDate}` : 'تحویل نشده'}</span></td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </>
                                            )}
                                            {activeReport === 'insurance' && r.insuranceData?.policyNumber && (
                                                <tr className="hover:bg-purple-50/20">
                                                    <td className="p-3 font-bold border-l">{r.fileNumber}<div className="text-xs font-normal text-gray-500 mt-1">{r.company}</div></td>
                                                    <td className="p-3">{r.insuranceData.policyNumber}</td>
                                                    <td className="p-3">{r.insuranceData.company}</td>
                                                    <td className="p-3 dir-ltr text-right font-mono bg-red-50/50">{formatCurrency(r.insuranceData.cost)}</td>
                                                    <td className="p-3 dir-ltr text-right font-mono bg-red-50/50">{(r.insuranceData.endorsements || []).reduce((a,b)=>a+b.amount,0).toLocaleString()}</td>
                                                    <td className="p-3 dir-ltr text-right font-mono font-bold text-purple-700 bg-gray-50">{(r.insuranceData.cost + (r.insuranceData.endorsements || []).reduce((a,b)=>a+b.amount,0)).toLocaleString()}</td>
                                                </tr>
                                            )}
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

    // --- DETAILS VIEW ---
    if (viewMode === 'details' && selectedRecord) {
        return (
            <div className="space-y-6 animate-fade-in bg-white rounded-2xl shadow-sm border border-gray-200 min-h-screen flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-l from-blue-600 to-blue-800 text-white p-6 rounded-t-2xl shadow-lg relative overflow-hidden">
                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-3 mb-2 opacity-90"><Building2 size={16}/><span className="text-sm">{selectedRecord.company}</span><span className="w-1 h-1 bg-white rounded-full"></span><span className="text-sm opacity-80">{selectedRecord.commodityGroup}</span></div>
                            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">{selectedRecord.fileNumber} <span className="text-sm font-normal bg-white/20 px-2 py-1 rounded border border-white/20">وضعیت: {selectedRecord.status}</span></h1>
                            <p className="text-blue-100 text-sm opacity-90">{selectedRecord.goodsName} | فروشنده: {selectedRecord.sellerName}</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleDeleteRecord(selectedRecord.id)} className="p-2 bg-white/10 hover:bg-red-500 hover:text-white rounded-lg transition-colors text-white/80" title="حذف پرونده"><Trash2 size={20}/></button>
                            <button onClick={() => { setViewMode('dashboard'); setSelectedRecord(null); }} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-white"><X size={20}/></button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-6 border-b flex gap-6 overflow-x-auto no-scrollbar">
                    <button onClick={() => setActiveTab('timeline')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'timeline' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>مراحل و تایم‌لاین</button>
                    <button onClick={() => setActiveTab('proforma')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'proforma' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>پروفرما و مجوزها</button>
                    <button onClick={() => setActiveTab('insurance')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'insurance' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>بیمه باربری</button>
                    <button onClick={() => setActiveTab('currency_purchase')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'currency_purchase' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>خرید و تخصیص ارز</button>
                    <button onClick={() => setActiveTab('shipping_docs')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'shipping_docs' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>اسناد حمل</button>
                    <button onClick={() => setActiveTab('inspection')} className={`pb-4 pt-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === 'inspection' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>بازرسی</button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 bg-gray-50">
                    
                    {/* INSPECTION TAB */}
                    {activeTab === 'inspection' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Microscope className="text-rose-600"/> مشخصات گواهی بازرسی</h3>
                                <div className="space-y-4">
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">شرکت بازرسی</label><input className="w-full border rounded-lg p-2 bg-gray-50" value={inspectionForm.inspectionCompany} onChange={e => setInspectionForm({...inspectionForm, inspectionCompany: e.target.value})} placeholder="نام شرکت..." /></div>
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">شماره گواهی</label><input className="w-full border rounded-lg p-2 bg-gray-50" value={inspectionForm.certificateNumber} onChange={e => setInspectionForm({...inspectionForm, certificateNumber: e.target.value})} placeholder="NO-1234..." /></div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 block mb-1">مبلغ کل قرارداد (ریال)</label>
                                        <input className="w-full border rounded-lg p-2 bg-gray-50 font-mono dir-ltr" value={formatNumberString(inspectionForm.totalInvoiceAmount?.toString() || '')} onChange={e => setInspectionForm({...inspectionForm, totalInvoiceAmount: deformatNumberString(e.target.value)})} placeholder="0" />
                                    </div>
                                    <button onClick={handleSaveInspectionGeneral} className="w-full bg-blue-600 text-white py-2 rounded-lg mt-4 hover:bg-blue-700">ذخیره اطلاعات کلی</button>
                                </div>
                            </div>
                            
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center justify-between">
                                    <span className="flex items-center gap-2"><ListFilter className="text-gray-600"/> لیست پرداخت‌ها (پارت‌ها)</span>
                                </h3>
                                
                                <div className="bg-gray-50 p-4 rounded-xl border mb-4">
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <input className="border rounded p-2 text-sm" placeholder="عنوان پارت (مثلا پارت 1)" value={newInspectionPayment.part} onChange={e => setNewInspectionPayment({...newInspectionPayment, part: e.target.value})} />
                                        <input className="border rounded p-2 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newInspectionPayment.amount?.toString())} onChange={e => setNewInspectionPayment({...newInspectionPayment, amount: deformatNumberString(e.target.value)})} />
                                        <input className="border rounded p-2 text-sm" placeholder="نام بانک" value={newInspectionPayment.bank} onChange={e => setNewInspectionPayment({...newInspectionPayment, bank: e.target.value})} />
                                        <div className="flex gap-2">
                                            <input type="date" className="border rounded p-2 text-sm flex-1" value={newInspectionPayment.date} onChange={e => setNewInspectionPayment({...newInspectionPayment, date: e.target.value})} />
                                            <button onClick={handleAddInspectionPayment} disabled={!newInspectionPayment.amount} className="bg-green-600 text-white px-3 rounded text-sm hover:bg-green-700"><Plus/></button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {(inspectionForm.payments || []).map(p => (
                                        <div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border hover:bg-white transition-colors">
                                            <div>
                                                <div className="font-bold text-sm text-gray-800">{p.part}</div>
                                                <div className="text-xs text-gray-500">{p.date} - {p.bank}</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono font-bold text-gray-700 dir-ltr">{formatCurrency(p.amount)}</span>
                                                <button onClick={() => handleDeleteInspectionPayment(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
                                            </div>
                                        </div>
                                    ))}
                                    {(inspectionForm.payments || []).length === 0 && <div className="text-center text-gray-400 text-sm py-4">هنوز پرداختی ثبت نشده است.</div>}
                                </div>

                                {/* Summary */}
                                <div className="mt-6 pt-4 border-t space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">مبلغ کل قرارداد (بستانکار):</span>
                                        <span className="font-bold font-mono dir-ltr">{formatCurrency(inspectionForm.totalInvoiceAmount || 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">جمع پرداخت‌ها (بدهکار):</span>
                                        <span className="font-bold font-mono dir-ltr text-green-600">{formatCurrency((inspectionForm.payments || []).reduce((acc, p) => acc + p.amount, 0))}</span>
                                    </div>
                                    <div className="flex justify-between text-base border-t pt-2 mt-2">
                                        <span className="font-bold text-gray-800">مانده حساب:</span>
                                        {(() => {
                                            const balance = (inspectionForm.totalInvoiceAmount || 0) - (inspectionForm.payments || []).reduce((acc, p) => acc + p.amount, 0);
                                            return <span className={`font-black font-mono dir-ltr ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>{balance === 0 ? 'تسویه' : formatCurrency(balance)}</span>;
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TIMELINE TAB */}
                    {activeTab === 'timeline' && (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            <div className="lg:col-span-3 space-y-4">
                                {STAGES.map((stageName, idx) => {
                                    const stageInfo = getStageData(selectedRecord, stageName);
                                    const isDone = stageInfo.isCompleted;
                                    return (
                                        <div key={idx} className={`relative pl-8 border-l-2 ${isDone ? 'border-blue-500' : 'border-gray-200'} pb-8 last:pb-0 group`}>
                                            <div onClick={() => handleOpenStage(stageName)} className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 cursor-pointer transition-colors ${isDone ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300 group-hover:border-blue-400'}`}></div>
                                            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleOpenStage(stageName)}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <h3 className={`font-bold text-lg ${isDone ? 'text-blue-700' : 'text-gray-600'}`}>{stageName}</h3>
                                                    {isDone && <CheckCircle2 className="text-green-500" size={20} />}
                                                </div>
                                                <div className="flex gap-6 text-sm text-gray-500">
                                                    {stageInfo.updatedAt > 0 && <span>آخرین بروزرسانی: {new Date(stageInfo.updatedAt).toLocaleDateString('fa-IR')}</span>}
                                                    {(stageInfo.costRial > 0 || stageInfo.costCurrency > 0) && (
                                                        <span className="flex items-center gap-1 text-gray-700 font-medium bg-gray-100 px-2 rounded"><Wallet size={12}/> هزینه: {formatCurrency(stageInfo.costRial)} {stageInfo.costCurrency > 0 && `/ ${stageInfo.costCurrency} ${stageInfo.currencyType}`}</span>
                                                    )}
                                                    {stageInfo.description && <span className="truncate max-w-[200px] italic">"{stageInfo.description}"</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            
                            {/* Cost Summary Sidebar */}
                            <div className="space-y-4">
                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2"><Calculator size={18}/> خلاصه هزینه‌ها</h3>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between"><span>ثبت سفارش (مجوز):</span><span className="font-mono">{formatCurrency(selectedRecord.stages[TradeStage.LICENSES]?.costRial || 0)}</span></div>
                                        <div className="flex justify-between"><span>بیمه:</span><span className="font-mono">{formatCurrency(selectedRecord.stages[TradeStage.INSURANCE]?.costRial || 0)}</span></div>
                                        <div className="flex justify-between"><span>بازرسی:</span><span className="font-mono">{formatCurrency(selectedRecord.stages[TradeStage.INSPECTION]?.costRial || 0)}</span></div>
                                        <div className="flex justify-between border-t pt-2 font-bold bg-blue-50 p-2 rounded"><span>جمع کل ریالی:</span><span className="font-mono">{formatCurrency(STAGES.reduce((acc, s) => acc + (selectedRecord.stages[s]?.costRial || 0), 0))}</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* PROFORMA TAB */}
                    {activeTab === 'proforma' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FileText className="text-blue-600"/> اطلاعات پایه و اقلام</h3>
                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        <div><label className="text-xs font-bold text-gray-500 block mb-1">شماره ثبت سفارش</label><input className="w-full border rounded-lg p-2 bg-gray-50" value={selectedRecord.registrationNumber || ''} onChange={e => handleUpdateProforma('registrationNumber', e.target.value)} /></div>
                                        <div><label className="text-xs font-bold text-gray-500 block mb-1">تاریخ صدور</label><input className="w-full border rounded-lg p-2 bg-gray-50 dir-ltr text-right" placeholder="1403/01/01" value={selectedRecord.registrationDate || ''} onChange={e => handleUpdateProforma('registrationDate', e.target.value)} /></div>
                                        <div><label className="text-xs font-bold text-gray-500 block mb-1">مهلت انقضا</label><input className="w-full border rounded-lg p-2 bg-gray-50 dir-ltr text-right" placeholder="1403/06/01" value={selectedRecord.registrationExpiry || ''} onChange={e => handleUpdateProforma('registrationExpiry', e.target.value)} /></div>
                                        <div><label className="text-xs font-bold text-gray-500 block mb-1">بانک عامل</label><select className="w-full border rounded-lg p-2 bg-gray-50" value={selectedRecord.operatingBank || ''} onChange={e => handleUpdateProforma('operatingBank', e.target.value)}><option value="">انتخاب...</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    </div>
                                    
                                    <div className="bg-gray-50 p-4 rounded-xl border mb-4">
                                        <h4 className="font-bold text-sm mb-3">افزودن کالا به لیست</h4>
                                        <div className="grid grid-cols-5 gap-2 items-end">
                                            <div className="col-span-2"><input className="w-full border rounded p-2 text-sm" placeholder="نام کالا" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></div>
                                            <div><input className="w-full border rounded p-2 text-sm" placeholder="وزن (KG)" type="number" value={newItem.weight || ''} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})} /></div>
                                            <div><input className="w-full border rounded p-2 text-sm" placeholder={`قیمت (${selectedRecord.mainCurrency})`} type="number" value={newItem.unitPrice || ''} onChange={e => setNewItem({...newItem, unitPrice: Number(e.target.value)})} /></div>
                                            <button onClick={handleAddItem} className="bg-blue-600 text-white p-2 rounded text-sm hover:bg-blue-700">افزودن</button>
                                        </div>
                                    </div>

                                    <table className="w-full text-sm text-right border-collapse">
                                        <thead className="bg-gray-100 text-gray-600"><tr><th className="p-2 border">ردیف</th><th className="p-2 border">شرح کالا</th><th className="p-2 border">وزن (KG)</th><th className="p-2 border">فی ({selectedRecord.mainCurrency})</th><th className="p-2 border">کل</th><th className="p-2 border">حذف</th></tr></thead>
                                        <tbody>
                                            {selectedRecord.items.map((item, idx) => (
                                                <tr key={item.id} className="hover:bg-gray-50">
                                                    <td className="p-2 border text-center">{idx + 1}</td>
                                                    <td className="p-2 border font-medium">{item.name}</td>
                                                    <td className="p-2 border dir-ltr font-mono">{formatNumberString(item.weight.toString())}</td>
                                                    <td className="p-2 border dir-ltr font-mono">{formatNumberString(item.unitPrice.toString())}</td>
                                                    <td className="p-2 border dir-ltr font-mono font-bold">{formatNumberString(item.totalPrice.toString())}</td>
                                                    <td className="p-2 border text-center"><button onClick={() => handleRemoveItem(item.id)} className="text-red-500"><X size={16}/></button></td>
                                                </tr>
                                            ))}
                                            <tr className="bg-blue-50 font-bold">
                                                <td colSpan={2} className="p-2 border text-center">جمع کل (FOB)</td>
                                                <td className="p-2 border dir-ltr font-mono">{formatNumberString(selectedRecord.items.reduce((a, b) => a + b.weight, 0).toString())}</td>
                                                <td className="p-2 border"></td>
                                                <td className="p-2 border dir-ltr font-mono text-blue-700">{formatNumberString(selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0).toString())}</td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Calculator className="text-gray-600"/> محاسبات مالی</h3>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center"><span className="text-sm text-gray-600">ارزش کالا (FOB):</span><span className="font-mono font-bold dir-ltr">{formatNumberString(selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0).toString())} {selectedRecord.mainCurrency}</span></div>
                                        <div className="flex justify-between items-center"><span className="text-sm text-gray-600">هزینه حمل (Freight):</span><input className="w-24 border rounded p-1 text-sm dir-ltr" value={selectedRecord.freightCost || 0} onChange={e => handleUpdateProforma('freightCost', Number(e.target.value))} /></div>
                                        <div className="border-t pt-2 flex justify-between items-center"><span className="text-sm font-bold text-gray-800">ارزش کل (CFR):</span><span className="font-mono font-black text-blue-700 dir-ltr">{formatNumberString((selectedRecord.items.reduce((a, b) => a + b.totalPrice, 0) + (selectedRecord.freightCost || 0)).toString())} {selectedRecord.mainCurrency}</span></div>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Banknote className="text-green-600"/> هزینه‌های مجوز (ریالی)</h3>
                                    <div className="bg-gray-50 p-3 rounded-lg border mb-3 space-y-2">
                                        <input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newLicenseTx.amount?.toString())} onChange={e => setNewLicenseTx({...newLicenseTx, amount: deformatNumberString(e.target.value)})} />
                                        <div className="flex gap-1">
                                            <input className="flex-1 border rounded p-1.5 text-sm" placeholder="بابت (مثلا کارمزد ثبت)" value={newLicenseTx.description} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})} />
                                            <button onClick={handleAddLicenseTx} disabled={!newLicenseTx.amount} className="bg-green-600 text-white px-3 rounded text-sm hover:bg-green-700"><Plus size={16}/></button>
                                        </div>
                                    </div>
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {(selectedRecord.licenseData?.transactions || []).map(tx => (
                                            <div key={tx.id} className="text-xs flex justify-between bg-gray-50 p-2 rounded border">
                                                <span>{tx.description}</span>
                                                <div className="flex gap-2 items-center"><span className="font-mono font-bold">{formatCurrency(tx.amount)}</span><button onClick={() => handleRemoveLicenseTx(tx.id)} className="text-red-500"><X size={12}/></button></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* INSURANCE TAB */}
                    {activeTab === 'insurance' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Shield className="text-indigo-600"/> مشخصات بیمه‌نامه</h3>
                                <div className="space-y-4">
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">شماره بیمه‌نامه</label><input className="w-full border rounded-lg p-2 bg-gray-50" value={insuranceForm.policyNumber} onChange={e => setInsuranceForm({...insuranceForm, policyNumber: e.target.value})} /></div>
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">شرکت بیمه</label><input className="w-full border rounded-lg p-2 bg-gray-50" value={insuranceForm.company} onChange={e => setInsuranceForm({...insuranceForm, company: e.target.value})} /></div>
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">هزینه پایه (ریال)</label><input className="w-full border rounded-lg p-2 bg-gray-50 font-mono dir-ltr" value={formatNumberString(insuranceForm.cost.toString())} onChange={e => setInsuranceForm({...insuranceForm, cost: deformatNumberString(e.target.value)})} /></div>
                                    <button onClick={handleSaveInsurance} className="w-full bg-blue-600 text-white py-2 rounded-lg mt-4 hover:bg-blue-700">ذخیره اطلاعات پایه</button>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-6 flex items-center justify-between"><span>الحاقیه‌ها</span><span className="text-sm bg-indigo-50 text-indigo-700 px-2 py-1 rounded">جمع کل: {formatCurrency(calculateInsuranceTotal())}</span></h3>
                                <div className="bg-gray-50 p-3 rounded-lg border mb-4 flex gap-2">
                                    <input className="flex-1 border rounded p-2 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newEndorsement.amount?.toString())} onChange={e => setNewEndorsement({...newEndorsement, amount: deformatNumberString(e.target.value)})} />
                                    <input className="flex-1 border rounded p-2 text-sm" placeholder="توضیحات" value={newEndorsement.description} onChange={e => setNewEndorsement({...newEndorsement, description: e.target.value})} />
                                    <button onClick={handleAddEndorsement} className="bg-indigo-600 text-white px-3 rounded hover:bg-indigo-700"><Plus/></button>
                                </div>
                                <div className="space-y-2">
                                    {(insuranceForm.endorsements || []).map(e => (
                                        <div key={e.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border">
                                            <span className="text-sm">{e.description || 'بدون توضیح'}</span>
                                            <div className="flex items-center gap-3"><span className="font-mono font-bold">{formatCurrency(e.amount)}</span><button onClick={() => handleDeleteEndorsement(e.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button></div>
                                        </div>
                                    ))}
                                    {(insuranceForm.endorsements || []).length === 0 && <div className="text-center text-gray-400 text-sm">بدون الحاقیه</div>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* CURRENCY TAB */}
                    {activeTab === 'currency_purchase' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Coins className="text-amber-500"/> مدیریت خرید ارز (پارت‌ها)</h3>
                                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mb-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                                        <div className="lg:col-span-2"><label className="text-xs text-gray-500 block mb-1">کارگزار / صرافی</label><input className="w-full border rounded p-2 text-sm" value={newCurrencyTranche.exchangeName} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, exchangeName: e.target.value})} placeholder="نام صرافی..." /></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">نوع ارز</label><select className="w-full border rounded p-2 text-sm bg-white" value={newCurrencyTranche.currencyType} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, currencyType: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">مبلغ ارزی</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newCurrencyTranche.amount?.toString())} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, amount: deformatNumberString(e.target.value)})} placeholder="0.00" /></div>
                                        <div><label className="text-xs text-gray-500 block mb-1">نرخ ریالی</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newCurrencyTranche.rate?.toString())} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, rate: deformatNumberString(e.target.value)})} placeholder="0" /></div>
                                        <div><button onClick={handleAddCurrencyTranche} disabled={!newCurrencyTranche.amount} className="w-full bg-amber-600 text-white p-2 rounded text-sm hover:bg-amber-700 flex justify-center gap-1"><Plus size={16}/> ثبت پارت</button></div>
                                        <div className="lg:col-span-6 flex gap-4 mt-2 border-t border-amber-200 pt-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={newCurrencyTranche.isDelivered} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, isDelivered: e.target.checked})} className="w-4 h-4 text-amber-600 rounded" /><span className="text-sm font-bold text-gray-700">تحویل شده؟</span></label>{newCurrencyTranche.isDelivered && <input type="date" className="border rounded p-1 text-sm" value={newCurrencyTranche.deliveryDate} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, deliveryDate: e.target.value})} />}</div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right border-collapse">
                                        <thead className="bg-gray-100 text-gray-600"><tr><th className="p-3">ردیف</th><th className="p-3">صرافی</th><th className="p-3 text-center">مبلغ ارزی</th><th className="p-3 text-center">نوع</th><th className="p-3 text-center">نرخ (ریال)</th><th className="p-3 text-center">معادل ریالی</th><th className="p-3 text-center">وضعیت تحویل</th><th className="p-3 text-center">عملیات</th></tr></thead>
                                        <tbody>
                                            {(currencyForm.tranches || []).map((t, idx) => (
                                                <tr key={t.id} className="hover:bg-gray-50">
                                                    <td className="p-3 text-center">{idx + 1}</td>
                                                    <td className="p-3 font-medium">{t.exchangeName}</td>
                                                    <td className="p-3 text-center dir-ltr font-mono">{formatNumberString(t.amount.toString())}</td>
                                                    <td className="p-3 text-center">{t.currencyType}</td>
                                                    <td className="p-3 text-center dir-ltr font-mono">{formatCurrency(t.rate || 0)}</td>
                                                    <td className="p-3 text-center dir-ltr font-mono font-bold text-gray-700">{formatCurrency((t.rate || 0) * t.amount)}</td>
                                                    <td className="p-3">{t.exchangeName} / {t.brokerName}</td>
                                                    <td className="p-3">{t.date}</td>
                                                    <td className="p-3 text-center"><span className={`px-2 py-1 rounded text-xs ${t.isDelivered ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.isDelivered ? `تحویل شده: ${t.deliveryDate}` : 'تحویل نشده'}</span></td>
                                                    <td className="p-3 text-center"><button onClick={() => handleRemoveTranche(t.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                                                </tr>
                                            ))}
                                            <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                                                <td colSpan={2} className="p-3 text-center">جمع کل</td>
                                                <td className="p-3 text-center dir-ltr font-mono text-lg">{formatNumberString((currencyForm.tranches || []).reduce((a,b)=>a+b.amount,0).toString())}</td>
                                                <td colSpan={2}></td>
                                                <td className="p-3 text-center dir-ltr font-mono text-lg text-amber-700">{formatCurrency((currencyForm.tranches || []).reduce((a,b)=>a+((b.rate||0)*b.amount),0))}</td>
                                                <td colSpan={2}></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SHIPPING DOCUMENTS TAB */}
                    {activeTab === 'shipping_docs' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileText className="text-cyan-600"/> ثبت اسناد حمل</h3>
                                    <div className="flex bg-gray-100 p-1 rounded-lg">
                                        <button onClick={() => setActiveShippingSubTab('Commercial Invoice')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeShippingSubTab === 'Commercial Invoice' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Invoice</button>
                                        <button onClick={() => setActiveShippingSubTab('Packing List')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeShippingSubTab === 'Packing List' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Packing</button>
                                        <button onClick={() => setActiveShippingSubTab('Bill of Lading')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeShippingSubTab === 'Bill of Lading' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>BL</button>
                                        <button onClick={() => setActiveShippingSubTab('Certificate of Origin')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeShippingSubTab === 'Certificate of Origin' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>CO</button>
                                    </div>
                                </div>

                                {/* Form Area */}
                                <div className="bg-cyan-50/50 p-6 rounded-xl border border-cyan-100 mb-6">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                        <div><label className="text-xs font-bold text-gray-500 block mb-1">{getDocLabel(activeShippingSubTab, 'number')}</label><input className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.documentNumber} onChange={e => setShippingDocForm({...shippingDocForm, documentNumber: e.target.value})} /></div>
                                        <div><label className="text-xs font-bold text-gray-500 block mb-1">{getDocLabel(activeShippingSubTab, 'date')}</label><input className="w-full border rounded p-2 text-sm bg-white dir-ltr text-right" value={shippingDocForm.documentDate} onChange={e => setShippingDocForm({...shippingDocForm, documentDate: e.target.value})} placeholder="YYYY/MM/DD" /></div>
                                        <div><label className="text-xs font-bold text-gray-500 block mb-1">شماره پارت (اختیاری)</label><input className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.partNumber} onChange={e => setShippingDocForm({...shippingDocForm, partNumber: e.target.value})} placeholder="مثلا Part 1" /></div>
                                        <div><label className="text-xs font-bold text-gray-500 block mb-1">وضعیت سند</label><select className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.status} onChange={e => setShippingDocForm({...shippingDocForm, status: e.target.value as DocStatus})}><option value="Draft">پیش‌نویس (Draft)</option><option value="Final">نهایی (Original)</option></select></div>
                                    </div>

                                    {/* Specific Fields based on Type */}
                                    {activeShippingSubTab === 'Commercial Invoice' && (
                                        <div className="bg-white p-4 rounded-xl border border-gray-200 mb-4">
                                            <div className="flex justify-between items-center mb-2"><h4 className="font-bold text-sm text-gray-700">اقلام اینویس</h4><div className="flex items-center gap-2"><span className="text-xs text-gray-500">ارز اینویس:</span><select className="border rounded text-xs p-1" value={shippingDocForm.currency} onChange={e => setShippingDocForm({...shippingDocForm, currency: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div></div>
                                            <div className="grid grid-cols-5 gap-2 items-end mb-2">
                                                <div className="col-span-2"><input className="w-full border rounded p-1.5 text-sm" placeholder="نام کالا" value={newInvoiceItem.name} onChange={e => setNewInvoiceItem({...newInvoiceItem, name: e.target.value})} /></div>
                                                <div><input className="w-full border rounded p-1.5 text-sm" placeholder="وزن (KG)" type="number" value={newInvoiceItem.weight || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, weight: Number(e.target.value)})} /></div>
                                                <div><input className="w-full border rounded p-1.5 text-sm" placeholder="قیمت کل" type="number" value={newInvoiceItem.totalPrice || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, totalPrice: Number(e.target.value)})} /></div>
                                                <button onClick={handleAddInvoiceItem} className="bg-cyan-600 text-white p-1.5 rounded text-sm hover:bg-cyan-700">افزودن</button>
                                            </div>
                                            <div className="space-y-1 max-h-32 overflow-y-auto border-t pt-2">
                                                {(shippingDocForm.invoiceItems || []).map(item => (
                                                    <div key={item.id} className="text-xs flex justify-between bg-gray-50 p-1.5 rounded border"><span>{item.name} ({item.weight} KG)</span><div className="flex gap-2"><b>{formatNumberString(item.totalPrice.toString())}</b><button onClick={() => handleRemoveInvoiceItem(item.id)} className="text-red-500"><X size={12}/></button></div></div>
                                                ))}
                                            </div>
                                            <div className="mt-2 pt-2 border-t flex justify-end gap-4 text-sm font-bold"><span>جمع کالا: {formatNumberString(getInvoiceTotal(shippingDocForm.invoiceItems || []).toString())}</span><div className="flex items-center gap-1"><span>هزینه حمل:</span><input className="w-20 border rounded p-0.5 text-center" value={shippingDocForm.freightCost} onChange={e => setShippingDocForm({...shippingDocForm, freightCost: Number(e.target.value)})} /></div></div>
                                        </div>
                                    )}

                                    {activeShippingSubTab === 'Packing List' && (
                                        <div className="grid grid-cols-3 gap-4 mb-4">
                                            <div><label className="text-xs font-bold text-gray-500 block mb-1">وزن خالص (NW)</label><input type="number" className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.netWeight || ''} onChange={e => setShippingDocForm({...shippingDocForm, netWeight: Number(e.target.value)})} /></div>
                                            <div><label className="text-xs font-bold text-gray-500 block mb-1">وزن ناخالص (GW)</label><input type="number" className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.grossWeight || ''} onChange={e => setShippingDocForm({...shippingDocForm, grossWeight: Number(e.target.value)})} /></div>
                                            <div><label className="text-xs font-bold text-gray-500 block mb-1">تعداد بسته</label><input type="number" className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.packagesCount || ''} onChange={e => setShippingDocForm({...shippingDocForm, packagesCount: Number(e.target.value)})} /></div>
                                        </div>
                                    )}

                                    {activeShippingSubTab === 'Bill of Lading' && (
                                        <div className="grid grid-cols-3 gap-4 mb-4">
                                            <div><label className="text-xs font-bold text-gray-500 block mb-1">نام کشتی / وسیله حمل</label><input className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.vesselName} onChange={e => setShippingDocForm({...shippingDocForm, vesselName: e.target.value})} /></div>
                                            <div><label className="text-xs font-bold text-gray-500 block mb-1">بندر بارگیری (POL)</label><input className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.portOfLoading} onChange={e => setShippingDocForm({...shippingDocForm, portOfLoading: e.target.value})} /></div>
                                            <div><label className="text-xs font-bold text-gray-500 block mb-1">بندر تخلیه (POD)</label><input className="w-full border rounded p-2 text-sm bg-white" value={shippingDocForm.portOfDischarge} onChange={e => setShippingDocForm({...shippingDocForm, portOfDischarge: e.target.value})} /></div>
                                        </div>
                                    )}

                                    {/* Attachments for Doc */}
                                    <div className="mb-4"><label className="text-xs font-bold text-gray-500 block mb-1">فایل ضمیمه</label><div className="flex items-center gap-2"><input type="file" ref={docFileInputRef} className="hidden" onChange={handleDocFileChange} /><button onClick={() => docFileInputRef.current?.click()} disabled={uploadingDocFile} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300">{uploadingDocFile ? '...' : 'انتخاب فایل'}</button><div className="flex gap-2 flex-wrap">{(shippingDocForm.attachments || []).map((a, i) => (<div key={i} className="bg-white border px-2 py-1 rounded text-xs flex items-center gap-1"><span className="truncate max-w-[100px]">{a.fileName}</span><button onClick={() => removeDocAttachment(i)} className="text-red-500"><X size={10}/></button></div>))}</div></div></div>

                                    <button onClick={handleSaveShippingDoc} className="w-full bg-cyan-600 text-white py-2 rounded-lg hover:bg-cyan-700 flex justify-center gap-2"><Save size={18}/> ذخیره سند</button>
                                </div>

                                {/* List of Docs */}
                                <div className="space-y-3">
                                    {(selectedRecord.shippingDocuments || []).map((doc) => (
                                        <div key={doc.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow relative group">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${doc.status === 'Final' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}><FileText size={24}/></div>
                                                    <div>
                                                        <h4 className="font-bold text-gray-800">{doc.type} <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 rounded-full">{doc.status === 'Final' ? 'نهایی (Original)' : 'پیش‌نویس'}</span></h4>
                                                        <div className="text-sm text-gray-600 flex gap-4 mt-1"><span>شماره: {doc.documentNumber}</span><span>تاریخ: {doc.documentDate}</span>{doc.partNumber && <span className="text-blue-600 bg-blue-50 px-1 rounded">{doc.partNumber}</span>}</div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <button onClick={() => handleDeleteShippingDoc(doc.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                                    <div className="flex gap-1">{(doc.attachments || []).map((a, i) => <a key={i} href={a.url} target="_blank" className="bg-gray-100 p-1 rounded hover:bg-blue-100 text-blue-600"><Paperclip size={14}/></a>)}</div>
                                                </div>
                                            </div>
                                            {/* Doc Specific Summary */}
                                            {doc.type === 'Commercial Invoice' && doc.amount && <div className="mt-3 pt-3 border-t text-sm flex justify-between"><span>مبلغ کل:</span><span className="font-mono font-bold">{formatNumberString(doc.amount.toString())} {doc.currency}</span></div>}
                                            {doc.type === 'Packing List' && doc.grossWeight && <div className="mt-3 pt-3 border-t text-sm flex gap-4 text-gray-600"><span>GW: {doc.grossWeight}</span><span>NW: {doc.netWeight}</span><span>Pkg: {doc.packagesCount}</span></div>}
                                        </div>
                                    ))}
                                    {(selectedRecord.shippingDocuments || []).length === 0 && <div className="text-center text-gray-400 py-6">هنوز سندی ثبت نشده است.</div>}
                                </div>

                                {/* Finalize Button */}
                                <div className="mt-8 border-t pt-4">
                                    <button onClick={handleUpdateFinalProforma} className="w-full bg-indigo-600 text-white py-3 rounded-xl hover:bg-indigo-700 shadow-md flex items-center justify-center gap-2"><RefreshCw size={18}/> بروزرسانی پروفرما و هزینه‌ها بر اساس اسناد نهایی</button>
                                    <p className="text-xs text-center text-gray-500 mt-2">با زدن این دکمه، لیست کالاهای اصلی پرونده و هزینه حمل با اطلاعات موجود در "اینوس‌های نهایی" جایگزین می‌شود.</p>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        );
    }

    // --- DASHBOARD VIEW ---
    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header & Actions */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><LayoutDashboard className="text-blue-600"/> داشبورد بازرگانی</h2>
                    <p className="text-gray-500 text-sm mt-1">مدیریت پرونده‌های واردات، صادرات و اسناد حمل</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="جستجو پرونده، فروشنده..." 
                            className="pl-4 pr-10 py-2.5 border rounded-xl text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button onClick={() => setViewMode('reports')} className="bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl font-medium hover:bg-gray-200 flex items-center gap-2 transition-colors"><PieIcon size={20}/> گزارشات</button>
                    <button onClick={() => setShowNewModal(true)} className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all"><Plus size={20}/> پرونده جدید</button>
                </div>
            </div>

            {/* Breadcrumbs / Navigation */}
            {(navLevel !== 'ROOT' || searchTerm) && (
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                    <button onClick={goRoot} className="hover:text-blue-600 flex items-center gap-1"><Home size={16}/> خانه</button>
                    {selectedCompany && <><ChevronLeft size={16} className="text-gray-400"/> <button onClick={() => goCompany(selectedCompany)} className={navLevel === 'COMPANY' ? "font-bold text-blue-600" : "hover:text-blue-600"}>{selectedCompany}</button></>}
                    {selectedGroup && <><ChevronLeft size={16} className="text-gray-400"/> <span className="font-bold text-blue-600">{selectedGroup}</span></>}
                    {searchTerm && <><ChevronLeft size={16} className="text-gray-400"/> <span>جستجو: "{searchTerm}"</span></>}
                </div>
            )}

            {/* Stats Cards (Only on Root) */}
            {navLevel === 'ROOT' && !searchTerm && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-xl shadow-lg shadow-blue-500/20">
                        <div className="text-blue-100 text-sm mb-1 font-medium">کل پرونده‌ها</div>
                        <div className="text-3xl font-bold">{records.length}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div><div className="text-gray-500 text-xs font-bold mb-1">در حال ثبت سفارش</div><div className="text-xl font-bold text-gray-800">{records.filter(r => r.stages[TradeStage.LICENSES]?.isCompleted && !r.stages[TradeStage.SHIPPING_DOCS]?.isCompleted).length}</div></div>
                        <div className="bg-yellow-50 p-2 rounded-lg text-yellow-600"><FileText size={20}/></div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div><div className="text-gray-500 text-xs font-bold mb-1">در حال حمل</div><div className="text-xl font-bold text-gray-800">{records.filter(r => r.stages[TradeStage.SHIPPING_DOCS]?.isCompleted && !r.stages[TradeStage.CLEARANCE_DOCS]?.isCompleted).length}</div></div>
                        <div className="bg-cyan-50 p-2 rounded-lg text-cyan-600"><Ship size={20}/></div>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                        <div><div className="text-gray-500 text-xs font-bold mb-1">تکمیل شده</div><div className="text-xl font-bold text-gray-800">{records.filter(r => r.stages[TradeStage.FINAL_COST]?.isCompleted).length}</div></div>
                        <div className="bg-green-50 p-2 rounded-lg text-green-600"><CheckCircle2 size={20}/></div>
                    </div>
                </div>
            )}

            {/* Grouped Data Grid (Companies / Commodity Groups) */}
            {!searchTerm && navLevel !== 'GROUP' && (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {getGroupedData().map((item, idx) => (
                        <div 
                            key={idx} 
                            onClick={() => item.type === 'company' ? goCompany(item.name) : goGroup(item.name)}
                            className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-1 h-full bg-blue-500 group-hover:w-2 transition-all"></div>
                            <div className="mb-4">
                                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    {item.type === 'company' ? <Building2 size={24}/> : <Package size={24}/>}
                                </div>
                            </div>
                            <h3 className="font-bold text-lg text-gray-800 mb-1">{item.name}</h3>
                            <p className="text-gray-500 text-sm">{item.count} پرونده</p>
                            <div className="mt-4 flex justify-end">
                                <ArrowLeft size={20} className="text-gray-300 group-hover:text-blue-500 group-hover:-translate-x-1 transition-all"/>
                            </div>
                        </div>
                    ))}
                    {getGroupedData().length === 0 && (
                        <div className="col-span-full text-center py-12 text-gray-400">
                            <FolderOpen size={48} className="mx-auto mb-4 opacity-20"/>
                            <p>هیچ موردی یافت نشد.</p>
                        </div>
                    )}
                </div>
            )}

            {/* File List (Records) */}
            {(searchTerm || navLevel === 'GROUP') && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {getFilteredRecords().map(record => (
                        <div key={record.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all group overflow-hidden flex flex-col">
                             <div className="p-5 flex-1">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-gray-100 p-2 rounded-lg text-gray-600"><FileText size={20}/></div>
                                        <div>
                                            <h3 className="font-bold text-gray-800">{record.fileNumber}</h3>
                                            <span className="text-[10px] text-gray-500">{record.startDate.split('T')[0]}</span>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] px-2 py-1 rounded-full border ${record.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{record.status === 'Active' ? 'فعال' : 'تکمیل شده'}</span>
                                </div>
                                <div className="space-y-2 mb-4">
                                    <div className="text-sm text-gray-600 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span><span className="font-bold">کالا:</span> {record.goodsName}</div>
                                    <div className="text-sm text-gray-600 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span><span className="font-bold">فروشنده:</span> {record.sellerName}</div>
                                    <div className="text-sm text-gray-600 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-gray-300 rounded-full"></span><span className="font-bold">ارزش:</span> <span className="dir-ltr font-mono">{formatNumberString(record.items.reduce((a,b)=>a+b.totalPrice,0).toString())} {record.mainCurrency}</span></div>
                                </div>
                             </div>
                             <div className="bg-gray-50 p-3 border-t border-gray-100 flex justify-between items-center">
                                <div className="flex gap-1">
                                    {/* Mini Progress Indicators */}
                                    <div className={`w-2 h-2 rounded-full ${record.stages[TradeStage.LICENSES]?.isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} title="مجوز"></div>
                                    <div className={`w-2 h-2 rounded-full ${record.stages[TradeStage.INSURANCE]?.isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} title="بیمه"></div>
                                    <div className={`w-2 h-2 rounded-full ${record.stages[TradeStage.CURRENCY_PURCHASE]?.isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} title="ارز"></div>
                                    <div className={`w-2 h-2 rounded-full ${record.stages[TradeStage.SHIPPING_DOCS]?.isCompleted ? 'bg-green-500' : 'bg-gray-300'}`} title="حمل"></div>
                                </div>
                                <button onClick={() => { setSelectedRecord(record); setViewMode('details'); setActiveTab('timeline'); }} className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">مشاهده و مدیریت <ArrowLeft size={16}/></button>
                             </div>
                        </div>
                    ))}
                    {getFilteredRecords().length === 0 && (
                        <div className="col-span-full text-center py-12 text-gray-400">
                            <FileText size={48} className="mx-auto mb-4 opacity-20"/>
                            <p>هیچ پرونده‌ای یافت نشد.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Create Modal */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg text-gray-800">ایجاد پرونده بازرگانی جدید</h3>
                            <button onClick={() => setShowNewModal(false)}><X size={20} className="text-gray-400 hover:text-red-500"/></button>
                        </div>
                        <div className="space-y-4">
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">شرکت (صاحب پرونده)</label><select className="w-full border rounded-xl px-4 py-2.5 bg-gray-50" value={newRecordCompany} onChange={e => setNewRecordCompany(e.target.value)}><option value="">انتخاب شرکت...</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">شماره پرونده / سفارش</label><input autoFocus className="w-full border rounded-xl px-4 py-2.5" value={newFileNumber} onChange={e => setNewFileNumber(e.target.value)} placeholder="مثلا 1403-A-101" /></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">نام کالا (کلی)</label><input className="w-full border rounded-xl px-4 py-2.5" value={newGoodsName} onChange={e => setNewGoodsName(e.target.value)} placeholder="مثلا قطعات یدکی دستگاه..." /></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">فروشنده (Seller)</label><input className="w-full border rounded-xl px-4 py-2.5" value={newSellerName} onChange={e => setNewSellerName(e.target.value)} /></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">گروه کالایی</label><select className="w-full border rounded-xl px-4 py-2.5 bg-gray-50" value={newCommodityGroup} onChange={e => setNewCommodityGroup(e.target.value)}><option value="">انتخاب گروه...</option>{commodityGroups.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">ارز پایه</label><select className="w-full border rounded-xl px-4 py-2.5 bg-gray-50" value={newMainCurrency} onChange={e => setNewMainCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                            <button onClick={handleCreateRecord} disabled={!newFileNumber || !newGoodsName || !newRecordCompany} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg mt-2 disabled:opacity-50">ایجاد پرونده</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stage Detail Modal */}
            {editingStage && (
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
                            <h3 className="font-bold text-lg text-gray-800">جزئیات مرحله: <span className="text-blue-600">{editingStage}</span></h3>
                            <button onClick={() => setEditingStage(null)}><X size={24} className="text-gray-400 hover:text-red-500"/></button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border">
                                <input type="checkbox" id="stageCompleted" checked={stageFormData.isCompleted} onChange={e => setStageFormData({...stageFormData, isCompleted: e.target.checked})} className="w-5 h-5 text-green-600 rounded cursor-pointer" />
                                <label htmlFor="stageCompleted" className="font-bold text-gray-700 cursor-pointer">این مرحله تکمیل شده است</label>
                            </div>

                            {/* Specific Fields per Stage */}
                            {editingStage === TradeStage.ALLOCATION_QUEUE && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">تاریخ ورود به صف</label><input className="w-full border rounded p-2 text-sm dir-ltr text-right" value={stageFormData.queueDate || ''} onChange={e => setStageFormData({...stageFormData, queueDate: e.target.value})} placeholder="YYYY/MM/DD"/></div>
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">نرخ ارز (تخمینی)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={stageFormData.currencyRate || ''} onChange={e => setStageFormData({...stageFormData, currencyRate: Number(e.target.value)})} /></div>
                                </div>
                            )}

                            {editingStage === TradeStage.ALLOCATION_APPROVED && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">تاریخ تخصیص</label><input className="w-full border rounded p-2 text-sm dir-ltr text-right" value={stageFormData.allocationDate || ''} onChange={e => setStageFormData({...stageFormData, allocationDate: e.target.value})} placeholder="YYYY/MM/DD"/></div>
                                    <div><label className="text-xs font-bold text-gray-500 block mb-1">مهلت انقضا</label><input className="w-full border rounded p-2 text-sm dir-ltr text-right" value={stageFormData.allocationExpiry || ''} onChange={e => setStageFormData({...stageFormData, allocationExpiry: e.target.value})} placeholder="YYYY/MM/DD"/></div>
                                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 block mb-1">کد تخصیص (فیش)</label><input className="w-full border rounded p-2 text-sm" value={stageFormData.allocationCode || ''} onChange={e => setStageFormData({...stageFormData, allocationCode: e.target.value})} /></div>
                                </div>
                            )}

                            {/* Common Fields */}
                            <div><label className="text-sm font-bold text-gray-700 block mb-1">توضیحات تکمیلی</label><textarea rows={3} className="w-full border rounded-xl p-3" value={stageFormData.description} onChange={e => setStageFormData({...stageFormData, description: e.target.value})} placeholder="یادداشت‌های مربوط به این مرحله..." /></div>
                            
                            <div>
                                <label className="text-sm font-bold text-gray-700 block mb-2">فایل‌های ضمیمه</label>
                                <div className="space-y-2 mb-3">
                                    {(stageFormData.attachments || []).map((att, idx) => (
                                        <div key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded border text-sm">
                                            <a href={att.url} target="_blank" className="text-blue-600 truncate max-w-[200px] hover:underline">{att.fileName}</a>
                                            <button onClick={() => removeStageAttachment(idx)} className="text-red-500"><X size={16}/></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleStageFileChange} />
                                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadingStageFile} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200 border">{uploadingStageFile ? 'در حال آپلود...' : 'افزودن فایل'}</button>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                            <button onClick={() => setEditingStage(null)} className="px-6 py-2 rounded-xl text-gray-600 hover:bg-gray-200">انصراف</button>
                            <button onClick={handleSaveStage} className="px-8 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg">ذخیره تغییرات</button>
                        </div>
                    </div>
                 </div>
            )}
        </div>
    );
};

export default TradeModule;
