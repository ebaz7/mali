
import React, { useState, useEffect, useRef } from 'react';
import { User, TradeRecord, TradeStage, TradeItem, SystemSettings, InsuranceEndorsement, CurrencyPurchaseData, TradeTransaction, CurrencyTranche, TradeStageData, ShippingDocument, ShippingDocType, DocStatus, InvoiceItem } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, deleteTradeRecord, getSettings, uploadFile } from '../services/storageService';
import { generateUUID, formatCurrency, formatNumberString, deformatNumberString, parsePersianDate, getCurrentShamsiDate } from '../constants';
import { Container, Plus, Search, CheckCircle2, Circle, Save, Trash2, X, Package, ArrowRight, History, Banknote, Coins, Filter, Wallet, FileSpreadsheet, Shield, LayoutDashboard, Printer, FileDown, PieChart as PieIcon, BarChart3, ListFilter, Paperclip, Upload, Calendar, Building2, Layers, FolderOpen, ChevronLeft, ArrowLeft, Home, Calculator, Ship, FileText, Scale, Stamp, AlertCircle } from 'lucide-react';
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
type ReportType = 'general' | 'allocation_queue' | 'allocated' | 'currency' | 'insurance' | 'shipping' | 'customs';

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
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Form States
    const [showNewModal, setShowNewModal] = useState(false);
    const [newFileNumber, setNewFileNumber] = useState('');
    const [newGoodsName, setNewGoodsName] = useState('');
    const [newSellerName, setNewSellerName] = useState('');
    const [newCommodityGroup, setNewCommodityGroup] = useState('');
    const [newMainCurrency, setNewMainCurrency] = useState('EUR');
    const [newRecordCompany, setNewRecordCompany] = useState('');
    
    const [activeTab, setActiveTab] = useState<'timeline' | 'proforma' | 'insurance' | 'currency_purchase' | 'shipping_docs'>('timeline');
    
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
            if (selectedRecord.insuranceData) {
                setInsuranceForm(selectedRecord.insuranceData);
            } else {
                setInsuranceForm({ policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] });
            }
            
            const curData = selectedRecord.currencyPurchaseData || { 
                payments: [], purchasedAmount: 0, purchasedCurrencyType: selectedRecord.mainCurrency || 'EUR', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: selectedRecord.mainCurrency || 'EUR', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: []
            };
            if (!curData.tranches) curData.tranches = [];
            setCurrencyForm(curData);
            
            setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
            setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });
            setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });

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
        if (!selectedRecord?.shippingDocuments) return { totalAmount: 0, totalFreight: 0, finalItems: [] };
        const finalInvoices = selectedRecord.shippingDocuments.filter(d => d.type === 'Commercial Invoice' && d.status === 'Final');
        
        let totalAmount = 0;
        let totalFreight = 0;
        let allItems: InvoiceItem[] = [];

        finalInvoices.forEach(inv => {
            totalAmount += (inv.amount || 0);
            totalFreight += (inv.freightCost || 0);
            if (inv.invoiceItems) {
                allItems = [...allItems, ...inv.invoiceItems];
            }
        });

        // Group items by name (simple aggregation) if needed, or just return flat list
        // Returning flat list of items for now as "Final Items"
        return { totalAmount, totalFreight, finalItems: allItems };
    };

    const handleUpdateFinalProforma = async () => {
        if (!selectedRecord) return;
        const { totalFreight, finalItems } = getFinalAggregation();
        
        if (finalItems.length === 0) {
            alert("هیچ آیتمی در اینویس‌های نهایی یافت نشد.");
            return;
        }

        if (confirm("آیا مطمئن هستید؟ لیست کالاهای پرونده (پروفرما) و هزینه حمل با اطلاعات جمع‌آوری شده از اینویس‌های نهایی جایگزین خواهد شد.")) {
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
                freightCost: totalFreight
            };

            await updateTradeRecord(updatedRecord);
            setSelectedRecord(updatedRecord);
            alert("پروفرما نهایی با موفقیت بروزرسانی شد.");
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
        switch (activeReport) {
            case 'allocation_queue': return base.filter(r => r.stages[TradeStage.ALLOCATION_QUEUE]?.isCompleted === false && r.stages[TradeStage.INSURANCE]?.isCompleted === true);
            case 'allocated': return base.filter(r => r.stages[TradeStage.ALLOCATION_APPROVED]?.isCompleted === true);
            case 'shipping': return base.filter(r => r.stages[TradeStage.SHIPPING_DOCS]?.isCompleted === false && r.stages[TradeStage.CURRENCY_PURCHASE]?.isCompleted === true);
            default: return base;
        }
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
                    <button onClick={() => setActiveReport('general')} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'general' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><ListFilter size={18}/> گزارش جامع</button>
                    <button onClick={() => setActiveReport('allocation_queue')} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'allocation_queue' ? 'bg-purple-50 text-purple-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><History size={18}/> در صف تخصیص</button>
                    <button onClick={() => setActiveReport('allocated')} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'allocated' ? 'bg-green-50 text-green-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><CheckCircle2 size={18}/> تخصیص یافته</button>
                    <button onClick={() => setActiveReport('currency')} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'currency' ? 'bg-amber-50 text-amber-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Coins size={18}/> خرید ارز</button>
                    <button onClick={() => setActiveReport('insurance')} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'insurance' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Shield size={18}/> بیمه و الحاقیه‌ها</button>
                    <button onClick={() => setActiveReport('shipping')} className={`p-3 rounded-lg text-right text-sm flex items-center gap-3 transition-colors ${activeReport === 'shipping' ? 'bg-cyan-50 text-cyan-700 font-bold' : 'hover:bg-gray-50 text-gray-600'}`}><Container size={18}/> در حال حمل</button>
                    <div className="mt-auto pt-4 border-t"><button onClick={() => setViewMode('dashboard')} className="w-full p-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center gap-2 text-sm"><Home size={16}/> بازگشت به داشبورد</button></div>
                </div>

                <div className="flex-1 p-8 overflow-y-auto">
                    <ReportHeader title={activeReport === 'general' ? 'گزارش جامع' : activeReport === 'allocation_queue' ? 'پرونده‌های در صف تخصیص' : activeReport === 'currency' ? 'گزارش ارزی' : 'گزارش'} icon={FileSpreadsheet} />
                    <div id="report-table-container" className="bg-white p-6 rounded-xl border shadow-sm print:shadow-none print:border-none print:p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                <thead className="bg-gray-800 text-white font-bold text-xs print:bg-gray-200 print:text-black">
                                    {activeReport === 'general' && (<tr><th className="p-3">پرونده</th><th className="p-3">کالا</th><th className="p-3">فروشنده</th><th className="p-3">شرکت</th><th className="p-3 text-center">وضعیت</th></tr>)}
                                    {activeReport === 'allocation_queue' && (<tr><th className="p-3">پرونده</th><th className="p-3">ثبت سفارش</th><th className="p-3">مبلغ ارزی</th><th className="p-3">بانک عامل</th><th className="p-3">تاریخ ورود به صف</th><th className="p-3">تعداد روز در صف</th><th className="p-3">نرخ ارز (تخمینی)</th><th className="p-3">معادل ریالی</th></tr>)}
                                    {activeReport === 'allocated' && (<tr><th className="p-3">پرونده</th><th className="p-3">ثبت سفارش</th><th className="p-3">مبلغ ارزی</th><th className="p-3">بانک</th><th className="p-3">تاریخ تخصیص</th><th className="p-3">مهلت انقضا</th><th className="p-3">مانده (روز)</th><th className="p-3">کد تخصیص</th></tr>)}
                                    {activeReport === 'currency' && (<tr><th className="p-3 w-48">پرونده / ثبت سفارش</th><th className="p-3 text-center">مبلغ</th><th className="p-3 text-center">ارز</th><th className="p-3 text-center">نرخ ریالی</th><th className="p-3 text-center">معادل ریالی</th><th className="p-3">کارگزار/صرافی</th><th className="p-3">تاریخ خرید</th><th className="p-3 text-center">وضعیت تحویل</th></tr>)}
                                    {activeReport === 'insurance' && (<tr><th className="p-3">پرونده</th><th className="p-3">شماره بیمه</th><th className="p-3">شرکت بیمه</th><th className="p-3">هزینه پایه</th><th className="p-3">جمع الحاقیه</th><th className="p-3">جمع کل</th></tr>)}
                                </thead>
                                <tbody className="divide-y divide-gray-200 print:divide-gray-400">
                                    {reportData.map(r => (
                                        <React.Fragment key={r.id}>
                                            {activeReport === 'general' && (<tr className="hover:bg-gray-50"><td className="p-3 font-bold">{r.fileNumber}</td><td className="p-3">{r.goodsName}</td><td className="p-3">{r.sellerName}</td><td className="p-3">{r.company}</td><td className="p-3 text-center">{r.status}</td></tr>)}
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
                                                    <td className="p-3 font-bold">{r.fileNumber}</td>
                                                    <td className="p-3">{r.insuranceData.policyNumber}</td>
                                                    <td className="p-3">{r.insuranceData.company}</td>
                                                    <td className="p-3 dir-ltr text-right font-mono">{formatCurrency(r.insuranceData.cost)}</td>
                                                    <td className="p-3 dir-ltr text-right font-mono">{(r.insuranceData.endorsements || []).reduce((a,b)=>a+b.amount,0)}</td>
                                                    <td className="p-3 dir-ltr text-right font-mono font-bold text-purple-700">{(r.insuranceData.cost + (r.insuranceData.endorsements || []).reduce((a,b)=>a+b.amount,0)).toLocaleString()}</td>
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

    // --- DASHBOARD (HIERARCHY VIEW) ---
    if (viewMode === 'dashboard') {
        const filteredRecords = getFilteredRecords();
        const groupedData = searchTerm ? [] : getGroupedData();
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
                                <div><label className="block text-sm font-bold mb-1">گروه کالایی</label><select className="w-full border rounded-lg p-2" value={newCommodityGroup} onChange={e => setNewCommodityGroup(e.target.value)}><option value="">انتخاب...</option>{commodityGroups.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                <div><label className="block text-sm font-bold mb-1">فروشنده</label><input className="w-full border rounded-lg p-2" value={newSellerName} onChange={e => setNewSellerName(e.target.value)} /></div>
                                <div><label className="block text-sm font-bold mb-1">ارز پایه</label><select className="w-full border rounded-lg p-2" value={newMainCurrency} onChange={e => setNewMainCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                                <div className="flex justify-end gap-3 mt-6"><button onClick={() => setShowNewModal(false)} className="px-4 py-2 text-gray-600">انصراف</button><button onClick={handleCreateRecord} className="px-4 py-2 bg-blue-600 text-white rounded-lg">ایجاد</button></div>
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto"><h2 className="text-xl font-bold text-gray-800 whitespace-nowrap">داشبورد بازرگانی</h2><button onClick={() => setShowNewModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors whitespace-nowrap"><Plus size={16} /> پرونده جدید</button></div>
                    <div className="flex-1 w-full md:max-w-xl mx-4 relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" placeholder="جستجوی سریع..." className="w-full pl-4 pr-10 py-2.5 border rounded-xl text-sm outline-none bg-gray-50 focus:bg-white focus:border-blue-500 transition-colors" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
                    <button onClick={() => setViewMode('reports')} className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 flex items-center gap-2"><PieIcon size={18}/> مرکز گزارشات</button>
                </div>
                {!searchTerm && (<div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border"><button onClick={goRoot} className={`flex items-center gap-1 hover:text-blue-600 ${navLevel === 'ROOT' ? 'font-bold text-blue-600' : ''}`}><Home size={14}/> خانه (شرکت‌ها)</button>{navLevel !== 'ROOT' && <><ArrowLeft size={12} className="text-gray-400"/> <button onClick={() => selectedCompany && goCompany(selectedCompany)} className={`hover:text-blue-600 ${navLevel === 'COMPANY' ? 'font-bold text-blue-600' : ''}`}>{selectedCompany}</button></>}{navLevel === 'GROUP' && <><ArrowLeft size={12} className="text-gray-400"/> <span className="font-bold text-blue-600">{selectedGroup}</span></>}</div>)}
                <div className="min-h-[300px]">
                    {!searchTerm && navLevel === 'ROOT' && (<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{groupedData.map((item, idx) => (<div key={idx} onClick={() => goCompany(item.name)} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group"><div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors"><Building2 size={32}/></div><h3 className="font-bold text-lg text-gray-800 text-center">{item.name}</h3><span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{item.count} پرونده</span></div>))}{groupedData.length === 0 && <div className="col-span-full text-center text-gray-400 py-10">هیچ پرونده‌ای ثبت نشده است.</div>}</div>)}
                    {!searchTerm && navLevel === 'COMPANY' && (<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"><div onClick={goRoot} className="bg-gray-100 p-6 rounded-2xl border border-dashed border-gray-300 hover:bg-gray-200 cursor-pointer flex flex-col items-center justify-center gap-2 text-gray-500"><ArrowRight size={24}/><span className="text-sm font-bold">بازگشت</span></div>{groupedData.map((item, idx) => (<div key={idx} onClick={() => goGroup(item.name)} className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:border-amber-300 transition-all cursor-pointer flex flex-col items-center justify-center gap-3 group"><div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors"><FolderOpen size={32}/></div><h3 className="font-bold text-lg text-gray-800 text-center">{item.name}</h3><span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{item.count} پرونده</span></div>))}</div>)}
                    {(searchTerm || navLevel === 'GROUP') && (<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{!searchTerm && <div onClick={() => goCompany(selectedCompany!)} className="bg-gray-100 p-4 rounded-xl border border-dashed border-gray-300 hover:bg-gray-200 cursor-pointer flex flex-col items-center justify-center gap-2 text-gray-500 h-[180px]"><ArrowRight size={24}/><span className="text-sm font-bold">بازگشت</span></div>}{filteredRecords.map(record => (<div key={record.id} onClick={() => { setSelectedRecord(record); setViewMode('details'); setActiveTab('timeline'); }} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between h-[180px]"><div className="absolute top-0 right-0 w-1 h-full bg-blue-500 group-hover:w-2 transition-all"></div><div><div className="flex justify-between items-start mb-2"><h3 className="font-bold text-gray-800 text-lg">{record.fileNumber}</h3><span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">{record.mainCurrency}</span></div><div className="space-y-1"><p className="text-sm font-medium text-gray-700 truncate" title={record.goodsName}>{record.goodsName}</p><p className="text-xs text-gray-500 truncate" title={record.sellerName}>{record.sellerName}</p>{record.registrationNumber && <p className="text-xs text-gray-400 font-mono">ثبت: {record.registrationNumber}</p>}</div></div><div className="flex justify-between items-end border-t pt-3 mt-2"><span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded truncate max-w-[100px]">{record.company}</span><div className="flex gap-1">{record.stages[TradeStage.ALLOCATION_APPROVED]?.isCompleted && <span title="تخصیص یافته" className="w-2 h-2 rounded-full bg-green-500"></span>}{record.stages[TradeStage.CURRENCY_PURCHASE]?.isCompleted && <span title="ارز خریداری شده" className="w-2 h-2 rounded-full bg-blue-500"></span>}{record.stages[TradeStage.SHIPPING_DOCS]?.isCompleted && <span title="در حال حمل" className="w-2 h-2 rounded-full bg-amber-500"></span>}</div></div></div>))}{filteredRecords.length === 0 && <div className="col-span-full text-center text-gray-400 py-12">موردی یافت نشد.</div>}</div>)}
                </div>
            </div>
        );
    }

    // --- Details View ---
    if (viewMode === 'details' && selectedRecord) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-100px)] animate-fade-in relative">
                {editingStage && (
                    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 flex flex-col max-h-[90vh]">
                            <div className="flex justify-between items-center mb-4 border-b pb-2"><h3 className="font-bold text-lg text-gray-800">جزئیات مرحله: {editingStage}</h3><button onClick={() => setEditingStage(null)} className="text-gray-400 hover:text-red-500"><X size={20}/></button></div>
                            <div className="space-y-4 overflow-y-auto flex-1 p-1">
                                <div className="flex items-center gap-2 mb-4"><input type="checkbox" checked={stageFormData.isCompleted || false} onChange={e => setStageFormData({...stageFormData, isCompleted: e.target.checked})} className="w-5 h-5 text-green-600 rounded focus:ring-green-500" id="stage-completed"/><label htmlFor="stage-completed" className="font-bold text-gray-700 cursor-pointer">این مرحله تکمیل شده است</label></div>
                                
                                {/* Specific Inputs for Allocation Queue */}
                                {editingStage === TradeStage.ALLOCATION_QUEUE && (
                                    <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 space-y-3">
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ ورود به صف</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="YYYY/MM/DD" value={stageFormData.queueDate || ''} onChange={e => setStageFormData({...stageFormData, queueDate: e.target.value})} /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">نرخ ارز مبادله‌ای/نیمایی (ریال)</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" value={formatNumberString(stageFormData.currencyRate?.toString())} onChange={e => setStageFormData({...stageFormData, currencyRate: deformatNumberString(e.target.value)})} /></div>
                                    </div>
                                )}
                                
                                {/* Specific Inputs for Allocation Approved */}
                                {editingStage === TradeStage.ALLOCATION_APPROVED && (
                                    <div className="bg-green-50 p-3 rounded-lg border border-green-100 space-y-3">
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ تخصیص</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="YYYY/MM/DD" value={stageFormData.allocationDate || ''} onChange={e => setStageFormData({...stageFormData, allocationDate: e.target.value})} /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مهلت انقضا</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="YYYY/MM/DD" value={stageFormData.allocationExpiry || ''} onChange={e => setStageFormData({...stageFormData, allocationExpiry: e.target.value})} /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">کد تخصیص (فیش)</label><input className="w-full border rounded p-1.5 text-sm" value={stageFormData.allocationCode || ''} onChange={e => setStageFormData({...stageFormData, allocationCode: e.target.value})} /></div>
                                    </div>
                                )}

                                <div className="space-y-1"><label className="text-sm font-bold text-gray-600">توضیحات / اقدامات انجام شده</label><textarea className="w-full border rounded-lg p-2 text-sm h-24" value={stageFormData.description || ''} onChange={e => setStageFormData({...stageFormData, description: e.target.value})} placeholder="توضیحات تکمیلی..." /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">هزینه ریالی (اگر دارد)</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" value={formatNumberString(stageFormData.costRial?.toString())} onChange={e => setStageFormData({...stageFormData, costRial: deformatNumberString(e.target.value)})} placeholder="0"/></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">هزینه ارزی (اگر دارد)</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" value={formatNumberString(stageFormData.costCurrency?.toString())} onChange={e => setStageFormData({...stageFormData, costCurrency: deformatNumberString(e.target.value)})} placeholder="0"/></div>
                                </div>
                                <div><div className="flex justify-between items-center mb-2"><label className="text-sm font-bold text-gray-600 flex items-center gap-1"><Paperclip size={14}/> فایل‌های ضمیمه</label><button onClick={() => fileInputRef.current?.click()} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1" disabled={uploadingStageFile}>{uploadingStageFile ? '...' : <><Upload size={12}/> افزودن</>}</button><input type="file" ref={fileInputRef} className="hidden" onChange={handleStageFileChange} /></div><div className="space-y-1 bg-gray-50 p-2 rounded-lg border min-h-[50px]">{stageFormData.attachments?.map((file, idx) => (<div key={idx} className="flex justify-between items-center bg-white p-2 rounded border text-xs"><a href={file.url} target="_blank" className="text-blue-600 truncate max-w-[200px] hover:underline">{file.fileName}</a><button onClick={() => removeStageAttachment(idx)} className="text-red-500 hover:text-red-700"><Trash2 size={12}/></button></div>))}{(!stageFormData.attachments || stageFormData.attachments.length === 0) && <div className="text-center text-gray-400 text-xs italic py-2">بدون فایل ضمیمه</div>}</div></div>
                            </div>
                            <div className="pt-4 border-t mt-4 flex justify-end gap-2"><button onClick={() => setEditingStage(null)} className="px-4 py-2 text-gray-600 text-sm">انصراف</button><button onClick={handleSaveStage} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">ذخیره تغییرات</button></div>
                        </div>
                    </div>
                )}

                <div className="bg-slate-800 text-white p-4 flex justify-between items-center shadow-md z-10">
                    <div className="flex items-center gap-4"><button onClick={() => { setSelectedRecord(null); setViewMode('dashboard'); }} className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg transition-colors"><ArrowRight size={20} /></button><div><h2 className="font-bold text-lg flex items-center gap-2"><FileSpreadsheet size={20} className="text-blue-400"/> پرونده: {selectedRecord.fileNumber}</h2><div className="text-xs text-slate-400 flex gap-3 mt-1"><span>{selectedRecord.goodsName}</span><span>|</span><span>{selectedRecord.sellerName}</span><span>|</span><span>{selectedRecord.company}</span></div></div></div>
                    <div className="flex gap-2"><button onClick={() => handleDeleteRecord(selectedRecord.id)} className="bg-red-500/20 hover:bg-red-500 text-red-100 p-2 rounded-lg transition-colors"><Trash2 size={18} /></button></div>
                </div>
                
                <div className="flex flex-1 overflow-hidden">
                    <div className="w-64 bg-slate-50 border-l border-gray-200 flex flex-col">
                        <button onClick={() => setActiveTab('timeline')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'timeline' ? 'bg-white border-r-4 border-r-blue-600 text-blue-700 font-bold shadow-sm' : 'text-gray-600'}`}><LayoutDashboard size={18} /> نمای کلی و مراحل</button>
                        <button onClick={() => setActiveTab('proforma')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'proforma' ? 'bg-white border-r-4 border-r-amber-500 text-amber-700 font-bold shadow-sm' : 'text-gray-600'}`}><FileSpreadsheet size={18} /> پروفرما و کالاها</button>
                        <button onClick={() => setActiveTab('insurance')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'insurance' ? 'bg-white border-r-4 border-r-purple-500 text-purple-700 font-bold shadow-sm' : 'text-gray-600'}`}><Shield size={18} /> بیمه و الحاقیه‌ها</button>
                        <button onClick={() => setActiveTab('currency_purchase')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'currency_purchase' ? 'bg-white border-r-4 border-r-green-500 text-green-700 font-bold shadow-sm' : 'text-gray-600'}`}><Coins size={18} /> خرید و تحویل ارز</button>
                        <button onClick={() => setActiveTab('shipping_docs')} className={`p-4 text-right hover:bg-white border-b border-gray-100 transition-colors flex items-center gap-3 ${activeTab === 'shipping_docs' ? 'bg-white border-r-4 border-r-cyan-500 text-cyan-700 font-bold shadow-sm' : 'text-gray-600'}`}><Container size={18} /> اسناد حمل</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                        {activeTab === 'timeline' && (
                             <div className="flex flex-col items-center justify-start h-full text-gray-500 gap-4 pt-8">
                                <div className="text-center mb-6"><LayoutDashboard size={48} className="mx-auto opacity-20 mb-2"/><p className="font-bold text-gray-700">نمای کلی پرونده و وضعیت مراحل</p><p className="text-xs text-gray-400">برای ویرایش جزئیات، روی هر مرحله کلیک کنید</p></div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-5xl">
                                    {STAGES.map((s, idx) => {
                                        const stageInfo = selectedRecord.stages[s]; const isDone = stageInfo?.isCompleted;
                                        return (<button key={idx} onClick={() => handleOpenStage(s)} className={`p-4 rounded-xl border flex flex-col gap-2 transition-all hover:shadow-md text-right relative group ${isDone ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'}`}><div className="flex items-center justify-between w-full"><span className="text-sm font-bold">{s}</span>{isDone ? <CheckCircle2 size={20} /> : <Circle size={20} />}</div>{(stageInfo?.costRial || 0) > 0 && <div className="text-[10px] bg-white/50 px-2 py-0.5 rounded w-fit dir-ltr font-mono">{formatCurrency(stageInfo.costRial)}</div>}{stageInfo?.attachments && stageInfo.attachments.length > 0 && <div className="absolute top-2 left-2 text-blue-500"><Paperclip size={14}/></div>}</button>)
                                    })}
                                </div>
                             </div>
                        )}

                        {activeTab === 'proforma' && (
                            <div className="space-y-6 animate-fade-in">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2"><FileSpreadsheet size={20} className="text-amber-600"/> اطلاعات ثبت سفارش و اقلام کالا</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">شماره ثبت سفارش</label><input className="w-full border rounded-lg p-2 text-sm" value={selectedRecord.registrationNumber || ''} onChange={e => handleUpdateProforma('registrationNumber', e.target.value)} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">تاریخ صدور ثبت سفارش</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" placeholder="YYYY/MM/DD" value={selectedRecord.registrationDate || ''} onChange={e => handleUpdateProforma('registrationDate', e.target.value)} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">مهلت ثبت سفارش</label><input className="w-full border rounded-lg p-2 text-sm dir-ltr" placeholder="YYYY/MM/DD" value={selectedRecord.registrationExpiry || ''} onChange={e => handleUpdateProforma('registrationExpiry', e.target.value)} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">بانک عامل</label><select className="w-full border rounded-lg p-2 text-sm" value={selectedRecord.operatingBank || ''} onChange={e => handleUpdateProforma('operatingBank', e.target.value)}><option value="">انتخاب بانک...</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                </div>
                                <div className="mt-8 border rounded-xl overflow-hidden"><div className="bg-gray-50 p-3 border-b flex justify-between items-center"><h4 className="font-bold text-gray-700 text-sm flex items-center gap-2"><Package size={16}/> لیست اقلام کالا</h4></div><div className="p-3 bg-white border-b grid grid-cols-1 md:grid-cols-5 gap-2 items-end"><div className="md:col-span-2"><input className="w-full border rounded p-1.5 text-sm" placeholder="نام کالا" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} /></div><div><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="وزن (KG)" type="number" value={newItem.weight || ''} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})} /></div><div><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="فی (Currency)" type="number" value={newItem.unitPrice || ''} onChange={e => setNewItem({...newItem, unitPrice: Number(e.target.value)})} /></div><div><button onClick={handleAddItem} className="w-full bg-blue-600 text-white p-1.5 rounded text-sm hover:bg-blue-700">افزودن کالا</button></div></div><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-600"><tr><th className="p-2">ردیف</th><th className="p-2">نام کالا</th><th className="p-2">وزن</th><th className="p-2">فی</th><th className="p-2">قیمت کل</th><th className="p-2 w-10"></th></tr></thead><tbody>{selectedRecord.items.map((item, idx) => (<tr key={item.id || idx} className="border-b"><td className="p-2 text-center w-12">{idx + 1}</td><td className="p-2 font-bold">{item.name}</td><td className="p-2 dir-ltr text-right">{item.weight}</td><td className="p-2 dir-ltr text-right font-mono">{formatNumberString(item.unitPrice.toString())}</td><td className="p-2 dir-ltr text-right font-mono font-bold">{formatNumberString(item.totalPrice.toString())}</td><td className="p-2"><button onClick={() => handleRemoveItem(item.id)} className="text-red-500"><Trash2 size={14}/></button></td></tr>))}{selectedRecord.items.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">هیچ کالایی ثبت نشده است</td></tr>}{selectedRecord.items.length > 0 && <tr className="bg-gray-50 font-bold"><td colSpan={4} className="p-2 text-left">جمع کل:</td><td className="p-2 dir-ltr text-right text-blue-600">{formatNumberString(selectedRecord.items.reduce((acc, i) => acc + i.totalPrice, 0).toString())}</td><td></td></tr>}</tbody></table></div>
                                <div className="mt-8"><h4 className="font-bold text-gray-700 mb-3">هزینه‌های مجوز و ثبت سفارش</h4><div className="flex gap-2 mb-4 items-end bg-gray-50 p-3 rounded-lg border"><input className="border rounded px-2 py-1 text-sm w-32 dir-ltr" placeholder="مبلغ (ریال)" value={newLicenseTx.amount || ''} onChange={e => setNewLicenseTx({...newLicenseTx, amount: Number(e.target.value)})} /><input className="border rounded px-2 py-1 text-sm flex-1" placeholder="شرح (مثال: کارمزد ثبت)" value={newLicenseTx.description || ''} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})} /><div className="flex flex-col"><label className="text-[10px] text-gray-400 mb-1">بانک</label><select className="border rounded px-2 py-1 text-sm w-32" value={newLicenseTx.bank || ''} onChange={e => setNewLicenseTx({...newLicenseTx, bank: e.target.value})}><option value="">انتخاب بانک...</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div><input className="border rounded px-2 py-1 text-sm w-24" placeholder="تاریخ" value={newLicenseTx.date || ''} onChange={e => setNewLicenseTx({...newLicenseTx, date: e.target.value})} /><button onClick={handleAddLicenseTx} className="bg-amber-600 text-white px-3 py-1 rounded text-sm hover:bg-amber-700">افزودن</button></div><table className="w-full text-sm text-right border"><thead className="bg-gray-100"><tr><th className="p-2 border">شرح</th><th className="p-2 border">بانک</th><th className="p-2 border">تاریخ</th><th className="p-2 border">مبلغ</th><th className="p-2 border w-10"></th></tr></thead><tbody>{selectedRecord.licenseData?.transactions.map(t => (<tr key={t.id}><td className="p-2 border">{t.description}</td><td className="p-2 border">{t.bank}</td><td className="p-2 border">{t.date}</td><td className="p-2 border">{formatCurrency(t.amount)}</td><td className="p-2 border"><button onClick={() => handleRemoveLicenseTx(t.id)} className="text-red-500"><Trash2 size={14}/></button></td></tr>))}<tr className="bg-amber-50 font-bold"><td colSpan={3} className="p-2 border text-left">جمع کل:</td><td className="p-2 border">{formatCurrency(selectedRecord.stages[TradeStage.LICENSES]?.costRial || 0)}</td><td></td></tr></tbody></table></div>
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
                                <div><h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Plus size={16}/> الحاقیه‌ها (افزایش/کاهش)</h4><div className="flex gap-2 mb-4 items-end bg-purple-50 p-3 rounded-lg border border-purple-100"><input className="border rounded px-2 py-1 text-sm flex-1" placeholder="شرح الحاقیه" value={newEndorsement.description || ''} onChange={e => setNewEndorsement({...newEndorsement, description: e.target.value})} /><input className="border rounded px-2 py-1 text-sm w-32 dir-ltr" placeholder="مبلغ (+/-)" value={newEndorsement.amount || ''} onChange={e => setNewEndorsement({...newEndorsement, amount: Number(e.target.value)})} /><input className="border rounded px-2 py-1 text-sm w-24" placeholder="تاریخ" value={newEndorsement.date || ''} onChange={e => setNewEndorsement({...newEndorsement, date: e.target.value})} /><button onClick={handleAddEndorsement} className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700">افزودن</button></div><table className="w-full text-sm text-right border rounded-lg overflow-hidden"><thead className="bg-gray-100"><tr><th className="p-2 border">شرح</th><th className="p-2 border">تاریخ</th><th className="p-2 border">مبلغ</th><th className="p-2 border w-10"></th></tr></thead><tbody>{insuranceForm.endorsements?.map(e => (<tr key={e.id}><td className="p-2 border">{e.description}</td><td className="p-2 border">{e.date}</td><td className={`p-2 border dir-ltr ${e.amount < 0 ? 'text-red-500' : 'text-green-600'}`}>{formatCurrency(e.amount)}</td><td className="p-2 border"><button onClick={() => handleDeleteEndorsement(e.id)} className="text-red-500"><Trash2 size={14}/></button></td></tr>))}{(!insuranceForm.endorsements || insuranceForm.endorsements.length === 0) && <tr><td colSpan={4} className="text-center p-4 text-gray-400">بدون الحاقیه</td></tr>}</tbody></table></div>
                                <div className="flex justify-between items-center bg-gray-100 p-4 rounded-xl"><span className="font-bold text-gray-700">جمع کل هزینه بیمه:</span><span className="font-mono font-bold text-xl text-blue-600 dir-ltr">{formatCurrency(calculateInsuranceTotal())}</span></div>
                                <div className="flex justify-end"><button onClick={handleSaveInsurance} className="bg-blue-600 text-white px-6 py-2 rounded-xl flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-600/20"><Save size={18}/> ذخیره اطلاعات بیمه</button></div>
                            </div>
                        )}

                        {activeTab === 'currency_purchase' && (
                            <div className="space-y-6 animate-fade-in">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2"><Coins size={20} className="text-green-600"/> خرید و تحویل ارز</h3>
                                <div className="bg-white border rounded-xl overflow-hidden mb-6 shadow-sm">
                                    <div className="bg-gray-50 p-3 border-b font-bold text-gray-700 flex justify-between items-center"><span>لیست پارت‌های خرید ارز (Tranches)</span><span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">ارز پایه: {selectedRecord.mainCurrency}</span></div>
                                    <div className="p-4 grid grid-cols-1 md:grid-cols-6 gap-2 bg-gray-50 border-b items-end"><div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">مبلغ ارزی</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="Amount" value={newCurrencyTranche.amount || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, amount: Number(e.target.value)})} /></div><div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">نوع ارز</label><select className="w-full border rounded p-1.5 text-sm" value={newCurrencyTranche.currencyType} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, currencyType: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div><div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">نرخ ریالی</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="Rate" value={newCurrencyTranche.rate || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, rate: Number(e.target.value)})} /></div><div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">صرافی</label><input className="w-full border rounded p-1.5 text-sm" placeholder="Exchange" value={newCurrencyTranche.exchangeName || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, exchangeName: e.target.value})} /></div><div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">تاریخ</label><input className="w-full border rounded p-1.5 text-sm" placeholder="Date" value={newCurrencyTranche.date || ''} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, date: e.target.value})} /></div><div className="md:col-span-1"><button onClick={handleAddCurrencyTranche} className="w-full bg-green-600 text-white p-1.5 rounded text-sm hover:bg-green-700 h-[34px]">افزودن پارت</button></div></div>
                                    <table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-600"><tr><th className="p-3 border-b">مبلغ</th><th className="p-3 border-b">ارز</th><th className="p-3 border-b">نرخ</th><th className="p-3 border-b">صرافی</th><th className="p-3 border-b">تاریخ خرید</th><th className="p-3 border-b text-center w-24">وضعیت تحویل</th><th className="p-3 border-b w-32">تاریخ تحویل</th><th className="p-3 border-b w-10"></th></tr></thead><tbody className="divide-y">{currencyForm.tranches?.map((t, idx) => (<tr key={t.id || idx}><td className="p-3 font-mono dir-ltr font-bold text-gray-800">{formatNumberString(t.amount.toString())}</td><td className="p-3">{t.currencyType}</td><td className="p-3 font-mono text-gray-500">{formatCurrency(t.rate || 0)}</td><td className="p-3 text-center font-mono font-bold text-gray-700">{formatCurrency((t.rate || 0) * t.amount)}</td><td className="p-3">{t.exchangeName} / {t.brokerName}</td><td className="p-3">{t.date}</td><td className="p-3 text-center"><span className={`px-2 py-1 rounded text-xs ${t.isDelivered ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{t.isDelivered ? `تحویل شده: ${t.deliveryDate}` : 'تحویل نشده'}</span></td><td className="p-3"><input disabled={!t.isDelivered} className={`w-full border rounded px-1 py-0.5 text-xs ${!t.isDelivered ? 'bg-gray-100 text-gray-400' : 'bg-white'}`} placeholder="تاریخ..." value={t.deliveryDate || ''} onChange={e => handleUpdateTrancheDelivery(t.id, true, e.target.value)} /></td><td className="p-3 text-center"><button onClick={() => handleRemoveTranche(t.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button></td></tr>))}{(!currencyForm.tranches || currencyForm.tranches.length === 0) && (<tr><td colSpan={8} className="p-4 text-center text-gray-400">هیچ پارت ارزی ثبت نشده است.</td></tr>)}</tbody><tfoot className="bg-gray-50 font-bold"><tr><td className="p-3 border-t">جمع کل:</td><td className="p-3 border-t font-mono dir-ltr text-blue-600" colSpan={7}>{formatNumberString(currencyForm.purchasedAmount.toString())} {selectedRecord.mainCurrency}</td></tr></tfoot></table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'shipping_docs' && (
                            <div className="space-y-6 animate-fade-in">
                                <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2"><Container size={20} className="text-cyan-600"/> مدیریت اسناد حمل</h3>
                                
                                <div className="flex bg-gray-100 p-1 rounded-xl mb-6">
                                    <button onClick={() => { setActiveShippingSubTab('Commercial Invoice'); setShippingDocForm({ ...shippingDocForm, status: 'Draft', currency: selectedRecord.mainCurrency || 'EUR' }); }} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeShippingSubTab === 'Commercial Invoice' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}><FileText size={16}/> اینویس</button>
                                    <button onClick={() => { setActiveShippingSubTab('Packing List'); setShippingDocForm({ ...shippingDocForm, status: 'Draft' }); }} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeShippingSubTab === 'Packing List' ? 'bg-white shadow text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}><Package size={16}/> پکینگ</button>
                                    <button onClick={() => { setActiveShippingSubTab('Certificate of Origin'); setShippingDocForm({ ...shippingDocForm, status: 'Draft' }); }} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeShippingSubTab === 'Certificate of Origin' ? 'bg-white shadow text-purple-600' : 'text-gray-500 hover:text-gray-700'}`}><Stamp size={16}/> گواهی مبدا</button>
                                    <button onClick={() => { setActiveShippingSubTab('Bill of Lading'); setShippingDocForm({ ...shippingDocForm, status: 'Draft' }); }} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeShippingSubTab === 'Bill of Lading' ? 'bg-white shadow text-cyan-600' : 'text-gray-500 hover:text-gray-700'}`}><Ship size={16}/> بارنامه</button>
                                </div>

                                {/* Aggregation Summary for Invoices */}
                                {activeShippingSubTab === 'Commercial Invoice' && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold text-blue-800 text-sm mb-1">وضعیت نهایی پرونده (بر اساس اینویس‌های نهایی)</h4>
                                            <div className="text-xs text-blue-600">مجموع اقلام و هزینه‌های اینویس‌های نهایی، مبنای محاسبه قیمت تمام شده خواهد بود.</div>
                                        </div>
                                        <div className="flex gap-4 items-center">
                                            <div className="text-right">
                                                <span className="block text-xs text-blue-500">جمع کل مبلغ (ارزی)</span>
                                                <span className="font-mono font-bold text-lg dir-ltr text-blue-700">
                                                    {formatNumberString(getFinalAggregation().totalAmount.toString())} {selectedRecord.mainCurrency}
                                                </span>
                                            </div>
                                            <button onClick={handleUpdateFinalProforma} className="bg-white border border-blue-300 text-blue-700 px-3 py-2 rounded-lg text-sm hover:bg-blue-100 flex items-center gap-2 shadow-sm">
                                                <Calculator size={16}/> بروزرسانی پروفرما نهایی
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* INPUT FORM */}
                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    <h4 className="font-bold text-gray-700 mb-4 flex justify-between items-center">
                                        <span>ثبت {activeShippingSubTab === 'Commercial Invoice' ? 'کامرشیال اینویس' : activeShippingSubTab === 'Packing List' ? 'پکینگ لیست' : activeShippingSubTab === 'Certificate of Origin' ? 'گواهی مبدا' : 'بارنامه'} جدید</span>
                                        {activeShippingSubTab === 'Commercial Invoice' && (
                                            <div className="flex bg-white rounded border p-0.5">
                                                <button onClick={() => setShippingDocForm({ ...shippingDocForm, status: 'Draft' })} className={`px-3 py-0.5 text-xs rounded ${shippingDocForm.status === 'Draft' ? 'bg-yellow-100 text-yellow-700 font-bold' : 'text-gray-500'}`}>اولیه (Draft)</button>
                                                <button onClick={() => setShippingDocForm({ ...shippingDocForm, status: 'Final' })} className={`px-3 py-0.5 text-xs rounded ${shippingDocForm.status === 'Final' ? 'bg-green-100 text-green-700 font-bold' : 'text-gray-500'}`}>نهایی (Final)</button>
                                            </div>
                                        )}
                                    </h4>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                        <div><label className="text-[10px] text-gray-500 block mb-1">{getDocLabel(activeShippingSubTab, 'number')}</label><input className="w-full border rounded p-2 text-sm" value={shippingDocForm.documentNumber || ''} onChange={e => setShippingDocForm({...shippingDocForm, documentNumber: e.target.value})} /></div>
                                        <div><label className="text-[10px] text-gray-500 block mb-1">{getDocLabel(activeShippingSubTab, 'date')}</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="YYYY/MM/DD" value={shippingDocForm.documentDate || ''} onChange={e => setShippingDocForm({...shippingDocForm, documentDate: e.target.value})} /></div>
                                        <div className="md:col-span-1"><label className="text-[10px] text-gray-500 block mb-1">شماره پارت (Part No)</label><input className="w-full border rounded p-2 text-sm" placeholder="مثال: Part 1" value={shippingDocForm.partNumber || ''} onChange={e => setShippingDocForm({...shippingDocForm, partNumber: e.target.value})} /></div>
                                        
                                        {/* Dynamic Fields */}
                                        {activeShippingSubTab === 'Commercial Invoice' && (
                                            <>
                                                <div><label className="text-[10px] text-gray-500 block mb-1">هزینه حمل کل (ارزی)</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={shippingDocForm.freightCost || ''} onChange={e => setShippingDocForm({...shippingDocForm, freightCost: Number(e.target.value)})} /></div>
                                                <div><label className="text-[10px] text-gray-500 block mb-1">ارز</label><select className="w-full border rounded p-2 text-sm" value={shippingDocForm.currency} onChange={e => setShippingDocForm({...shippingDocForm, currency: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                                            </>
                                        )}

                                        {activeShippingSubTab === 'Packing List' && (
                                            <>
                                                <div><label className="text-[10px] text-gray-500 block mb-1">وزن خالص (KG)</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={shippingDocForm.netWeight || ''} onChange={e => setShippingDocForm({...shippingDocForm, netWeight: Number(e.target.value)})} /></div>
                                                <div><label className="text-[10px] text-gray-500 block mb-1">وزن ناخالص (KG)</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={shippingDocForm.grossWeight || ''} onChange={e => setShippingDocForm({...shippingDocForm, grossWeight: Number(e.target.value)})} /></div>
                                                <div><label className="text-[10px] text-gray-500 block mb-1">تعداد بسته</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" value={shippingDocForm.packagesCount || ''} onChange={e => setShippingDocForm({...shippingDocForm, packagesCount: Number(e.target.value)})} /></div>
                                            </>
                                        )}

                                        {activeShippingSubTab === 'Certificate of Origin' && (
                                             <div className="md:col-span-2"><label className="text-[10px] text-gray-500 block mb-1">اتاق بازرگانی (صادر کننده)</label><input className="w-full border rounded p-2 text-sm" value={shippingDocForm.chamberOfCommerce || ''} onChange={e => setShippingDocForm({...shippingDocForm, chamberOfCommerce: e.target.value})} /></div>
                                        )}

                                        {activeShippingSubTab === 'Bill of Lading' && (
                                            <>
                                                <div><label className="text-[10px] text-gray-500 block mb-1">نام کشتی / پرواز</label><input className="w-full border rounded p-2 text-sm" value={shippingDocForm.vesselName || ''} onChange={e => setShippingDocForm({...shippingDocForm, vesselName: e.target.value})} /></div>
                                                <div><label className="text-[10px] text-gray-500 block mb-1">بندر مبدا</label><input className="w-full border rounded p-2 text-sm" value={shippingDocForm.portOfLoading || ''} onChange={e => setShippingDocForm({...shippingDocForm, portOfLoading: e.target.value})} /></div>
                                                <div><label className="text-[10px] text-gray-500 block mb-1">بندر مقصد</label><input className="w-full border rounded p-2 text-sm" value={shippingDocForm.portOfDischarge || ''} onChange={e => setShippingDocForm({...shippingDocForm, portOfDischarge: e.target.value})} /></div>
                                            </>
                                        )}
                                    </div>

                                    {/* Invoice Items Grid */}
                                    {activeShippingSubTab === 'Commercial Invoice' && (
                                        <div className="mb-4 bg-white border rounded-lg overflow-hidden">
                                            <div className="bg-gray-100 px-3 py-2 text-xs font-bold text-gray-700 border-b">اقلام اینویس</div>
                                            <div className="p-2 grid grid-cols-1 md:grid-cols-5 gap-2 items-end border-b bg-gray-50">
                                                <div className="md:col-span-2"><input className="w-full border rounded p-1.5 text-xs" placeholder="نام کالا" value={newInvoiceItem.name} onChange={e => setNewInvoiceItem({...newInvoiceItem, name: e.target.value})} /></div>
                                                <div><input type="number" className="w-full border rounded p-1.5 text-xs dir-ltr" placeholder="وزن (KG)" value={newInvoiceItem.weight || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, weight: Number(e.target.value)})} /></div>
                                                <div><input type="number" className="w-full border rounded p-1.5 text-xs dir-ltr" placeholder="فی (Unit)" value={newInvoiceItem.unitPrice || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, unitPrice: Number(e.target.value)})} /></div>
                                                <div><button onClick={handleAddInvoiceItem} className="w-full bg-blue-600 text-white p-1.5 rounded text-xs hover:bg-blue-700">افزودن کالا</button></div>
                                            </div>
                                            <table className="w-full text-xs text-right">
                                                <thead className="bg-gray-50 text-gray-500"><tr><th className="p-2">کالا</th><th className="p-2">وزن</th><th className="p-2">فی</th><th className="p-2">جمع</th><th className="w-8"></th></tr></thead>
                                                <tbody className="divide-y">
                                                    {(shippingDocForm.invoiceItems || []).map(item => (
                                                        <tr key={item.id}>
                                                            <td className="p-2">{item.name}</td>
                                                            <td className="p-2 dir-ltr">{item.weight}</td>
                                                            <td className="p-2 dir-ltr">{formatNumberString(item.unitPrice.toString())}</td>
                                                            <td className="p-2 dir-ltr font-bold">{formatNumberString(item.totalPrice.toString())}</td>
                                                            <td className="p-2 text-center"><button onClick={() => handleRemoveInvoiceItem(item.id)} className="text-red-500"><X size={12}/></button></td>
                                                        </tr>
                                                    ))}
                                                    {(shippingDocForm.invoiceItems || []).length === 0 && <tr><td colSpan={5} className="p-2 text-center text-gray-400">بدون کالا</td></tr>}
                                                </tbody>
                                                <tfoot className="bg-gray-100 font-bold">
                                                    <tr>
                                                        <td colSpan={3} className="p-2 text-left">جمع اقلام + هزینه حمل ({formatNumberString(shippingDocForm.freightCost?.toString() || '0')}):</td>
                                                        <td className="p-2 dir-ltr text-blue-700">
                                                            {formatNumberString((getInvoiceTotal(shippingDocForm.invoiceItems || []) + (Number(shippingDocForm.freightCost) || 0)).toString())}
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    )}
                                    
                                    <div className="mb-4">
                                        <label className="text-[10px] text-gray-500 block mb-1">توضیحات تکمیلی</label>
                                        <input className="w-full border rounded p-2 text-sm" value={shippingDocForm.description || ''} onChange={e => setShippingDocForm({...shippingDocForm, description: e.target.value})} />
                                    </div>

                                    <div className="flex justify-between items-center border-t pt-3">
                                         <div className="flex items-center gap-2">
                                            <input type="file" ref={docFileInputRef} className="hidden" onChange={handleDocFileChange} />
                                            <button onClick={() => docFileInputRef.current?.click()} className="text-xs bg-white border px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1" disabled={uploadingDocFile}>
                                                {uploadingDocFile ? '...' : <><Upload size={12}/> افزودن فایل ضمیمه</>}
                                            </button>
                                            <div className="flex gap-2">
                                                {shippingDocForm.attachments?.map((file, idx) => (
                                                    <div key={idx} className="flex items-center gap-1 bg-white border px-2 py-0.5 rounded text-xs">
                                                        <span className="truncate max-w-[100px]">{file.fileName}</span>
                                                        <button onClick={() => removeDocAttachment(idx)} className="text-red-500"><X size={10}/></button>
                                                    </div>
                                                ))}
                                            </div>
                                         </div>
                                         <button onClick={handleSaveShippingDoc} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2"><Save size={16}/> ذخیره در لیست</button>
                                    </div>
                                </div>

                                {/* HISTORY TABLE */}
                                <div className="border rounded-xl overflow-hidden shadow-sm">
                                    <div className="bg-gray-100 p-3 text-sm font-bold text-gray-700 border-b">سوابق ثبت شده: {activeShippingSubTab === 'Commercial Invoice' ? 'اینویس' : activeShippingSubTab}</div>
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-white text-gray-600">
                                            <tr>
                                                {activeShippingSubTab === 'Commercial Invoice' && <th className="p-3 border-b w-20 text-center">وضعیت</th>}
                                                <th className="p-3 border-b">شماره سند</th>
                                                <th className="p-3 border-b">تاریخ</th>
                                                <th className="p-3 border-b">پارت</th>
                                                {activeShippingSubTab === 'Commercial Invoice' && <th className="p-3 border-b">مبلغ کل (با حمل)</th>}
                                                {activeShippingSubTab === 'Packing List' && <th className="p-3 border-b">وزن ناخالص / خالص</th>}
                                                {activeShippingSubTab === 'Certificate of Origin' && <th className="p-3 border-b">صادر کننده</th>}
                                                {activeShippingSubTab === 'Bill of Lading' && <th className="p-3 border-b">مسیر حمل</th>}
                                                <th className="p-3 border-b w-24">ضمائم</th>
                                                <th className="p-3 border-b w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {(selectedRecord.shippingDocuments || [])
                                                .filter(d => d.type === activeShippingSubTab)
                                                .map(doc => (
                                                <tr key={doc.id} className="bg-white hover:bg-gray-50">
                                                    {activeShippingSubTab === 'Commercial Invoice' && (
                                                        <td className="p-3 text-center">
                                                            <span className={`px-2 py-1 rounded text-xs border ${doc.status === 'Final' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-yellow-100 text-yellow-700 border-yellow-200'}`}>
                                                                {doc.status === 'Final' ? 'نهایی' : 'اولیه'}
                                                            </span>
                                                        </td>
                                                    )}
                                                    <td className="p-3 font-medium">{doc.documentNumber}</td>
                                                    <td className="p-3 text-gray-600 dir-ltr text-right">{doc.documentDate}</td>
                                                    <td className="p-3 text-gray-500 text-xs">{doc.partNumber || '-'}</td>
                                                    
                                                    {activeShippingSubTab === 'Commercial Invoice' && (
                                                        <td className="p-3 font-mono dir-ltr">{formatNumberString(doc.amount?.toString())} {doc.currency}</td>
                                                    )}
                                                    {activeShippingSubTab === 'Packing List' && (
                                                        <td className="p-3 dir-ltr text-right">{doc.grossWeight} / {doc.netWeight} KG</td>
                                                    )}
                                                    {activeShippingSubTab === 'Certificate of Origin' && (
                                                        <td className="p-3">{doc.chamberOfCommerce}</td>
                                                    )}
                                                    {activeShippingSubTab === 'Bill of Lading' && (
                                                        <td className="p-3 text-xs">{doc.portOfLoading} <ArrowRight size={10} className="inline"/> {doc.portOfDischarge}</td>
                                                    )}

                                                    <td className="p-3">
                                                        <div className="flex gap-1">
                                                            {doc.attachments.map((a, i) => (
                                                                <a key={i} href={a.url} target="_blank" className="text-blue-500 hover:text-blue-700 p-1 bg-blue-50 rounded" title={a.fileName}><Paperclip size={14}/></a>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <button onClick={() => handleDeleteShippingDoc(doc.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(selectedRecord.shippingDocuments || []).filter(d => d.type === activeShippingSubTab).length === 0 && (
                                                <tr><td colSpan={8} className="p-6 text-center text-gray-400 italic bg-white">هیچ سندی ثبت نشده است.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
    return <div></div>; 
};

export default TradeModule;
