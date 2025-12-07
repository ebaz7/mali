
import React, { useState, useEffect, useRef } from 'react';
import { User, TradeRecord, TradeStage, TradeItem, SystemSettings, InsuranceEndorsement, CurrencyPurchaseData, TradeTransaction, CurrencyTranche, TradeStageData, ShippingDocument, ShippingDocType, DocStatus, InvoiceItem, InspectionData, InspectionPayment, InspectionCertificate, ClearanceData, WarehouseReceipt, ClearancePayment, GreenLeafData, GreenLeafCustomsDuty, GreenLeafGuarantee, GreenLeafTax, GreenLeafRoadToll, InternalShippingData, ShippingPayment, AgentData, AgentPayment, PackingItem } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, deleteTradeRecord, getSettings, uploadFile } from '../services/storageService';
import { generateUUID, formatCurrency, formatNumberString, deformatNumberString, parsePersianDate, formatDate, calculateDaysDiff, getStatusLabel } from '../constants';
import { Container, Plus, Search, CheckCircle2, Save, Trash2, X, Package, ArrowRight, History, Banknote, Coins, Wallet, FileSpreadsheet, Shield, LayoutDashboard, Printer, FileDown, Paperclip, Building2, FolderOpen, Home, Calculator, FileText, Microscope, ListFilter, Warehouse, Calendar as CalendarIcon, PieChart, BarChart, Clock, Leaf, Scale, ShieldCheck, Percent, Truck, CheckSquare, Square, ToggleLeft, ToggleRight, DollarSign, UserCheck, Check, Archive, AlertCircle, RefreshCw, Box, Loader2, Share2, ChevronLeft, ChevronRight, ExternalLink, CalendarDays, Info } from 'lucide-react';
import { apiCall } from '../services/apiService';

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

// Report Types
type ReportType = 'general' | 'allocation_queue' | 'allocated' | 'currency' | 'insurance' | 'shipping' | 'inspection' | 'clearance' | 'green_leaf';

const TradeModule: React.FC<TradeModuleProps> = ({ currentUser }) => {
    const [records, setRecords] = useState<TradeRecord[]>([]);
    const [selectedRecord, setSelectedRecord] = useState<TradeRecord | null>(null);
    const [commodityGroups, setCommodityGroups] = useState<string[]>([]);
    const [availableBanks, setAvailableBanks] = useState<string[]>([]);
    const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
    const [settings, setSettingsData] = useState<SystemSettings | null>(null);

    // Navigation State
    const [navLevel, setNavLevel] = useState<'ROOT' | 'COMPANY' | 'GROUP'>('ROOT');
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    const [viewMode, setViewMode] = useState<'dashboard' | 'details' | 'reports'>('dashboard');
    const [activeReport, setActiveReport] = useState<ReportType>('general');
    const [reportFilterCompany, setReportFilterCompany] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Report Specific States
    const [reportSearchTerm, setReportSearchTerm] = useState('');
    const [reportUsdRialRate, setReportUsdRialRate] = useState<string>('500000'); // Default Rial Rate
    const [reportEurUsdRate, setReportEurUsdRate] = useState<string>('1.08'); // Default EUR to USD Rate
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [sendingReport, setSendingReport] = useState(false);

    // Modal & Form States
    const [showNewModal, setShowNewModal] = useState(false);
    const [newFileNumber, setNewFileNumber] = useState('');
    const [newGoodsName, setNewGoodsName] = useState(''); // Stores System File Number
    const [newSellerName, setNewSellerName] = useState('');
    const [newCommodityGroup, setNewCommodityGroup] = useState('');
    const [newMainCurrency, setNewMainCurrency] = useState('EUR');
    const [newRecordCompany, setNewRecordCompany] = useState('');
    
    const [activeTab, setActiveTab] = useState<'timeline' | 'proforma' | 'insurance' | 'currency_purchase' | 'shipping_docs' | 'inspection' | 'clearance_docs' | 'green_leaf' | 'internal_shipping' | 'agent_fees' | 'final_calculation'>('timeline');
    
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
    const [newClearancePayment, setNewClearancePayment] = useState<Partial<ClearancePayment>>({ amount: 0, part: '', bank: '', date: '', payingBank: '' });

    // Green Leaf State
    const [greenLeafForm, setGreenLeafForm] = useState<GreenLeafData>({ duties: [], guarantees: [], taxes: [], roadTolls: [] });
    const [newCustomsDuty, setNewCustomsDuty] = useState<Partial<GreenLeafCustomsDuty>>({ cottageNumber: '', part: '', amount: 0, paymentMethod: 'Bank', bank: '', date: '' });
    const [newGuaranteeDetails, setNewGuaranteeDetails] = useState<Partial<GreenLeafGuarantee>>({ guaranteeNumber: '', chequeNumber: '', chequeBank: '', chequeDate: '', cashAmount: 0, cashBank: '', cashDate: '', chequeAmount: 0 });
    const [selectedDutyForGuarantee, setSelectedDutyForGuarantee] = useState<string>(''); // ID of the duty
    const [newTax, setNewTax] = useState<Partial<GreenLeafTax>>({ part: '', amount: 0, bank: '', date: '' });
    const [newRoadToll, setNewRoadToll] = useState<Partial<GreenLeafRoadToll>>({ part: '', amount: 0, bank: '', date: '' });

    // Internal Shipping State
    const [internalShippingForm, setInternalShippingForm] = useState<InternalShippingData>({ payments: [] });
    const [newShippingPayment, setNewShippingPayment] = useState<Partial<ShippingPayment>>({ part: '', amount: 0, date: '', bank: '', description: '' });

    // Agent Fees State
    const [agentForm, setAgentForm] = useState<AgentData>({ payments: [] });
    const [newAgentPayment, setNewAgentPayment] = useState<Partial<AgentPayment>>({ agentName: '', amount: 0, bank: '', date: '', part: '', description: '' });

    // License Transactions State
    const [newLicenseTx, setNewLicenseTx] = useState<Partial<TradeTransaction>>({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });

    // Currency Purchase State
    const [currencyForm, setCurrencyForm] = useState<CurrencyPurchaseData>({
        payments: [], purchasedAmount: 0, purchasedCurrencyType: '', purchaseDate: '', brokerName: '', exchangeName: '', deliveredAmount: 0, deliveredCurrencyType: '', deliveryDate: '', recipientName: '', remittedAmount: 0, isDelivered: false, tranches: [], guaranteeCheque: undefined
    });
    
    const [newCurrencyTranche, setNewCurrencyTranche] = useState<Partial<CurrencyTranche>>({ amount: 0, currencyType: 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false, deliveryDate: '' });
    const [currencyGuarantee, setCurrencyGuarantee] = useState<{amount: string, bank: string, number: string, date: string, isDelivered: boolean}>({amount: '', bank: '', number: '', date: '', isDelivered: false});

    // Shipping Docs State
    const [activeShippingSubTab, setActiveShippingSubTab] = useState<ShippingDocType>('Commercial Invoice');
    const [shippingDocForm, setShippingDocForm] = useState<Partial<ShippingDocument>>({
        status: 'Draft',
        documentNumber: '',
        documentDate: '',
        attachments: [],
        invoiceItems: [],
        packingItems: [],
        freightCost: 0
    });
    const [newInvoiceItem, setNewInvoiceItem] = useState<Partial<InvoiceItem>>({ name: '', weight: 0, unitPrice: 0, totalPrice: 0, part: '' });
    const [newPackingItem, setNewPackingItem] = useState<Partial<PackingItem>>({ description: '', netWeight: 0, grossWeight: 0, packageCount: 0, part: '' });
    const [uploadingDocFile, setUploadingDocFile] = useState(false);
    const docFileInputRef = useRef<HTMLInputElement>(null);

    // Final Calculation State
    const [calcExchangeRate, setCalcExchangeRate] = useState<number>(0);

    useEffect(() => {
        loadRecords();
        getSettings().then(s => {
            setSettingsData(s);
            setCommodityGroups(s.commodityGroups || []);
            setAvailableBanks(s.bankNames || []);
            setAvailableCompanies(s.companyNames || []);
            setNewRecordCompany(s.defaultCompany || '');
        });
    }, []);

    useEffect(() => {
        if (selectedRecord) {
            setInsuranceForm(selectedRecord.insuranceData || { policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] });
            const inspData = selectedRecord.inspectionData || { certificates: [], payments: [] };
            if (inspData.certificates.length === 0 && selectedRecord.inspectionData?.certificateNumber) {
                 inspData.certificates.push({ id: generateUUID(), part: 'Original', certificateNumber: selectedRecord.inspectionData.certificateNumber, company: selectedRecord.inspectionData.inspectionCompany || '', amount: selectedRecord.inspectionData.totalInvoiceAmount || 0 });
            }
            setInspectionForm(inspData);
            setClearanceForm(selectedRecord.clearanceData || { receipts: [], payments: [] });
            setGreenLeafForm(selectedRecord.greenLeafData || { duties: [], guarantees: [], taxes: [], roadTolls: [] });
            setInternalShippingForm(selectedRecord.internalShippingData || { payments: [] });
            setAgentForm(selectedRecord.agentData || { payments: [] });
            const curData = (selectedRecord.currencyPurchaseData || { payments: [], purchasedAmount: 0, purchasedCurrencyType: selectedRecord.mainCurrency || 'EUR', tranches: [], isDelivered: false, deliveredAmount: 0, remittedAmount: 0 }) as CurrencyPurchaseData;
            if (!curData.tranches) curData.tranches = [];
            setCurrencyForm(curData);
            if (curData.guaranteeCheque) {
                setCurrencyGuarantee({
                    amount: formatNumberString(curData.guaranteeCheque.amount),
                    bank: curData.guaranteeCheque.bank,
                    number: curData.guaranteeCheque.chequeNumber,
                    date: curData.guaranteeCheque.dueDate,
                    isDelivered: curData.guaranteeCheque.isDelivered || false
                });
            } else {
                setCurrencyGuarantee({amount: '', bank: '', number: '', date: '', isDelivered: false});
            }
            setCalcExchangeRate(selectedRecord.exchangeRate || 0);
            setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' });
            setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false });
            setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
            setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' });
            setNewInspectionCertificate({ part: '', company: '', certificateNumber: '', amount: 0 });
            setNewWarehouseReceipt({ number: '', part: '', issueDate: '' });
            setNewClearancePayment({ amount: 0, part: '', bank: '', date: '', payingBank: '' });
            setNewCustomsDuty({ cottageNumber: '', part: '', amount: 0, paymentMethod: 'Bank', bank: '', date: '' });
            setNewGuaranteeDetails({ guaranteeNumber: '', chequeNumber: '', chequeBank: '', chequeDate: '', cashAmount: 0, cashBank: '', cashDate: '', chequeAmount: 0 });
            setNewTax({ part: '', amount: 0, bank: '', date: '' });
            setNewRoadToll({ part: '', amount: 0, bank: '', date: '' });
            setNewShippingPayment({ part: '', amount: 0, date: '', bank: '', description: '' });
            setNewAgentPayment({ agentName: '', amount: 0, bank: '', date: '', part: '', description: '' });
            setShippingDocForm({ status: 'Draft', documentNumber: '', documentDate: '', attachments: [], currency: selectedRecord.mainCurrency || 'EUR', invoiceItems: [], packingItems: [], freightCost: 0 });
            setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0, part: '' });
            setNewPackingItem({ description: '', netWeight: 0, grossWeight: 0, packageCount: 0, part: '' });
        }
    }, [selectedRecord]);

    const loadRecords = async () => { setRecords(await getTradeRecords()); };

    const goRoot = () => { setNavLevel('ROOT'); setSelectedCompany(null); setSelectedGroup(null); setSearchTerm(''); };
    const goCompany = (company: string) => { setSelectedCompany(company); setNavLevel('COMPANY'); setSelectedGroup(null); setSearchTerm(''); };
    const goGroup = (group: string) => { setSelectedGroup(group); setNavLevel('GROUP'); setSearchTerm(''); };

    const getGroupedData = () => {
        const currentRecords = records.filter(r => showArchived ? r.isArchived : !r.isArchived);
        if (navLevel === 'ROOT') {
            const companies: Record<string, number> = {};
            currentRecords.forEach(r => { const c = r.company || 'بدون شرکت'; companies[c] = (companies[c] || 0) + 1; });
            return Object.entries(companies).map(([name, count]) => ({ name, count, type: 'company' }));
        } else if (navLevel === 'COMPANY') {
            const groups: Record<string, number> = {};
            currentRecords.filter(r => (r.company || 'بدون شرکت') === selectedCompany).forEach(r => { const g = r.commodityGroup || 'سایر'; groups[g] = (groups[g] || 0) + 1; });
            return Object.entries(groups).map(([name, count]) => ({ name, count, type: 'group' }));
        }
        return [];
    };

    const getStageData = (record: TradeRecord | null, stage: TradeStage): TradeStageData => {
        if (!record || !record.stages) return { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: 'EUR', attachments: [], updatedAt: 0, updatedBy: '' };
        return record.stages[stage] || { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: 'EUR', attachments: [], updatedAt: 0, updatedBy: '' };
    };

    const handleCreateRecord = async () => { if (!newFileNumber || !newGoodsName) return; const newRecord: TradeRecord = { id: generateUUID(), company: newRecordCompany, fileNumber: newFileNumber, orderNumber: newFileNumber, goodsName: newGoodsName, registrationNumber: '', sellerName: newSellerName, commodityGroup: newCommodityGroup, mainCurrency: newMainCurrency, items: [], freightCost: 0, startDate: new Date().toISOString(), status: 'Active', stages: {}, createdAt: Date.now(), createdBy: currentUser.fullName, licenseData: { transactions: [] }, shippingDocuments: [] }; STAGES.forEach(stage => { newRecord.stages[stage] = { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: newMainCurrency, attachments: [], updatedAt: Date.now(), updatedBy: '' }; }); await saveTradeRecord(newRecord); await loadRecords(); setShowNewModal(false); setNewFileNumber(''); setNewGoodsName(''); setSelectedRecord(newRecord); setActiveTab('proforma'); setViewMode('details'); };
    const handleDeleteRecord = async (id: string) => { if (confirm("آیا از حذف این پرونده بازرگانی اطمینان دارید؟")) { await deleteTradeRecord(id); if (selectedRecord?.id === id) setSelectedRecord(null); loadRecords(); } };
    const handleUpdateProforma = (field: keyof TradeRecord, value: string | number) => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, [field]: value }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddItem = async () => { if (!selectedRecord || !newItem.name) return; const item: TradeItem = { id: generateUUID(), name: newItem.name, weight: Number(newItem.weight), unitPrice: Number(newItem.unitPrice), totalPrice: Number(newItem.totalPrice) || (Number(newItem.weight) * Number(newItem.unitPrice)) }; const updatedItems = [...selectedRecord.items, item]; const updatedRecord = { ...selectedRecord, items: updatedItems }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 }); };
    const handleRemoveItem = async (id: string) => { if (!selectedRecord) return; const updatedItems = selectedRecord.items.filter(i => i.id !== id); const updatedRecord = { ...selectedRecord, items: updatedItems }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddLicenseTx = async () => { if (!selectedRecord || !newLicenseTx.amount) return; const tx: TradeTransaction = { id: generateUUID(), date: newLicenseTx.date || '', amount: Number(newLicenseTx.amount), bank: newLicenseTx.bank || '', description: newLicenseTx.description || '' }; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = [...(currentLicenseData.transactions || []), tx]; const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; updatedRecord.stages[TradeStage.LICENSES].isCompleted = totalCost > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' }); };
    const handleRemoveLicenseTx = async (id: string) => { if (!selectedRecord) return; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = (currentLicenseData.transactions || []).filter(t => t.id !== id); const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleSaveInsurance = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, insuranceData: insuranceForm }; const totalCost = (Number(insuranceForm.cost) || 0) + (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStageData(updatedRecord, TradeStage.INSURANCE); updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost; updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!insuranceForm.policyNumber; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert("اطلاعات بیمه ذخیره شد."); };
    const handleAddEndorsement = () => { if (!newEndorsement.amount) return; const amount = endorsementType === 'increase' ? Number(newEndorsement.amount) : -Number(newEndorsement.amount); const endorsement: InsuranceEndorsement = { id: generateUUID(), date: newEndorsement.date || '', amount: amount, description: newEndorsement.description || '' }; const updatedEndorsements = [...(insuranceForm.endorsements || []), endorsement]; setInsuranceForm({ ...insuranceForm, endorsements: updatedEndorsements }); setNewEndorsement({ amount: 0, description: '', date: '' }); };
    const handleDeleteEndorsement = (id: string) => { setInsuranceForm({ ...insuranceForm, endorsements: insuranceForm.endorsements?.filter(e => e.id !== id) }); };
    const handleAddInspectionCertificate = async () => { if (!selectedRecord || !newInspectionCertificate.amount) return; const cert: InspectionCertificate = { id: generateUUID(), part: newInspectionCertificate.part || 'Part', company: newInspectionCertificate.company || '', certificateNumber: newInspectionCertificate.certificateNumber || '', amount: Number(newInspectionCertificate.amount), description: '' }; const updatedCertificates = [...(inspectionForm.certificates || []), cert]; const updatedData = { ...inspectionForm, certificates: updatedCertificates }; setInspectionForm(updatedData); setNewInspectionCertificate({ part: '', company: '', certificateNumber: '', amount: 0 }); const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); updatedRecord.stages[TradeStage.INSPECTION].isCompleted = updatedCertificates.length > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteInspectionCertificate = async (id: string) => { if (!selectedRecord) return; const updatedCertificates = (inspectionForm.certificates || []).filter(c => c.id !== id); const updatedData = { ...inspectionForm, certificates: updatedCertificates }; setInspectionForm(updatedData); const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddInspectionPayment = async () => { if (!selectedRecord || !newInspectionPayment.amount) return; const payment: InspectionPayment = { id: generateUUID(), part: newInspectionPayment.part || 'Part', amount: Number(newInspectionPayment.amount), date: newInspectionPayment.date || '', bank: newInspectionPayment.bank || '', description: '' }; const updatedPayments = [...(inspectionForm.payments || []), payment]; const updatedData = { ...inspectionForm, payments: updatedPayments }; setInspectionForm(updatedData); setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' }); const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteInspectionPayment = async (id: string) => { if (!selectedRecord) return; const updatedPayments = (inspectionForm.payments || []).filter(p => p.id !== id); const updatedData = { ...inspectionForm, payments: updatedPayments }; setInspectionForm(updatedData); const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddWarehouseReceipt = async () => { if (!selectedRecord || !newWarehouseReceipt.number) return; const receipt: WarehouseReceipt = { id: generateUUID(), number: newWarehouseReceipt.number || '', part: newWarehouseReceipt.part || '', issueDate: newWarehouseReceipt.issueDate || '' }; const updatedReceipts = [...(clearanceForm.receipts || []), receipt]; const updatedData = { ...clearanceForm, receipts: updatedReceipts }; setClearanceForm(updatedData); setNewWarehouseReceipt({ number: '', part: '', issueDate: '' }); const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); updatedRecord.stages[TradeStage.CLEARANCE_DOCS].isCompleted = updatedReceipts.length > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteWarehouseReceipt = async (id: string) => { if (!selectedRecord) return; const updatedReceipts = (clearanceForm.receipts || []).filter(r => r.id !== id); const updatedData = { ...clearanceForm, receipts: updatedReceipts }; setClearanceForm(updatedData); const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddClearancePayment = async () => { if (!selectedRecord || !newClearancePayment.amount) return; const payment: ClearancePayment = { id: generateUUID(), amount: Number(newClearancePayment.amount), part: newClearancePayment.part || '', bank: newClearancePayment.bank || '', date: newClearancePayment.date || '', payingBank: newClearancePayment.payingBank }; const updatedPayments = [...(clearanceForm.payments || []), payment]; const updatedData = { ...clearanceForm, payments: updatedPayments }; setClearanceForm(updatedData); setNewClearancePayment({ amount: 0, part: '', bank: '', date: '', payingBank: '' }); const totalCost = updatedPayments.reduce((acc, p) => acc + p.amount, 0); const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); updatedRecord.stages[TradeStage.CLEARANCE_DOCS].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteClearancePayment = async (id: string) => { if (!selectedRecord) return; const updatedPayments = (clearanceForm.payments || []).filter(p => p.id !== id); const updatedData = { ...clearanceForm, payments: updatedPayments }; setClearanceForm(updatedData); const totalCost = updatedPayments.reduce((acc, p) => acc + p.amount, 0); const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); updatedRecord.stages[TradeStage.CLEARANCE_DOCS].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const calculateGreenLeafTotal = (data: GreenLeafData) => { let total = 0; total += data.duties.filter(d => d.paymentMethod === 'Bank').reduce((acc, d) => acc + d.amount, 0); total += data.guarantees.reduce((acc, g) => acc + (g.cashAmount || 0) + (g.chequeAmount || 0), 0); total += data.taxes.reduce((acc, t) => acc + t.amount, 0); total += data.roadTolls.reduce((acc, r) => acc + r.amount, 0); return total; };
    const updateGreenLeafRecord = async (newData: GreenLeafData) => { if (!selectedRecord) return; setGreenLeafForm(newData); const totalCost = calculateGreenLeafTotal(newData); const updatedRecord = { ...selectedRecord, greenLeafData: newData }; if (!updatedRecord.stages[TradeStage.GREEN_LEAF]) updatedRecord.stages[TradeStage.GREEN_LEAF] = getStageData(updatedRecord, TradeStage.GREEN_LEAF); updatedRecord.stages[TradeStage.GREEN_LEAF].costRial = totalCost; updatedRecord.stages[TradeStage.GREEN_LEAF].isCompleted = (newData.duties.length > 0); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddCustomsDuty = async () => { if (!newCustomsDuty.cottageNumber || !newCustomsDuty.amount) return; const duty: GreenLeafCustomsDuty = { id: generateUUID(), cottageNumber: newCustomsDuty.cottageNumber, part: newCustomsDuty.part || '', amount: Number(newCustomsDuty.amount), paymentMethod: (newCustomsDuty.paymentMethod as 'Bank' | 'Guarantee') || 'Bank', bank: newCustomsDuty.bank, date: newCustomsDuty.date }; const updatedDuties = [...greenLeafForm.duties, duty]; await updateGreenLeafRecord({ ...greenLeafForm, duties: updatedDuties }); setNewCustomsDuty({ cottageNumber: '', part: '', amount: 0, paymentMethod: 'Bank', bank: '', date: '' }); };
    const handleDeleteCustomsDuty = async (id: string) => { const updatedDuties = greenLeafForm.duties.filter(d => d.id !== id); const updatedGuarantees = greenLeafForm.guarantees.filter(g => g.relatedDutyId !== id); await updateGreenLeafRecord({ ...greenLeafForm, duties: updatedDuties, guarantees: updatedGuarantees }); };
    const handleAddGuarantee = async () => { if (!selectedDutyForGuarantee || !newGuaranteeDetails.guaranteeNumber) return; const duty = greenLeafForm.duties.find(d => d.id === selectedDutyForGuarantee); const guarantee: GreenLeafGuarantee = { id: generateUUID(), relatedDutyId: selectedDutyForGuarantee, guaranteeNumber: newGuaranteeDetails.guaranteeNumber, chequeNumber: newGuaranteeDetails.chequeNumber, chequeBank: newGuaranteeDetails.chequeBank, chequeDate: newGuaranteeDetails.chequeDate, chequeAmount: Number(newGuaranteeDetails.chequeAmount) || 0, isDelivered: false, cashAmount: Number(newGuaranteeDetails.cashAmount) || 0, cashBank: newGuaranteeDetails.cashBank, cashDate: newGuaranteeDetails.cashDate, part: duty?.part }; const updatedGuarantees = [...greenLeafForm.guarantees, guarantee]; await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees }); setNewGuaranteeDetails({ guaranteeNumber: '', chequeNumber: '', chequeBank: '', chequeDate: '', cashAmount: 0, cashBank: '', cashDate: '', chequeAmount: 0 }); setSelectedDutyForGuarantee(''); };
    const handleDeleteGuarantee = async (id: string) => { const updatedGuarantees = greenLeafForm.guarantees.filter(g => g.id !== id); await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees }); };
    const handleToggleGuaranteeDelivery = async (id: string) => { const updatedGuarantees = greenLeafForm.guarantees.map(g => g.id === id ? { ...g, isDelivered: !g.isDelivered } : g); await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees }); };
    const handleAddTax = async () => { if (!newTax.amount) return; const tax: GreenLeafTax = { id: generateUUID(), amount: Number(newTax.amount), part: newTax.part || '', bank: newTax.bank || '', date: newTax.date || '' }; const updatedTaxes = [...greenLeafForm.taxes, tax]; await updateGreenLeafRecord({ ...greenLeafForm, taxes: updatedTaxes }); setNewTax({ part: '', amount: 0, bank: '', date: '' }); };
    const handleDeleteTax = async (id: string) => { const updatedTaxes = greenLeafForm.taxes.filter(t => t.id !== id); await updateGreenLeafRecord({ ...greenLeafForm, taxes: updatedTaxes }); };
    const handleAddRoadToll = async () => { if (!newRoadToll.amount) return; const toll: GreenLeafRoadToll = { id: generateUUID(), amount: Number(newRoadToll.amount), part: newRoadToll.part || '', bank: newRoadToll.bank || '', date: newRoadToll.date || '' }; const updatedTolls = [...greenLeafForm.roadTolls, toll]; await updateGreenLeafRecord({ ...greenLeafForm, roadTolls: updatedTolls }); setNewRoadToll({ part: '', amount: 0, bank: '', date: '' }); };
    const handleDeleteRoadToll = async (id: string) => { const updatedTolls = greenLeafForm.roadTolls.filter(t => t.id !== id); await updateGreenLeafRecord({ ...greenLeafForm, roadTolls: updatedTolls }); };
    const handleAddShippingPayment = async () => { if (!selectedRecord || !newShippingPayment.amount) return; const payment: ShippingPayment = { id: generateUUID(), part: newShippingPayment.part || '', amount: Number(newShippingPayment.amount), date: newShippingPayment.date || '', bank: newShippingPayment.bank || '', description: newShippingPayment.description || '' }; const updatedPayments = [...(internalShippingForm.payments || []), payment]; const updatedData = { ...internalShippingForm, payments: updatedPayments }; setInternalShippingForm(updatedData); setNewShippingPayment({ part: '', amount: 0, date: '', bank: '', description: '' }); const updatedRecord = { ...selectedRecord, internalShippingData: updatedData }; if (!updatedRecord.stages[TradeStage.INTERNAL_SHIPPING]) updatedRecord.stages[TradeStage.INTERNAL_SHIPPING] = getStageData(updatedRecord, TradeStage.INTERNAL_SHIPPING); updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].isCompleted = updatedPayments.length > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteShippingPayment = async (id: string) => { if (!selectedRecord) return; const updatedPayments = (internalShippingForm.payments || []).filter(p => p.id !== id); const updatedData = { ...internalShippingForm, payments: updatedPayments }; setInternalShippingForm(updatedData); const updatedRecord = { ...selectedRecord, internalShippingData: updatedData }; if (!updatedRecord.stages[TradeStage.INTERNAL_SHIPPING]) updatedRecord.stages[TradeStage.INTERNAL_SHIPPING] = getStageData(updatedRecord, TradeStage.INTERNAL_SHIPPING); updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddAgentPayment = async () => { if (!selectedRecord || !newAgentPayment.amount || !newAgentPayment.agentName) return; const payment: AgentPayment = { id: generateUUID(), agentName: newAgentPayment.agentName, amount: Number(newAgentPayment.amount), bank: newAgentPayment.bank || '', date: newAgentPayment.date || '', part: newAgentPayment.part || '', description: newAgentPayment.description || '' }; const updatedPayments = [...(agentForm.payments || []), payment]; const updatedData = { ...agentForm, payments: updatedPayments }; setAgentForm(updatedData); setNewAgentPayment({ agentName: newAgentPayment.agentName, amount: 0, bank: '', date: '', part: '', description: '' }); const updatedRecord = { ...selectedRecord, agentData: updatedData }; if (!updatedRecord.stages[TradeStage.AGENT_FEES]) updatedRecord.stages[TradeStage.AGENT_FEES] = getStageData(updatedRecord, TradeStage.AGENT_FEES); updatedRecord.stages[TradeStage.AGENT_FEES].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); updatedRecord.stages[TradeStage.AGENT_FEES].isCompleted = updatedPayments.length > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteAgentPayment = async (id: string) => { if (!selectedRecord) return; const updatedPayments = (agentForm.payments || []).filter(p => p.id !== id); const updatedData = { ...agentForm, payments: updatedPayments }; setAgentForm(updatedData); const updatedRecord = { ...selectedRecord, agentData: updatedData }; if (!updatedRecord.stages[TradeStage.AGENT_FEES]) updatedRecord.stages[TradeStage.AGENT_FEES] = getStageData(updatedRecord, TradeStage.AGENT_FEES); updatedRecord.stages[TradeStage.AGENT_FEES].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddCurrencyTranche = async () => { if (!selectedRecord || !newCurrencyTranche.amount) return; const tranche: CurrencyTranche = { id: generateUUID(), date: newCurrencyTranche.date || '', amount: Number(newCurrencyTranche.amount), currencyType: newCurrencyTranche.currencyType || selectedRecord.mainCurrency || 'EUR', brokerName: newCurrencyTranche.brokerName || '', exchangeName: newCurrencyTranche.exchangeName || '', rate: Number(newCurrencyTranche.rate) || 0, isDelivered: newCurrencyTranche.isDelivered, deliveryDate: newCurrencyTranche.deliveryDate }; const currentTranches = currencyForm.tranches || []; const updatedTranches = [...currentTranches, tranche]; const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false }); };
    const handleRemoveTranche = async (id: string) => { if (!selectedRecord) return; if (!confirm('آیا از حذف این پارت مطمئن هستید؟')) return; const updatedTranches = (currencyForm.tranches || []).filter(t => t.id !== id); const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); }
    const handleToggleTrancheDelivery = async (id: string) => { if (!selectedRecord) return; const updatedTranches = (currencyForm.tranches || []).map(t => { if (t.id === id) return { ...t, isDelivered: !t.isDelivered }; return t; }); const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleSaveCurrencyGuarantee = async () => { if (!selectedRecord) return; const gCheck = { amount: deformatNumberString(currencyGuarantee.amount), bank: currencyGuarantee.bank, chequeNumber: currencyGuarantee.number, dueDate: currencyGuarantee.date, isDelivered: currencyGuarantee.isDelivered }; const updatedForm = { ...currencyForm, guaranteeCheque: gCheck }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert("اطلاعات چک ضمانت ارزی ذخیره شد."); };
    const handleToggleCurrencyGuaranteeDelivery = async () => { if (!selectedRecord || !selectedRecord.currencyPurchaseData?.guaranteeCheque) return; const currentStatus = selectedRecord.currencyPurchaseData.guaranteeCheque.isDelivered || false; setCurrencyGuarantee(prev => ({ ...prev, isDelivered: !currentStatus })); const updatedForm = { ...currencyForm, guaranteeCheque: { ...currencyForm.guaranteeCheque!, isDelivered: !currentStatus } }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddInvoiceItem = () => { if (!newInvoiceItem.name) return; const newItem: InvoiceItem = { id: generateUUID(), name: newInvoiceItem.name, weight: Number(newInvoiceItem.weight), unitPrice: Number(newInvoiceItem.unitPrice), totalPrice: Number(newInvoiceItem.totalPrice) || (Number(newInvoiceItem.weight) * Number(newInvoiceItem.unitPrice)), part: newInvoiceItem.part || '' }; setShippingDocForm(prev => ({ ...prev, invoiceItems: [...(prev.invoiceItems || []), newItem] })); setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0, part: '' }); };
    const handleRemoveInvoiceItem = (id: string) => { setShippingDocForm(prev => ({ ...prev, invoiceItems: (prev.invoiceItems || []).filter(i => i.id !== id) })); };
    const handleAddPackingItem = () => { if (!newPackingItem.description) return; const item: PackingItem = { id: generateUUID(), description: newPackingItem.description, netWeight: Number(newPackingItem.netWeight), grossWeight: Number(newPackingItem.grossWeight), packageCount: Number(newPackingItem.packageCount), part: newPackingItem.part || '' }; setShippingDocForm(prev => ({ ...prev, packingItems: [...(prev.packingItems || []), item] })); setNewPackingItem({ description: '', netWeight: 0, grossWeight: 0, packageCount: 0, part: '' }); };
    const handleRemovePackingItem = (id: string) => { setShippingDocForm(prev => ({ ...prev, packingItems: (prev.packingItems || []).filter(i => i.id !== id) })); };
    const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingDocFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setShippingDocForm(prev => ({ ...prev, attachments: [...(prev.attachments || []), { fileName: result.fileName, url: result.url }] })); } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploadingDocFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const handleSaveShippingDoc = async () => { if (!selectedRecord || !shippingDocForm.documentNumber) return; let totalNet = shippingDocForm.netWeight; let totalGross = shippingDocForm.grossWeight; let totalPackages = shippingDocForm.packagesCount; if (activeShippingSubTab === 'Packing List' && shippingDocForm.packingItems && shippingDocForm.packingItems.length > 0) { totalNet = shippingDocForm.packingItems.reduce((acc, i) => acc + i.netWeight, 0); totalGross = shippingDocForm.packingItems.reduce((acc, i) => acc + i.grossWeight, 0); totalPackages = shippingDocForm.packingItems.reduce((acc, i) => acc + i.packageCount, 0); } const newDoc: ShippingDocument = { id: generateUUID(), type: activeShippingSubTab, status: shippingDocForm.status || 'Draft', documentNumber: shippingDocForm.documentNumber, documentDate: shippingDocForm.documentDate || '', createdAt: Date.now(), createdBy: currentUser.fullName, attachments: shippingDocForm.attachments || [], invoiceItems: activeShippingSubTab === 'Commercial Invoice' ? shippingDocForm.invoiceItems : undefined, packingItems: activeShippingSubTab === 'Packing List' ? shippingDocForm.packingItems : undefined, freightCost: activeShippingSubTab === 'Commercial Invoice' ? Number(shippingDocForm.freightCost) : undefined, currency: shippingDocForm.currency, netWeight: totalNet, grossWeight: totalGross, packagesCount: totalPackages, vesselName: shippingDocForm.vesselName, portOfLoading: shippingDocForm.portOfLoading, portOfDischarge: shippingDocForm.portOfDischarge, description: shippingDocForm.description }; const updatedDocs = [...(selectedRecord.shippingDocuments || []), newDoc]; const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs }; if (!updatedRecord.stages[TradeStage.SHIPPING_DOCS]) updatedRecord.stages[TradeStage.SHIPPING_DOCS] = getStageData(updatedRecord, TradeStage.SHIPPING_DOCS); if (activeShippingSubTab === 'Commercial Invoice') { updatedRecord.stages[TradeStage.SHIPPING_DOCS].costCurrency = updatedDocs.filter(d => d.type === 'Commercial Invoice').reduce((acc, d) => acc + (d.invoiceItems?.reduce((sum, i) => sum + i.totalPrice, 0) || 0) + (d.freightCost || 0), 0); } await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setShippingDocForm({ status: 'Draft', documentNumber: '', documentDate: '', attachments: [], invoiceItems: [], packingItems: [], freightCost: 0 }); };
    const handleDeleteShippingDoc = async (id: string) => { if (!selectedRecord) return; const updatedDocs = (selectedRecord.shippingDocuments || []).filter(d => d.id !== id); const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleSyncInvoiceToProforma = async () => { if (!selectedRecord) return; if (!confirm('آیا مطمئن هستید؟ این عملیات اقلام و هزینه حمل پروفرما را با مقادیر این اینویس جایگزین می‌کند. اقلام هم‌نام (از پارت‌های مختلف) تجمیع خواهند شد.')) return; const invoiceItems = shippingDocForm.invoiceItems || []; const aggregatedMap = new Map<string, { weight: number, totalPrice: number }>(); for (const item of invoiceItems) { const name = item.name.trim(); const current = aggregatedMap.get(name) || { weight: 0, totalPrice: 0 }; aggregatedMap.set(name, { weight: current.weight + item.weight, totalPrice: current.totalPrice + item.totalPrice }); } const newItems: TradeItem[] = []; aggregatedMap.forEach((val, name) => { newItems.push({ id: generateUUID(), name: name, weight: val.weight, unitPrice: val.weight > 0 ? val.totalPrice / val.weight : 0, totalPrice: val.totalPrice }); }); const updatedRecord = { ...selectedRecord, items: newItems, freightCost: Number(shippingDocForm.freightCost) || 0 }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert('پروفرما با موفقیت بروزرسانی شد (تجمیع بر اساس نام کالا).'); };
    const handleStageClick = (stage: TradeStage) => { const data = getStageData(selectedRecord, stage); setEditingStage(stage); setStageFormData(data); };
    const handleStageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingStageFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setStageFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), { fileName: result.fileName, url: result.url }] })); } catch (error) { alert('خطا در آپلود'); } finally { setUploadingStageFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const handleSaveStage = async () => { if (!selectedRecord || !editingStage) return; const updatedRecord = { ...selectedRecord }; updatedRecord.stages[editingStage] = { ...getStageData(selectedRecord, editingStage), ...stageFormData, updatedAt: Date.now(), updatedBy: currentUser.fullName }; if (editingStage === TradeStage.ALLOCATION_QUEUE && stageFormData.queueDate) { updatedRecord.stages[TradeStage.ALLOCATION_QUEUE].queueDate = stageFormData.queueDate; } if (editingStage === TradeStage.ALLOCATION_APPROVED) { updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationDate = stageFormData.allocationDate; updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationCode = stageFormData.allocationCode; updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationExpiry = stageFormData.allocationExpiry; } await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setEditingStage(null); };
    const toggleCommitment = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, isCommitmentFulfilled: !selectedRecord.isCommitmentFulfilled }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleArchiveRecord = async () => { if (!selectedRecord) return; if (!confirm('آیا از انتقال این پرونده به بایگانی (ترخیص شده) اطمینان دارید؟')) return; const updatedRecord = { ...selectedRecord, isArchived: true, status: 'Completed' as const }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert('پرونده با موفقیت بایگانی شد.'); setViewMode('dashboard'); loadRecords(); };
    const handleUpdateCalcRate = async (rate: number) => { setCalcExchangeRate(rate); if (selectedRecord) { const updated = { ...selectedRecord, exchangeRate: rate }; await updateTradeRecord(updated); setSelectedRecord(updated); } };
    const getAllGuarantees = () => { const list = []; if (selectedRecord && selectedRecord.currencyPurchaseData?.guaranteeCheque) { list.push({ id: 'currency_g', type: 'ارزی', number: selectedRecord.currencyPurchaseData.guaranteeCheque.chequeNumber, bank: selectedRecord.currencyPurchaseData.guaranteeCheque.bank, amount: selectedRecord.currencyPurchaseData.guaranteeCheque.amount, isDelivered: selectedRecord.currencyPurchaseData.guaranteeCheque.isDelivered, toggleFunc: handleToggleCurrencyGuaranteeDelivery }); } if (selectedRecord && selectedRecord.greenLeafData?.guarantees) { selectedRecord.greenLeafData.guarantees.forEach(g => { list.push({ id: g.id, type: 'گمرکی', number: g.guaranteeNumber + (g.chequeNumber ? ` / چک: ${g.chequeNumber}` : ''), bank: g.chequeBank, amount: g.chequeAmount, isDelivered: g.isDelivered, toggleFunc: () => handleToggleGuaranteeDelivery(g.id) }); }); } return list; };

    // ... (Reporting functions)
    const handlePrintReport = () => { const content = document.getElementById('allocation-report-table-print-area'); if (!content) return; const printWindow = window.open('', '_blank', 'width=1200,height=800'); if (!printWindow) { alert("پنجره پاپ‌آپ مسدود شده است. لطفا اجازه دهید."); return; } const styleSheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(el => el.outerHTML).join(''); printWindow.document.write(`<html dir="rtl" lang="fa"><head><title>گزارش صف تخصیص</title>${styleSheets}<script src="https://cdn.tailwindcss.com"></script><link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" /><style>body { background: white; margin: 0; padding: 20px; font-family: 'Vazirmatn', sans-serif; direction: rtl; } table { width: 100%; border-collapse: collapse; font-size: 10pt; } th, td { border: 1px solid #000; padding: 4px; text-align: center; } th { background-color: #1e3a8a !important; color: white !important; font-weight: bold; } .no-print { display: none !important; } @media print { @page { size: A4 landscape; margin: 10mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style></head><body><div style="width: 100%;"><h2 style="text-align: center; margin-bottom: 20px; font-weight: bold;">گزارش صف تخصیص ارز</h2>${content.innerHTML}</div><script>setTimeout(function() { window.focus(); window.print(); }, 1000);</script></body></html>`); printWindow.document.close(); };
    const handlePrintTrade = () => { window.print(); };
    const handleDownloadReportPDF = async (elementId: string, filename: string) => {
        setIsGeneratingPdf(true);
        const element = document.getElementById(elementId);
        if (!element) {
            setIsGeneratingPdf(false);
            return;
        }
        try {
            // @ts-ignore
            const canvas = await window.html2canvas(element, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                onclone: (doc: any) => {
                    const el = doc.getElementById(elementId);
                    if (el) {
                        el.style.width = '1400px';
                        el.style.maxWidth = 'none';
                        el.style.overflow = 'visible';
                        const table = el.querySelector('table');
                        if (table) {
                            table.style.width = '100%';
                            table.style.fontSize = '10px';
                        }
                    }
                }
            });
            const imgData = canvas.toDataURL('image/png');
            // @ts-ignore
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pdfWidth = 297;
            const margin = 5;
            const contentWidth = pdfWidth - (2 * margin);
            const contentHeight = (canvas.height * contentWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', margin, margin, contentWidth, contentHeight);
            pdf.save(`${filename}.pdf`);
        } catch (e) {
            console.error(e);
            alert("خطا در ایجاد PDF");
        } finally {
            setIsGeneratingPdf(false);
        }
    };
    const handleDownloadFinalCalculationPDF = () => handleDownloadReportPDF('print-trade-final', `Final_Calculation_${selectedRecord?.fileNumber}`);
    const handleWhatsAppShare = async () => { /* ... (Keep existing WhatsApp Logic) ... */ };
    const handleUpdateRecordFromTable = async (record: TradeRecord, updates: Partial<TradeRecord>) => { const updated = { ...record, ...updates }; const newRecords = records.map(r => r.id === record.id ? updated : r); setRecords(newRecords); await updateTradeRecord(updated); };
    const formatUSD = (val: number) => { return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    
    // New Export Functions for Allocation Report
    const handleExportAllocationExcel = () => {
        // Collect data from the DOM or State logic
        // We reuse the filtered logic below to match exactly what is shown
        const rows = [];
        // Headers
        const headers = ["ردیف", "شماره پرونده", "شماره ثبت سفارش", "شرکت", "فروشنده", "منشا ارز", "مبلغ ثبت سفارش", "تبدیل به دلار", "معادل ریالی", "زمان در صف", "زمان تخصیص", "مانده مهلت", "وضعیت", "بانک عامل"];
        rows.push(headers.join(","));

        // Helper to escape CSV
        const escape = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;

        let filteredRecords = records;
        if (reportFilterCompany) filteredRecords = records.filter(r => r.company === reportFilterCompany);
        if (reportSearchTerm) { const term = reportSearchTerm.toLowerCase(); filteredRecords = filteredRecords.filter(r => r.fileNumber.includes(term) || r.goodsName.includes(term) || r.sellerName.includes(term)); }
        
        const usdRate = parseFloat(reportEurUsdRate) || 1.08;
        const rialRate = parseFloat(reportUsdRialRate) || 0;

        const dataRows = filteredRecords.filter(r => r.stages[TradeStage.ALLOCATION_QUEUE]?.queueDate).map((r, index) => {
            const stageQ = r.stages[TradeStage.ALLOCATION_QUEUE];
            const stageA = r.stages[TradeStage.ALLOCATION_APPROVED];
            const isAllocated = stageA?.allocationCode;
            
            const amount = stageQ.costCurrency || 0;
            const currency = r.mainCurrency || 'EUR';
            let amountInUSD = 0;
            if (currency === 'USD') amountInUSD = amount;
            else if (currency === 'EUR') amountInUSD = amount * usdRate;
            
            const rialEquiv = amountInUSD * rialRate;
            const daysWait = calculateDaysDiff(stageQ.queueDate || '');
            const originMap: any = { 'Bank': 'بانکی', 'Export': 'صادرات', 'Free': 'آزاد', 'Nima': 'نیما' };
            const originLabel = originMap[r.currencyAllocationType || ''] || '-';

            // Calculate Remaining Days
            let remainingDays: string | number = '-';
            if (isAllocated && stageA?.allocationExpiry) {
                const expiry = parsePersianDate(stageA.allocationExpiry);
                if (expiry) {
                    const now = new Date();
                    const diffTime = expiry.getTime() - now.getTime();
                    remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }
            }

            return [
                index + 1,
                escape(r.fileNumber),
                escape(r.registrationNumber || ''),
                escape(r.company || ''),
                escape(r.sellerName),
                escape(originLabel),
                escape(`${amount} ${currency}`),
                escape(amountInUSD.toFixed(2)),
                escape(rialEquiv),
                escape(stageQ.queueDate || ''),
                escape(stageA?.allocationDate || '-'),
                escape(remainingDays),
                escape(isAllocated ? 'تخصیص یافته' : 'در صف'),
                escape(r.operatingBank || '-')
            ].join(",");
        });

        const csvContent = "\uFEFF" + rows.concat(dataRows).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Allocation_Queue_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleShareAllocationWhatsApp = async () => {
        if (!settings?.whatsappNumber) {
            alert('شماره واتساپ در تنظیمات وارد نشده است.');
            return;
        }
        let target = prompt("شماره یا آیدی گروه را وارد کنید:", settings.whatsappNumber);
        if (!target) return;

        setSendingReport(true);
        const element = document.getElementById('allocation-report-table-print-area');
        if (!element) {
            setSendingReport(false);
            return;
        }

        try {
            // @ts-ignore
            const canvas = await window.html2canvas(element, { 
                scale: 2, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                onclone: (doc) => {
                    const el = doc.getElementById('allocation-report-table-print-area');
                    if (el) {
                        el.style.width = '1200px'; // Force width for better image
                        el.style.direction = 'rtl';
                    }
                }
            });
            const base64 = canvas.toDataURL('image/png').split(',')[1];
            
            await apiCall('/send-whatsapp', 'POST', {
                number: target,
                message: `گزارش صف تخصیص ارز - ${new Date().toLocaleDateString('fa-IR')}`,
                mediaData: {
                    data: base64,
                    mimeType: 'image/png',
                    filename: `allocation_report.png`
                }
            });
            alert('گزارش با موفقیت به واتساپ ارسال شد.');
        } catch (e: any) {
            alert(`خطا در ارسال: ${e.message}`);
        } finally {
            setSendingReport(false);
        }
    };

    // ... (Keep existing renderReportContent) ...
    const renderReportContent = () => {
        let filteredRecords = records;
        if (reportFilterCompany) filteredRecords = records.filter(r => r.company === reportFilterCompany);
        if (reportSearchTerm) { const term = reportSearchTerm.toLowerCase(); filteredRecords = filteredRecords.filter(r => r.fileNumber.includes(term) || r.goodsName.includes(term) || r.sellerName.includes(term) || (r.registrationNumber && r.registrationNumber.includes(term)) ); }
        
        switch (activeReport) {
            case 'general': return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">فروشنده</th><th className="p-3">کالا</th><th className="p-3">شرکت</th><th className="p-3">مرحله جاری</th><th className="p-3">وضعیت</th></tr></thead><tbody>{filteredRecords.map(r => { const currentStage = STAGES.slice().reverse().find(s => r.stages[s]?.isCompleted) || 'شروع نشده'; return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{r.sellerName}</td><td className="p-3">{r.goodsName}</td><td className="p-3">{r.company}</td><td className="p-3"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">{currentStage}</span></td><td className="p-3">{r.status}</td></tr>); })}</tbody></table></div>);
            case 'currency': return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">ارز</th><th className="p-3">خریداری شده</th><th className="p-3">تحویل شده</th><th className="p-3">باقیمانده</th></tr></thead><tbody>{filteredRecords.map(r => { const d = r.currencyPurchaseData; if (!d) return null; const purchased = d.purchasedAmount || 0; const delivered = d.deliveredAmount || 0; return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{r.mainCurrency}</td><td className="p-3 font-bold text-blue-600">{formatCurrency(purchased)}</td><td className="p-3 font-bold text-green-600">{formatCurrency(delivered)}</td><td className="p-3 font-bold text-red-600">{formatCurrency(purchased - delivered)}</td></tr>); })}</tbody></table></div>);
            case 'allocation_queue':
                // Prepare Summary Data
                const companySummary: Record<string, { allocated: number, queue: number }> = {};
                let totalAllocated = 0;
                let totalQueue = 0;
                const usdRate = parseFloat(reportEurUsdRate) || 1.08;

                const processedRecords = filteredRecords.filter(r => r.stages[TradeStage.ALLOCATION_QUEUE]?.queueDate).map(r => {
                    const stageQ = r.stages[TradeStage.ALLOCATION_QUEUE];
                    const stageA = r.stages[TradeStage.ALLOCATION_APPROVED];
                    const isAllocated = stageA?.allocationCode;
                    
                    const amount = stageQ.costCurrency || 0;
                    const currency = r.mainCurrency || 'EUR';
                    let amountInUSD = 0;

                    if (currency === 'USD') amountInUSD = amount;
                    else if (currency === 'EUR') amountInUSD = amount * usdRate;
                    // Add more conversions if needed

                    if (!companySummary[r.company || 'Unknown']) {
                        companySummary[r.company || 'Unknown'] = { allocated: 0, queue: 0 };
                    }

                    if (isAllocated) {
                        companySummary[r.company || 'Unknown'].allocated += amountInUSD;
                        totalAllocated += amountInUSD;
                    } else {
                        companySummary[r.company || 'Unknown'].queue += amountInUSD;
                        totalQueue += amountInUSD;
                    }

                    return { ...r, amountInUSD, isAllocated };
                });

                return (
                    <div className="overflow-x-auto bg-white p-4 rounded-lg" id="allocation-report-table-print-area">
                        {/* Settings Bar for Report */}
                        <div className="bg-gray-100 p-3 rounded mb-4 flex flex-wrap gap-4 text-xs no-print items-center justify-between border border-gray-200">
                            <div className="flex gap-4 items-center">
                                <div className="flex items-center gap-2">
                                    <label className="font-bold text-gray-700">نرخ تبدیل یورو به دلار:</label>
                                    <input type="number" className="border p-1.5 rounded w-20 text-center" value={reportEurUsdRate} onChange={e => setReportEurUsdRate(e.target.value)} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="font-bold text-gray-700">نرخ دلار به ریال:</label>
                                    <input type="text" className="border p-1.5 rounded w-28 text-center" value={formatNumberString(reportUsdRialRate)} onChange={e => setReportUsdRialRate(deformatNumberString(e.target.value).toString())} />
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleExportAllocationExcel} className="bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 flex items-center gap-1"><FileSpreadsheet size={14}/> اکسل</button>
                                <button onClick={() => handleDownloadReportPDF('allocation-report-table-print-area', 'Allocation_Report')} className="bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 flex items-center gap-1"><FileDown size={14}/> PDF</button>
                                <button onClick={handleShareAllocationWhatsApp} disabled={sendingReport} className="bg-green-500 text-white px-3 py-1.5 rounded hover:bg-green-600 flex items-center gap-1">{sendingReport ? <Loader2 size={14} className="animate-spin"/> : <Share2 size={14}/>} واتساپ</button>
                                <button onClick={handlePrintReport} className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center gap-1"><Printer size={14}/> چاپ</button>
                            </div>
                        </div>

                        <table className="w-full text-[11px] text-center border-collapse border border-gray-400">
                            <thead>
                                <tr className="bg-[#1e3a8a] text-white">
                                    <th className="p-2 border border-gray-400">ردیف</th>
                                    <th className="p-2 border border-gray-400">مشخصات پروفرما</th>
                                    <th className="p-2 border border-gray-400">شماره ثبت سفارش</th>
                                    <th className="p-2 border border-gray-400">شرکت</th>
                                    <th className="p-2 border border-gray-400">مبلغ ثبت سفارش</th>
                                    <th className="p-2 border border-gray-400">تبدیل به دلار</th>
                                    <th className="p-2 border border-gray-400">معادل ریالی</th>
                                    <th className="p-2 border border-gray-400">زمان در صف</th>
                                    <th className="p-2 border border-gray-400">زمان تخصیص</th>
                                    <th className="p-2 border border-gray-400">مانده مهلت (روز)</th>
                                    <th className="p-2 border border-gray-400">وضعیت تخصیص</th>
                                    <th className="p-2 border border-gray-400">بانک عامل</th>
                                    <th className="p-2 border border-gray-400">اولویت</th>
                                    <th className="p-2 border border-gray-400">نوع ارز</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processedRecords.map((r, index) => {
                                    const stageQ = r.stages[TradeStage.ALLOCATION_QUEUE];
                                    const stageA = r.stages[TradeStage.ALLOCATION_APPROVED];
                                    const isAllocated = r.isAllocated;
                                    // const daysWait = calculateDaysDiff(stageQ.queueDate || ''); // Removed as per requested screenshot logic
                                    const rialRate = parseFloat(reportUsdRialRate) || 0;
                                    const rialEquiv = r.amountInUSD * rialRate;
                                    
                                    // Origin Label mapping
                                    const originMap: any = { 'Bank': 'بانکی', 'Export': 'صادرات', 'Free': 'آزاد', 'Nima': 'نیما' };
                                    const originLabel = originMap[r.currencyAllocationType || ''] || '-';

                                    // Calculate Remaining Days Logic
                                    let remainingDays: string | number = '-';
                                    let remainingColorClass = 'text-gray-500';

                                    if (isAllocated && stageA?.allocationExpiry) {
                                        const expiry = parsePersianDate(stageA.allocationExpiry);
                                        if (expiry) {
                                            const now = new Date();
                                            const diffTime = expiry.getTime() - now.getTime();
                                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                            remainingDays = diffDays;
                                            remainingColorClass = diffDays > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold';
                                        }
                                    }

                                    return (
                                        <tr key={r.id} className="hover:bg-gray-50 border-b border-gray-300">
                                            <td className="p-2 border-r border-gray-300">{index + 1}</td>
                                            <td className="p-2 border-r border-gray-300">
                                                <div className="font-bold">{r.fileNumber}</div>
                                                <div className="text-[9px] text-gray-500">{r.goodsName}</div>
                                            </td>
                                            <td className="p-2 border-r border-gray-300 font-mono">{r.registrationNumber || '-'}</td>
                                            <td className="p-2 border-r border-gray-300 font-bold">{r.company}</td>
                                            <td className="p-2 border-r border-gray-300 font-mono text-left" dir="ltr">{formatCurrency(stageQ.costCurrency)} {r.mainCurrency}</td>
                                            <td className="p-2 border-r border-gray-300 font-mono font-bold text-left" dir="ltr">$ {formatUSD(r.amountInUSD)}</td>
                                            <td className="p-2 border-r border-gray-300 font-mono text-blue-600 text-left" dir="ltr">{formatCurrency(rialEquiv)}</td>
                                            <td className="p-2 border-r border-gray-300 dir-ltr">{stageQ.queueDate}</td>
                                            <td className="p-2 border-r border-gray-300 dir-ltr">{stageA?.allocationDate || '-'}</td>
                                            <td className={`p-2 border-r border-gray-300 ${remainingColorClass}`}>{remainingDays}</td>
                                            <td className={`p-2 border-r border-gray-300 font-bold ${isAllocated ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                {isAllocated ? 'تخصیص یافته' : 'در صف'}
                                            </td>
                                            <td className="p-2 border-r border-gray-300">{r.operatingBank || '-'}</td>
                                            <td className="p-2 border-r border-gray-300"><input type="checkbox" disabled /></td>
                                            <td className="p-2 border-r border-gray-300 text-[10px]">{originLabel}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Summary Table */}
                        <div className="mt-8 border-t-2 border-blue-800 pt-2">
                            <h3 className="text-right font-bold text-blue-900 mb-2 border-r-4 border-blue-800 pr-2">خلاصه وضعیت ارزی به تفکیک شرکت (دلار آمریکا)</h3>
                            <table className="w-full text-xs text-center border-collapse border border-gray-400">
                                <thead>
                                    <tr className="bg-gray-100 text-gray-800">
                                        <th className="p-2 border border-gray-400">نام شرکت</th>
                                        <th className="p-2 border border-gray-400">جمع تخصیص یافته ($)</th>
                                        <th className="p-2 border border-gray-400">جمع در صف ($)</th>
                                        <th className="p-2 border border-gray-400 bg-gray-200">مجموع کل ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(companySummary).map(([comp, data]) => (
                                        <tr key={comp} className="hover:bg-gray-50 border-b border-gray-300">
                                            <td className="p-2 border-r border-gray-300 font-bold">{comp}</td>
                                            <td className="p-2 border-r border-gray-300 font-mono text-green-700 font-bold">{formatUSD(data.allocated)}</td>
                                            <td className="p-2 border-r border-gray-300 font-mono text-amber-700 font-bold">{formatUSD(data.queue)}</td>
                                            <td className="p-2 border-r border-gray-300 font-mono font-black bg-gray-50">{formatUSD(data.allocated + data.queue)}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-300 font-black border-t-2 border-gray-500">
                                        <td className="p-2 border-r border-gray-400">جمع نهایی</td>
                                        <td className="p-2 border-r border-gray-400 font-mono">{formatUSD(totalAllocated)}</td>
                                        <td className="p-2 border-r border-gray-400 font-mono">{formatUSD(totalQueue)}</td>
                                        <td className="p-2 border-r border-gray-400 font-mono">{formatUSD(totalAllocated + totalQueue)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            case 'clearance': return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">قبض انبار(ها)</th><th className="p-3">هزینه ترخیصیه</th><th className="p-3">تعداد پارت</th></tr></thead><tbody>{filteredRecords.filter(r => r.clearanceData?.receipts.length).map(r => { return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{r.clearanceData?.receipts.map(rc => rc.number).join(', ')}</td><td className="p-3">{formatCurrency(r.clearanceData?.payments.reduce((acc,p)=>acc+p.amount,0) || 0)}</td><td className="p-3">{r.clearanceData?.receipts.length}</td></tr>); })}</tbody></table></div>);
            case 'green_leaf': return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">کوتاژها</th><th className="p-3">حقوق گمرکی (بانک)</th><th className="p-3">ضمانت‌نامه‌ها</th><th className="p-3">جمع هزینه‌های گمرکی</th></tr></thead><tbody>{filteredRecords.filter(r => r.greenLeafData?.duties.length).map(r => { const d = r.greenLeafData; if(!d) return null; const total = calculateGreenLeafTotal(d); return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{d.duties.map(x => x.cottageNumber).join(', ')}</td><td className="p-3">{formatCurrency(d.duties.filter(x=>x.paymentMethod==='Bank').reduce((a,b)=>a+b.amount,0))}</td><td className="p-3">{d.guarantees.length} مورد</td><td className="p-3 font-bold">{formatCurrency(total)}</td></tr>); })}</tbody></table></div>);
            default: return <div>گزارش در حال تکمیل است...</div>;
        }
    };

    if (viewMode === 'reports') {
        return (
            <div className="flex h-[calc(100vh-100px)] bg-gray-50 rounded-2xl overflow-hidden border">
                <div className="w-64 bg-white border-l p-4 flex flex-col gap-2 flex-shrink-0">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FileSpreadsheet size={20}/> گزارشات بازرگانی</h3>
                    <div className="mb-4"><label className="text-xs font-bold text-gray-500 mb-1 block">فیلتر شرکت</label><select className="w-full border rounded p-1 text-sm" value={reportFilterCompany} onChange={e => setReportFilterCompany(e.target.value)}><option value="">همه شرکت‌ها</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <button onClick={() => setActiveReport('general')} className={`p-2 rounded text-right text-sm ${activeReport === 'general' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>📄 لیست کلی پرونده‌ها</button>
                    <button onClick={() => setActiveReport('allocation_queue')} className={`p-2 rounded text-right text-sm ${activeReport === 'allocation_queue' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>⏳ در صف تخصیص</button>
                    <button onClick={() => setActiveReport('currency')} className={`p-2 rounded text-right text-sm ${activeReport === 'currency' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>💰 وضعیت خرید ارز</button>
                    <button onClick={() => setActiveReport('clearance')} className={`p-2 rounded text-right text-sm ${activeReport === 'clearance' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>🏭 ترخیصیه و قبض انبار</button>
                    <button onClick={() => setActiveReport('green_leaf')} className={`p-2 rounded text-right text-sm ${activeReport === 'green_leaf' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>🍃 برگ سبز و گمرک</button>
                    <div className="mt-auto"><button onClick={handlePrintReport} className="w-full flex items-center justify-center gap-2 border p-2 rounded hover:bg-gray-50 text-gray-600"><Printer size={16}/> چاپ گزارش</button><button onClick={() => setViewMode('dashboard')} className="w-full mt-2 flex items-center justify-center gap-2 bg-gray-800 text-white p-2 rounded hover:bg-gray-900">بازگشت به داشبورد</button></div>
                </div>
                <div className="flex-1 p-6 overflow-hidden flex flex-col w-full">
                    <h2 className="text-xl font-bold mb-4">{activeReport === 'general' ? 'لیست کلی پرونده‌ها' : activeReport === 'allocation_queue' ? 'گزارش صف تخصیص' : activeReport === 'currency' ? 'گزارش ارزی' : 'گزارش'}</h2>
                    {renderReportContent()}
                </div>
            </div>
        );
    }

    if (selectedRecord && viewMode === 'details') {
        const totalRial = STAGES.reduce((sum, stage) => sum + (selectedRecord.stages[stage]?.costRial || 0), 0);
        const totalCurrency = STAGES.reduce((sum, stage) => sum + (selectedRecord.stages[stage]?.costCurrency || 0), 0);
        const exchangeRate = calcExchangeRate || 0;
        const grandTotalRial = totalRial + (totalCurrency * exchangeRate);
        const totalWeight = selectedRecord.items.reduce((sum, item) => sum + item.weight, 0);
        const costPerKg = totalWeight > 0 ? grandTotalRial / totalWeight : 0;

        return (
            <div className="flex flex-col h-[calc(100vh-100px)] animate-fade-in relative">
                {/* Stage Edit Modal */}
                {editingStage && (
                    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                            <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">ویرایش مرحله: {editingStage}</h3><button onClick={() => setEditingStage(null)}><X size={20}/></button></div>
                            <div className="space-y-4">
                                <label className="flex items-center gap-2"><input type="checkbox" checked={stageFormData.isCompleted} onChange={e => setStageFormData({...stageFormData, isCompleted: e.target.checked})} className="w-5 h-5"/> <span className="font-bold">مرحله تکمیل شده است</span></label>
                                {editingStage === TradeStage.ALLOCATION_QUEUE && (
                                    <div className="bg-amber-50 p-3 rounded border border-amber-200 space-y-2">
                                        <div><label className="text-xs font-bold block">تاریخ ورود به صف</label><input type="text" className="w-full border rounded p-2 text-sm" placeholder="1403/01/01" value={stageFormData.queueDate || ''} onChange={e => setStageFormData({...stageFormData, queueDate: e.target.value})} /></div>
                                        {stageFormData.queueDate && <div className="text-xs text-amber-700 font-bold">مدت انتظار: {calculateDaysDiff(stageFormData.queueDate)} روز</div>}
                                    </div>
                                )}
                                {editingStage === TradeStage.ALLOCATION_APPROVED && (
                                    <div className="bg-green-50 p-3 rounded border border-green-200 space-y-2">
                                        <div><label className="text-xs font-bold block">شماره فیش/تخصیص</label><input type="text" className="w-full border rounded p-2 text-sm" value={stageFormData.allocationCode || ''} onChange={e => setStageFormData({...stageFormData, allocationCode: e.target.value})} /></div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div><label className="text-xs font-bold block">تاریخ تخصیص</label><input type="text" className="w-full border rounded p-2 text-sm" placeholder="1403/01/01" value={stageFormData.allocationDate || ''} onChange={e => setStageFormData({...stageFormData, allocationDate: e.target.value})} /></div>
                                            <div><label className="text-xs font-bold block">مهلت انقضا</label><input type="text" className="w-full border rounded p-2 text-sm" placeholder="1403/02/01" value={stageFormData.allocationExpiry || ''} onChange={e => setStageFormData({...stageFormData, allocationExpiry: e.target.value})} /></div>
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold block">هزینه ریالی</label><input type="text" className="w-full border rounded p-2 text-sm" value={formatNumberString(stageFormData.costRial)} onChange={e => setStageFormData({...stageFormData, costRial: deformatNumberString(e.target.value)})} /></div>
                                    <div><label className="text-xs font-bold block">هزینه ارزی</label><input type="text" className="w-full border rounded p-2 text-sm" value={formatNumberString(stageFormData.costCurrency)} onChange={e => setStageFormData({...stageFormData, costCurrency: deformatNumberString(e.target.value)})} /></div>
                                </div>
                                <div><label className="text-xs font-bold block">توضیحات</label><textarea className="w-full border rounded p-2 text-sm h-24" value={stageFormData.description || ''} onChange={e => setStageFormData({...stageFormData, description: e.target.value})} /></div>
                                <div><label className="text-xs font-bold block mb-1">فایل‌های ضمیمه</label><div className="flex items-center gap-2 mb-2"><input type="file" ref={fileInputRef} className="hidden" onChange={handleStageFileChange} /><button onClick={() => fileInputRef.current?.click()} disabled={uploadingStageFile} className="bg-gray-100 border px-3 py-1 rounded text-xs hover:bg-gray-200">{uploadingStageFile ? 'در حال آپلود...' : 'افزودن فایل'}</button></div><div className="space-y-1">{stageFormData.attachments?.map((att, i) => (<div key={i} className="flex justify-between items-center bg-gray-50 p-2 rounded text-xs"><a href={att.url} target="_blank" className="text-blue-600 truncate max-w-[200px]">{att.fileName}</a><button onClick={() => setStageFormData({...stageFormData, attachments: stageFormData.attachments?.filter((_, idx) => idx !== i)})} className="text-red-500"><X size={14}/></button></div>))}</div></div>
                                <button onClick={handleSaveStage} className="w-full bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700">ذخیره تغییرات</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="bg-white border-b p-4 flex justify-between items-center shadow-sm z-10">
                    <div className="flex items-center gap-4"><button onClick={() => setViewMode('dashboard')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowRight /></button><div><h1 className="text-xl font-bold flex items-center gap-2">{selectedRecord.goodsName}<span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{selectedRecord.fileNumber}</span></h1><p className="text-xs text-gray-500">{selectedRecord.company} | {selectedRecord.sellerName}</p></div></div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        <button onClick={() => setActiveTab('timeline')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'timeline' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}>تایم‌لاین</button>
                        <button onClick={() => setActiveTab('proforma')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'proforma' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}>پروفرما</button>
                        <button onClick={() => setActiveTab('insurance')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'insurance' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}>بیمه</button>
                        <button onClick={() => setActiveTab('currency_purchase')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'currency_purchase' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}>خرید ارز</button>
                        <button onClick={() => setActiveTab('shipping_docs')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'shipping_docs' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}>اسناد حمل</button>
                        <button onClick={() => setActiveTab('inspection')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'inspection' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}>بازرسی</button>
                        <button onClick={() => setActiveTab('clearance_docs')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'clearance_docs' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}>ترخیصیه و انبار</button>
                        <button onClick={() => setActiveTab('green_leaf')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'green_leaf' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'}`}>برگ سبز</button>
                        <button onClick={() => setActiveTab('internal_shipping')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'internal_shipping' ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-gray-100'}`}>حمل داخلی</button>
                        <button onClick={() => setActiveTab('agent_fees')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'agent_fees' ? 'bg-teal-100 text-teal-700' : 'hover:bg-gray-100'}`}>هزینه‌های ترخیص</button>
                        <button onClick={() => setActiveTab('final_calculation')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${activeTab === 'final_calculation' ? 'bg-rose-100 text-rose-700' : 'hover:bg-gray-100'}`}>محاسبه نهایی</button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    
                    {/* TIMELINE TAB (RESTORED) */}
                    {activeTab === 'timeline' && (
                        <div className="p-6 max-w-4xl mx-auto">
                            <div className="relative border-r-2 border-gray-200 mr-4 space-y-8 pr-8">
                                {STAGES.map((stage, idx) => {
                                    const data = getStageData(selectedRecord, stage);
                                    return (
                                        <div key={stage} className="relative">
                                            <div className={`absolute -right-[41px] top-0 w-6 h-6 rounded-full border-4 ${data.isCompleted ? 'bg-green-500 border-green-100' : 'bg-gray-300 border-gray-100'}`}></div>
                                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleStageClick(stage)}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="font-bold text-gray-800 text-sm">{stage}</h3>
                                                        <p className="text-xs text-gray-500 mt-1">{data.description || 'بدون توضیحات'}</p>
                                                    </div>
                                                    {data.isCompleted && <CheckCircle2 size={16} className="text-green-500"/>}
                                                </div>
                                                <div className="mt-3 flex gap-2 text-xs">
                                                    {data.costRial > 0 && <span className="bg-gray-100 px-2 py-1 rounded">هزینه ریالی: {formatCurrency(data.costRial)}</span>}
                                                    {data.costCurrency > 0 && <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded">هزینه ارزی: {formatCurrency(data.costCurrency)}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* PROFORMA TAB (RESTORED) */}
                    {activeTab === 'proforma' && (
                        <div className="p-6 max-w-5xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border">
                                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">اطلاعات کلی پروفرما</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره پرونده</label><input className="w-full border rounded p-2 text-sm" value={selectedRecord.fileNumber} onChange={e => handleUpdateProforma('fileNumber', e.target.value)}/></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره ثبت سفارش</label><input className="w-full border rounded p-2 text-sm" value={selectedRecord.registrationNumber || ''} onChange={e => handleUpdateProforma('registrationNumber', e.target.value)}/></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">فروشنده</label><input className="w-full border rounded p-2 text-sm" value={selectedRecord.sellerName} onChange={e => handleUpdateProforma('sellerName', e.target.value)}/></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">ارز پایه</label><select className="w-full border rounded p-2 text-sm" value={selectedRecord.mainCurrency} onChange={e => handleUpdateProforma('mainCurrency', e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ ثبت سفارش</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/01/01" value={selectedRecord.registrationDate || ''} onChange={e => handleUpdateProforma('registrationDate', e.target.value)}/></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ انقضا</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/06/01" value={selectedRecord.registrationExpiry || ''} onChange={e => handleUpdateProforma('registrationExpiry', e.target.value)}/></div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">منشا ارز (نوع ارز)</label>
                                        <select 
                                            className="w-full border rounded p-2 text-sm" 
                                            value={selectedRecord.currencyAllocationType || ''} 
                                            onChange={e => handleUpdateProforma('currencyAllocationType', e.target.value)}
                                        >
                                            <option value="">انتخاب کنید...</option>
                                            <option value="Bank">بانکی (نیمایی)</option>
                                            <option value="Export">ارز حاصل از صادرات</option>
                                            <option value="Free">آزاد / اشخاص</option>
                                            <option value="Nima">سامانه نیما</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-700">بانک عامل</label>
                                        <select 
                                            className="w-full border rounded p-2 text-sm" 
                                            value={selectedRecord.operatingBank || ''} 
                                            onChange={e => handleUpdateProforma('operatingBank', e.target.value)}
                                        >
                                            <option value="">انتخاب کنید...</option>
                                            {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border">
                                <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">اقلام پروفرما</h3>
                                <div className="flex gap-2 items-end mb-4 bg-gray-50 p-3 rounded-lg">
                                    <div className="flex-1 space-y-1"><label className="text-xs text-gray-500">شرح کالا</label><input className="w-full border rounded p-2 text-sm" placeholder="نام کالا" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})}/></div>
                                    <div className="w-24 space-y-1"><label className="text-xs text-gray-500">وزن (KG)</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" placeholder="0" value={newItem.weight || ''} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})}/></div>
                                    <div className="w-28 space-y-1"><label className="text-xs text-gray-500">فی (Unit)</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr" placeholder="0" value={newItem.unitPrice || ''} onChange={e => setNewItem({...newItem, unitPrice: Number(e.target.value)})}/></div>
                                    <div className="w-32 space-y-1"><label className="text-xs text-gray-500">قیمت کل</label><input type="number" className="w-full border rounded p-2 text-sm dir-ltr bg-gray-100" placeholder="Auto" value={newItem.totalPrice || ((newItem.weight || 0) * (newItem.unitPrice || 0))} readOnly/></div>
                                    <button onClick={handleAddItem} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 h-[38px]"><Plus size={18}/></button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شرح</th><th className="p-3">وزن</th><th className="p-3">فی</th><th className="p-3">قیمت کل</th><th className="p-3">حذف</th></tr></thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {selectedRecord.items.map((item) => (
                                                <tr key={item.id}>
                                                    <td className="p-3">{item.name}</td>
                                                    <td className="p-3 font-mono">{formatNumberString(item.weight)}</td>
                                                    <td className="p-3 font-mono">{formatCurrency(item.unitPrice)}</td>
                                                    <td className="p-3 font-mono font-bold">{formatCurrency(item.totalPrice)}</td>
                                                    <td className="p-3"><button onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                                                </tr>
                                            ))}
                                            <tr className="bg-blue-50 font-bold">
                                                <td className="p-3">جمع کل</td>
                                                <td className="p-3 font-mono">{formatNumberString(selectedRecord.items.reduce((a,b)=>a+b.weight,0))}</td>
                                                <td></td>
                                                <td className="p-3 font-mono text-blue-700">{formatCurrency(selectedRecord.items.reduce((a,b)=>a+b.totalPrice,0))} {selectedRecord.mainCurrency}</td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <div className="bg-white p-6 rounded-xl shadow-sm border">
                                 <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 flex items-center gap-2"><Banknote size={20} className="text-purple-600"/> هزینه‌های ثبت سفارش (کارمزد بانکی و...)</h3>
                                 <div className="flex gap-2 items-end mb-4 bg-purple-50 p-3 rounded-lg">
                                     <div className="flex-1 space-y-1"><label className="text-xs text-gray-500">شرح هزینه</label><input className="w-full border rounded p-2 text-sm" value={newLicenseTx.description} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})}/></div>
                                     <div className="w-32 space-y-1"><label className="text-xs text-gray-500">مبلغ (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newLicenseTx.amount)} onChange={e => setNewLicenseTx({...newLicenseTx, amount: deformatNumberString(e.target.value)})}/></div>
                                     <div className="w-32 space-y-1"><label className="text-xs text-gray-500">تاریخ</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/xx/xx" value={newLicenseTx.date} onChange={e => setNewLicenseTx({...newLicenseTx, date: e.target.value})}/></div>
                                     <button onClick={handleAddLicenseTx} className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 h-[38px]"><Plus size={18}/></button>
                                 </div>
                                 <div className="space-y-1">
                                     {selectedRecord.licenseData?.transactions.map(tx => (
                                         <div key={tx.id} className="flex justify-between items-center bg-gray-50 p-2 rounded text-sm border">
                                             <div className="flex gap-4"><span>{tx.description}</span><span className="text-gray-500">{tx.date}</span></div>
                                             <div className="flex gap-4 items-center"><span className="font-bold text-purple-700 font-mono">{formatCurrency(tx.amount)}</span><button onClick={() => handleRemoveLicenseTx(tx.id)} className="text-red-500"><X size={14}/></button></div>
                                         </div>
                                     ))}
                                 </div>
                            </div>
                        </div>
                    )}

                    {/* INSURANCE TAB */}
                    {activeTab === 'insurance' && (
                        <div className="p-6 max-w-4xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Shield size={20} className="text-green-600"/> بیمه باربری</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره بیمه‌نامه</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={insuranceForm.policyNumber} onChange={e => setInsuranceForm({...insuranceForm, policyNumber: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شرکت بیمه</label><input className="w-full border rounded p-2 text-sm" value={insuranceForm.company} onChange={e => setInsuranceForm({...insuranceForm, company: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">هزینه اولیه (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(insuranceForm.cost)} onChange={e => setInsuranceForm({...insuranceForm, cost: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">بانک پرداخت کننده</label><select className="w-full border rounded p-2 text-sm" value={insuranceForm.bank} onChange={e => setInsuranceForm({...insuranceForm, bank: e.target.value})}><option value="">انتخاب بانک</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                </div>
                                <div className="flex justify-end"><button onClick={handleSaveInsurance} className="bg-green-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-green-700 flex items-center gap-2"><Save size={16}/> ذخیره اطلاعات بیمه</button></div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800">الحاقیه‌های بیمه</h3>
                                <div className="bg-gray-50 p-4 rounded-lg flex flex-wrap gap-4 items-end">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">نوع الحاقیه</label><div className="flex bg-white rounded border overflow-hidden"><button onClick={() => setEndorsementType('increase')} className={`px-3 py-1 text-xs font-bold ${endorsementType === 'increase' ? 'bg-blue-100 text-blue-700' : 'text-gray-600'}`}>افزایش حق بیمه</button><button onClick={() => setEndorsementType('refund')} className={`px-3 py-1 text-xs font-bold ${endorsementType === 'refund' ? 'bg-green-100 text-green-700' : 'text-gray-600'}`}>برگشت حق بیمه</button></div></div>
                                    <div className="space-y-1 flex-1 min-w-[150px]"><label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newEndorsement.amount)} onChange={e => setNewEndorsement({...newEndorsement, amount: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1 flex-1 min-w-[200px]"><label className="text-xs font-bold text-gray-700">توضیحات</label><input className="w-full border rounded p-2 text-sm" value={newEndorsement.description} onChange={e => setNewEndorsement({...newEndorsement, description: e.target.value})} /></div>
                                    <button onClick={handleAddEndorsement} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 h-[38px]"><Plus size={16} /></button>
                                </div>
                                <div className="space-y-2">{insuranceForm.endorsements?.map((end, idx) => (<div key={end.id} className={`flex justify-between items-center border p-3 rounded-lg ${end.amount > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}><div className="flex gap-4 text-sm"><span className="font-bold text-gray-800">{idx + 1}.</span><span>{end.date}</span><span className={`font-mono font-bold ${end.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>{end.amount > 0 ? '+' : ''}{formatCurrency(end.amount)}</span><span className="text-gray-600">{end.description}</span></div><button onClick={() => handleDeleteEndorsement(end.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={16}/></button></div>))}</div>
                            </div>
                        </div>
                    )}

                    {/* Currency Purchase Tab */}
                    {activeTab === 'currency_purchase' && (
                        <div className="p-6 max-w-5xl mx-auto space-y-6">
                            {/* Tranches Section */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Coins size={20} className="text-amber-600"/> پارت‌های خرید ارز</h3>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end bg-amber-50 p-4 rounded-lg">
                                    <div className="col-span-1 space-y-1"><label className="text-xs font-bold text-gray-700">مقدار ارز</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newCurrencyTranche.amount)} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, amount: deformatNumberString(e.target.value)})} /></div>
                                    <div className="col-span-1 space-y-1"><label className="text-xs font-bold text-gray-700">نرخ (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newCurrencyTranche.rate)} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, rate: deformatNumberString(e.target.value)})} /></div>
                                    <div className="col-span-1 space-y-1"><label className="text-xs font-bold text-gray-700">صرافی</label><input className="w-full border rounded p-2 text-sm" value={newCurrencyTranche.exchangeName} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, exchangeName: e.target.value})} /></div>
                                    <div className="col-span-1 space-y-1"><label className="text-xs font-bold text-gray-700">کارگزار</label><input className="w-full border rounded p-2 text-sm" value={newCurrencyTranche.brokerName} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, brokerName: e.target.value})} /></div>
                                    <div className="col-span-1 space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ خرید</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/01/01" value={newCurrencyTranche.date} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, date: e.target.value})} /></div>
                                    <div className="col-span-1"><button onClick={handleAddCurrencyTranche} className="w-full bg-amber-600 text-white p-2 rounded-lg text-sm font-bold hover:bg-amber-700"><Plus size={16} className="mx-auto" /></button></div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">تاریخ</th><th className="p-3">مقدار</th><th className="p-3">نرخ (ریال)</th><th className="p-3">صرافی / کارگزار</th><th className="p-3 text-center">وضعیت تحویل</th><th className="p-3">حذف</th></tr></thead>
                                        <tbody>
                                            {currencyForm.tranches?.map((t) => (
                                                <tr key={t.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-3">{t.date}</td>
                                                    <td className="p-3 font-mono font-bold text-blue-600">{formatCurrency(t.amount)} {t.currencyType}</td>
                                                    <td className="p-3 font-mono">{formatCurrency(t.rate || 0)}</td>
                                                    <td className="p-3 text-xs">{t.exchangeName} {t.brokerName ? `(${t.brokerName})` : ''}</td>
                                                    <td className="p-3 text-center">
                                                        <button onClick={() => handleToggleTrancheDelivery(t.id)} className={`px-2 py-1 rounded text-xs font-bold ${t.isDelivered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                            {t.isDelivered ? 'تحویل شده' : 'انتظار'}
                                                        </button>
                                                    </td>
                                                    <td className="p-3"><button onClick={() => handleRemoveTranche(t.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                                                </tr>
                                            ))}
                                            <tr className="bg-amber-50 font-bold border-t-2 border-amber-200">
                                                <td className="p-3">جمع کل</td>
                                                <td className="p-3 font-mono text-amber-800">{formatCurrency(currencyForm.purchasedAmount)} {selectedRecord.mainCurrency}</td>
                                                <td colSpan={4} className="text-center text-xs text-amber-600">تحویل شده: {formatCurrency(currencyForm.deliveredAmount)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Guarantee Cheque Section */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><ShieldCheck size={20} className="text-purple-600"/> چک ضمانت ارزی (رفع تعهد)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end bg-purple-50 p-4 rounded-lg">
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره چک</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={currencyGuarantee.number} onChange={e => setCurrencyGuarantee({...currencyGuarantee, number: e.target.value})} /></div>
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-700">نام بانک</label><select className="w-full border rounded p-2 text-sm" value={currencyGuarantee.bank} onChange={e => setCurrencyGuarantee({...currencyGuarantee, bank: e.target.value})}><option value="">انتخاب</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={currencyGuarantee.amount} onChange={e => setCurrencyGuarantee({...currencyGuarantee, amount: formatNumberString(deformatNumberString(e.target.value).toString())})} /></div>
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ سررسید</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/xx/xx" value={currencyGuarantee.date} onChange={e => setCurrencyGuarantee({...currencyGuarantee, date: e.target.value})} /></div>
                                     <button onClick={handleSaveCurrencyGuarantee} className="bg-purple-600 text-white p-2 rounded-lg text-sm font-bold hover:bg-purple-700 h-[38px]"><Save size={16} /></button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className="text-sm font-bold text-gray-700">وضعیت چک:</label>
                                    <button onClick={handleToggleCurrencyGuaranteeDelivery} className={`px-3 py-1 rounded text-xs font-bold transition-colors ${currencyGuarantee.isDelivered ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}`}>
                                        {currencyGuarantee.isDelivered ? 'عودت داده شد (رفع تعهد)' : 'نزد بانک (در جریان)'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Shipping Docs Tab */}
                    {activeTab === 'shipping_docs' && (
                        <div className="p-6 max-w-5xl mx-auto flex gap-6">
                            <div className="w-48 flex flex-col gap-2">
                                <button onClick={() => setActiveShippingSubTab('Commercial Invoice')} className={`p-3 rounded-lg text-sm text-right font-bold ${activeShippingSubTab === 'Commercial Invoice' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white hover:bg-gray-50'}`}>اینویس</button>
                                <button onClick={() => setActiveShippingSubTab('Packing List')} className={`p-3 rounded-lg text-sm text-right font-bold ${activeShippingSubTab === 'Packing List' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white hover:bg-gray-50'}`}>پکینگ لیست</button>
                                <button onClick={() => setActiveShippingSubTab('Bill of Lading')} className={`p-3 rounded-lg text-sm text-right font-bold ${activeShippingSubTab === 'Bill of Lading' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white hover:bg-gray-50'}`}>بارنامه</button>
                                <button onClick={() => setActiveShippingSubTab('Certificate of Origin')} className={`p-3 rounded-lg text-sm text-right font-bold ${activeShippingSubTab === 'Certificate of Origin' ? 'bg-blue-600 text-white shadow-lg' : 'bg-white hover:bg-gray-50'}`}>گواهی مبدا</button>
                            </div>
                            <div className="flex-1 bg-white p-6 rounded-xl shadow-sm border space-y-6">
                                <h3 className="font-bold text-gray-800 border-b pb-2 mb-4">{activeShippingSubTab === 'Commercial Invoice' ? 'سیاهه تجاری (Invoice)' : activeShippingSubTab === 'Packing List' ? 'لیست عدل‌بندی (Packing List)' : activeShippingSubTab}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره سند</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={shippingDocForm.documentNumber} onChange={e => setShippingDocForm({...shippingDocForm, documentNumber: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ سند</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={shippingDocForm.documentDate} onChange={e => setShippingDocForm({...shippingDocForm, documentDate: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">وضعیت</label><select className="w-full border rounded p-2 text-sm" value={shippingDocForm.status} onChange={e => setShippingDocForm({...shippingDocForm, status: e.target.value as DocStatus})}><option value="Draft">پیش‌نویس</option><option value="Final">نهایی</option></select></div>
                                </div>

                                {activeShippingSubTab === 'Commercial Invoice' && (
                                    <div className="bg-blue-50 p-4 rounded-lg space-y-4">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-bold text-sm text-blue-800">اقلام اینویس</h4>
                                            <div className="flex gap-2 items-center">
                                                <select className="border rounded p-1 text-xs" value={shippingDocForm.currency} onChange={e => setShippingDocForm({...shippingDocForm, currency: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
                                                <button onClick={handleSyncInvoiceToProforma} className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1 transition-colors" title="جایگزینی اقلام اینویس در پروفرما"><RefreshCw size={14}/> جایگزینی در پروفرما</button>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 items-end">
                                            <input className="flex-1 border rounded p-2 text-sm" placeholder="نام کالا" value={newInvoiceItem.name} onChange={e => setNewInvoiceItem({...newInvoiceItem, name: e.target.value})} />
                                            <input className="w-20 border rounded p-2 text-sm dir-ltr" placeholder="وزن" value={newInvoiceItem.weight || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, weight: Number(e.target.value)})} type="number" />
                                            <input className="w-24 border rounded p-2 text-sm dir-ltr" placeholder="فی (Unit)" value={newInvoiceItem.unitPrice || ''} onChange={e => setNewInvoiceItem({...newInvoiceItem, unitPrice: Number(e.target.value)})} type="number" step="0.0001" />
                                            <input className="w-20 border rounded p-2 text-sm" placeholder="پارت" value={newInvoiceItem.part} onChange={e => setNewInvoiceItem({...newInvoiceItem, part: e.target.value})} />
                                            <input className="w-24 border rounded p-2 text-sm dir-ltr bg-gray-100" placeholder="قیمت کل" value={newInvoiceItem.totalPrice || ((newInvoiceItem.weight || 0) * (newInvoiceItem.unitPrice || 0))} readOnly />
                                            <button onClick={handleAddInvoiceItem} className="bg-blue-600 text-white p-2 rounded-lg"><Plus size={16}/></button>
                                        </div>
                                        <div className="space-y-1">{shippingDocForm.invoiceItems?.map(i => (<div key={i.id} className="flex justify-between bg-white p-2 rounded text-xs border"><span>{i.name}</span><div className="flex gap-2 items-center"><span className="bg-gray-100 px-1 rounded text-gray-500">Part: {i.part}</span><span className="font-mono">{i.weight} KG</span><span className="font-mono">@{i.unitPrice}</span><span className="font-mono font-bold">{formatCurrency(i.totalPrice)}</span><button onClick={()=>handleRemoveInvoiceItem(i.id)} className="text-red-500"><X size={14}/></button></div></div>))}</div>
                                        <div className="flex justify-between items-center pt-2 border-t border-blue-200"><span className="font-bold text-xs">هزینه حمل (Freight)</span><input className="w-32 border rounded p-1 text-sm dir-ltr" value={shippingDocForm.freightCost} onChange={e => setShippingDocForm({...shippingDocForm, freightCost: Number(e.target.value)})} type="number" /></div>
                                    </div>
                                )}

                                {activeShippingSubTab === 'Packing List' && (
                                    <div className="bg-orange-50 p-4 rounded-lg space-y-4">
                                        <h4 className="font-bold text-sm text-orange-800 flex items-center gap-2"><Box size={16}/> اقلام پکینگ لیست</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                                            <div className="md:col-span-2 space-y-1"><label className="text-[10px] text-gray-500">شرح کالا</label><input className="w-full border rounded p-1.5 text-sm" placeholder="نام کالا" value={newPackingItem.description} onChange={e => setNewPackingItem({...newPackingItem, description: e.target.value})} /></div>
                                            <div className="space-y-1"><label className="text-[10px] text-gray-500">پارت</label><input className="w-full border rounded p-1.5 text-sm" placeholder="Part No" value={newPackingItem.part} onChange={e => setNewPackingItem({...newPackingItem, part: e.target.value})} /></div>
                                            <div className="space-y-1"><label className="text-[10px] text-gray-500">وزن خالص</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="NW" value={newPackingItem.netWeight || ''} onChange={e => setNewPackingItem({...newPackingItem, netWeight: Number(e.target.value)})} type="number" /></div>
                                            <div className="space-y-1"><label className="text-xs text-gray-500">وزن ناخالص</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="GW" value={newPackingItem.grossWeight || ''} onChange={e => setNewPackingItem({...newPackingItem, grossWeight: Number(e.target.value)})} type="number" /></div>
                                            <div className="flex gap-2">
                                                <div className="space-y-1 flex-1"><label className="text-[10px] text-gray-500">تعداد بسته</label><input className="w-full border rounded p-1.5 text-sm dir-ltr" placeholder="Count" value={newPackingItem.packageCount || ''} onChange={e => setNewPackingItem({...newPackingItem, packageCount: Number(e.target.value)})} type="number" /></div>
                                                <button onClick={handleAddPackingItem} className="bg-orange-600 text-white p-1.5 rounded-lg h-[34px] mt-auto w-10 flex items-center justify-center"><Plus size={16}/></button>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs text-right bg-white rounded border border-orange-200">
                                                <thead className="bg-orange-100 text-orange-800"><tr><th className="p-2">شرح</th><th className="p-2">پارت</th><th className="p-2">وزن خالص</th><th className="p-2">وزن ناخالص</th><th className="p-2">تعداد</th><th className="p-2"></th></tr></thead>
                                                <tbody>
                                                    {shippingDocForm.packingItems?.map(item => (
                                                        <tr key={item.id} className="border-t hover:bg-orange-50">
                                                            <td className="p-2 font-bold">{item.description}</td>
                                                            <td className="p-2">{item.part}</td>
                                                            <td className="p-2 font-mono">{item.netWeight}</td>
                                                            <td className="p-2 font-mono">{item.grossWeight}</td>
                                                            <td className="p-2 font-mono">{item.packageCount}</td>
                                                            <td className="p-2 text-center"><button onClick={() => handleRemovePackingItem(item.id)} className="text-red-500 hover:text-red-700"><X size={14}/></button></td>
                                                        </tr>
                                                    ))}
                                                    <tr className="bg-orange-50 font-bold border-t-2 border-orange-200">
                                                        <td colSpan={2} className="p-2 text-center text-orange-800">جمع کل</td>
                                                        <td className="p-2 font-mono text-orange-700">{shippingDocForm.packingItems?.reduce((s,i)=>s+i.netWeight,0)}</td>
                                                        <td className="p-2 font-mono text-orange-700">{shippingDocForm.packingItems?.reduce((s,i)=>s+i.grossWeight,0)}</td>
                                                        <td className="p-2 font-mono text-orange-700">{shippingDocForm.packingItems?.reduce((s,i)=>s+i.packageCount,0)}</td>
                                                        <td></td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                                
                                <div><label className="text-xs font-bold block mb-1">فایل‌های ضمیمه</label><div className="flex items-center gap-2 mb-2"><input type="file" ref={docFileInputRef} className="hidden" onChange={handleDocFileChange} /><button onClick={() => docFileInputRef.current?.click()} disabled={uploadingDocFile} className="bg-gray-100 border px-3 py-1 rounded text-xs hover:bg-gray-200">{uploadingDocFile ? 'در حال آپلود...' : 'افزودن فایل'}</button></div><div className="space-y-1">{shippingDocForm.attachments?.map((att, i) => (<div key={i} className="flex justify-between items-center bg-gray-50 p-2 rounded text-xs"><span className="truncate max-w-[200px]">{att.fileName}</span><button onClick={() => setShippingDocForm({...shippingDocForm, attachments: shippingDocForm.attachments?.filter((_, idx) => idx !== i)})} className="text-red-500"><X size={14}/></button></div>))}</div></div>

                                <div className="flex justify-end pt-4 border-t"><button onClick={handleSaveShippingDoc} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700">ثبت سند</button></div>
                                
                                <div className="mt-6"><h4 className="font-bold text-sm text-gray-500 mb-2">اسناد ثبت شده</h4><div className="space-y-2">{selectedRecord.shippingDocuments?.filter(d => d.type === activeShippingSubTab).map(doc => (<div key={doc.id} className="border p-3 rounded-lg flex justify-between items-center bg-gray-50"><div className="text-sm"><span className="font-mono font-bold">{doc.documentNumber}</span> <span className="text-xs text-gray-500">({doc.documentDate})</span></div><button onClick={() => handleDeleteShippingDoc(doc.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></div>))}</div></div>
                            </div>
                        </div>
                    )}

                    {/* INTERNAL SHIPPING TAB */}
                    {activeTab === 'internal_shipping' && (
                        <div className="p-6 max-w-5xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Truck size={20} className="text-indigo-600"/> هزینه‌های حمل داخلی</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-indigo-50 p-4 rounded-lg">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شرح / پارت</label><input className="w-full border rounded p-2 text-sm" placeholder="مثال: کرایه حمل تا انبار" value={newShippingPayment.part} onChange={e => setNewShippingPayment({...newShippingPayment, part: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newShippingPayment.amount)} onChange={e => setNewShippingPayment({...newShippingPayment, amount: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ پرداخت</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/01/01" value={newShippingPayment.date} onChange={e => setNewShippingPayment({...newShippingPayment, date: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">بانک</label><select className="w-full border rounded p-2 text-sm" value={newShippingPayment.bank} onChange={e => setNewShippingPayment({...newShippingPayment, bank: e.target.value})}><option value="">انتخاب بانک</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    <div className="md:col-span-4 space-y-1"><label className="text-xs font-bold text-gray-700">توضیحات تکمیلی</label><input className="w-full border rounded p-2 text-sm" placeholder="توضیحات..." value={newShippingPayment.description} onChange={e => setNewShippingPayment({...newShippingPayment, description: e.target.value})} /></div>
                                    <div className="md:col-span-4 flex justify-end"><button onClick={handleAddShippingPayment} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 flex items-center gap-2"><Plus size={16}/> افزودن پرداخت</button></div>
                                </div>
                                
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شرح / پارت</th><th className="p-3">مبلغ (ریال)</th><th className="p-3">تاریخ</th><th className="p-3">بانک</th><th className="p-3">توضیحات</th><th className="p-3">حذف</th></tr></thead>
                                        <tbody>
                                            {internalShippingForm.payments?.map((p) => (
                                                <tr key={p.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-3 font-bold">{p.part}</td>
                                                    <td className="p-3 font-mono">{formatCurrency(p.amount)}</td>
                                                    <td className="p-3">{p.date}</td>
                                                    <td className="p-3">{p.bank}</td>
                                                    <td className="p-3 text-gray-500 text-xs">{p.description}</td>
                                                    <td className="p-3"><button onClick={() => handleDeleteShippingPayment(p.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                                                </tr>
                                            ))}
                                            <tr className="bg-indigo-50 font-bold border-t-2 border-indigo-200">
                                                <td className="p-3">جمع کل حمل داخلی</td>
                                                <td className="p-3 font-mono text-indigo-700">{formatCurrency(internalShippingForm.payments?.reduce((acc, p) => acc + p.amount, 0) || 0)}</td>
                                                <td colSpan={4}></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AGENT FEES TAB */}
                    {activeTab === 'agent_fees' && (
                        <div className="p-6 max-w-5xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><UserCheck size={20} className="text-teal-600"/> هزینه‌های ترخیص (کارمزد ترخیص‌کار)</h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-teal-50 p-4 rounded-lg">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">نام ترخیص‌کار</label><input className="w-full border rounded p-2 text-sm" placeholder="نام شخص یا شرکت" value={newAgentPayment.agentName} onChange={e => setNewAgentPayment({...newAgentPayment, agentName: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مبلغ ترخیص (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newAgentPayment.amount)} onChange={e => setNewAgentPayment({...newAgentPayment, amount: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ پرداخت</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/01/01" value={newAgentPayment.date} onChange={e => setNewAgentPayment({...newAgentPayment, date: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">بانک</label><select className="w-full border rounded p-2 text-sm" value={newAgentPayment.bank} onChange={e => setNewAgentPayment({...newAgentPayment, bank: e.target.value})}><option value="">انتخاب بانک</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    <div className="md:col-span-2 space-y-1"><label className="text-xs font-bold text-gray-700">پارت / مرحله</label><input className="w-full border rounded p-2 text-sm" placeholder="مثال: پیش پرداخت" value={newAgentPayment.part} onChange={e => setNewAgentPayment({...newAgentPayment, part: e.target.value})} /></div>
                                    <div className="md:col-span-2 space-y-1"><label className="text-xs font-bold text-gray-700">توضیحات</label><input className="w-full border rounded p-2 text-sm" placeholder="..." value={newAgentPayment.description} onChange={e => setNewAgentPayment({...newAgentPayment, description: e.target.value})} /></div>
                                    <div className="md:col-span-4 flex justify-end"><button onClick={handleAddAgentPayment} className="bg-teal-600 text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-teal-700 flex items-center gap-2"><Plus size={16}/> ثبت پرداخت</button></div>
                                </div>
                                
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">ترخیص‌کار</th><th className="p-3">مبلغ (ریال)</th><th className="p-3">بانک</th><th className="p-3">تاریخ</th><th className="p-3">پارت</th><th className="p-3">توضیحات</th><th className="p-3">حذف</th></tr></thead>
                                        <tbody>
                                            {agentForm.payments?.map((p) => (
                                                <tr key={p.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-3 font-bold">{p.agentName}</td>
                                                    <td className="p-3 font-mono">{formatCurrency(p.amount)}</td>
                                                    <td className="p-3">{p.bank}</td>
                                                    <td className="p-3">{p.date}</td>
                                                    <td className="p-3">{p.part}</td>
                                                    <td className="p-3 text-gray-500 text-xs">{p.description}</td>
                                                    <td className="p-3"><button onClick={() => handleDeleteAgentPayment(p.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button></td>
                                                </tr>
                                            ))}
                                            <tr className="bg-teal-50 font-bold border-t-2 border-teal-200">
                                                <td className="p-3">جمع کل هزینه‌های ترخیص</td>
                                                <td className="p-3 font-mono text-teal-700">{formatCurrency(agentForm.payments?.reduce((acc, p) => acc + p.amount, 0) || 0)}</td>
                                                <td colSpan={5}></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* INSPECTION TAB */}
                    {activeTab === 'inspection' && (
                        <div className="p-6 max-w-5xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Microscope size={20} className="text-blue-600"/> گواهی‌های بازرسی (COI)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-blue-50 p-4 rounded-lg">
                                    <div className="space-y-1 md:col-span-2"><label className="text-xs font-bold text-gray-700">شرکت بازرسی</label><input className="w-full border rounded p-2 text-sm" value={newInspectionCertificate.company} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, company: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره گواهی</label><input className="w-full border rounded p-2 text-sm" value={newInspectionCertificate.certificateNumber} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, certificateNumber: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">هزینه بازرسی (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newInspectionCertificate.amount)} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, amount: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">پارت / توضیحات</label><div className="flex gap-1"><input className="w-full border rounded p-2 text-sm" value={newInspectionCertificate.part} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, part: e.target.value})} /><button onClick={handleAddInspectionCertificate} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700"><Plus size={16}/></button></div></div>
                                </div>
                                <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شرکت</th><th className="p-3">شماره گواهی</th><th className="p-3">هزینه</th><th className="p-3">پارت</th><th className="p-3">حذف</th></tr></thead><tbody>{inspectionForm.certificates?.map(c => (<tr key={c.id} className="border-b hover:bg-gray-50"><td className="p-3">{c.company}</td><td className="p-3 font-mono">{c.certificateNumber}</td><td className="p-3 font-mono">{formatCurrency(c.amount)}</td><td className="p-3">{c.part}</td><td className="p-3"><button onClick={()=>handleDeleteInspectionCertificate(c.id)} className="text-red-500"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800">پرداخت‌های بازرسی</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-gray-50 p-4 rounded-lg">
                                    <div className="space-y-1 md:col-span-2"><label className="text-xs font-bold text-gray-700">بانک پرداخت کننده</label><select className="w-full border rounded p-2 text-sm" value={newInspectionPayment.bank} onChange={e => setNewInspectionPayment({...newInspectionPayment, bank: e.target.value})}><option value="">انتخاب بانک</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newInspectionPayment.amount)} onChange={e => setNewInspectionPayment({...newInspectionPayment, amount: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ</label><input className="w-full border rounded p-2 text-sm dir-ltr" placeholder="1403/xx/xx" value={newInspectionPayment.date} onChange={e => setNewInspectionPayment({...newInspectionPayment, date: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">پارت</label><div className="flex gap-1"><input className="w-full border rounded p-2 text-sm" value={newInspectionPayment.part} onChange={e => setNewInspectionPayment({...newInspectionPayment, part: e.target.value})} /><button onClick={handleAddInspectionPayment} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700"><Plus size={16}/></button></div></div>
                                </div>
                                <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">بانک</th><th className="p-3">مبلغ</th><th className="p-3">تاریخ</th><th className="p-3">پارت</th><th className="p-3">حذف</th></tr></thead><tbody>{inspectionForm.payments?.map(p => (<tr key={p.id} className="border-b hover:bg-gray-50"><td className="p-3">{p.bank}</td><td className="p-3 font-mono">{formatCurrency(p.amount)}</td><td className="p-3">{p.date}</td><td className="p-3">{p.part}</td><td className="p-3"><button onClick={()=>handleDeleteInspectionPayment(p.id)} className="text-red-500"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
                            </div>
                        </div>
                    )}

                    {/* CLEARANCE DOCS TAB */}
                    {activeTab === 'clearance_docs' && (
                        <div className="p-6 max-w-5xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Warehouse size={20} className="text-indigo-600"/> قبض انبار و ترخیصیه</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end bg-indigo-50 p-4 rounded-lg">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره قبض انبار</label><input className="w-full border rounded p-2 text-sm" value={newWarehouseReceipt.number} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, number: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ صدور</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={newWarehouseReceipt.issueDate} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, issueDate: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">پارت / توضیحات</label><input className="w-full border rounded p-2 text-sm" value={newWarehouseReceipt.part} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, part: e.target.value})} /></div>
                                    <button onClick={handleAddWarehouseReceipt} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 h-[38px]"><Plus size={16} className="mx-auto"/></button>
                                </div>
                                <div className="space-y-2">{clearanceForm.receipts?.map(r => (<div key={r.id} className="flex justify-between items-center border p-3 rounded-lg bg-gray-50"><div><span className="font-bold text-sm">شماره: {r.number}</span> <span className="text-xs text-gray-500 mx-2">تاریخ: {r.issueDate}</span> <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{r.part}</span></div><button onClick={()=>handleDeleteWarehouseReceipt(r.id)} className="text-red-500"><Trash2 size={16}/></button></div>))}</div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800">هزینه‌های ترخیصیه ( کشتیرانی / ایجنت )</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-gray-50 p-4 rounded-lg">
                                    <div className="space-y-1 md:col-span-2"><label className="text-xs font-bold text-gray-700">بانک پرداخت کننده</label><select className="w-full border rounded p-2 text-sm" value={newClearancePayment.bank} onChange={e => setNewClearancePayment({...newClearancePayment, bank: e.target.value})}><option value="">انتخاب بانک</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مبلغ (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newClearancePayment.amount)} onChange={e => setNewClearancePayment({...newClearancePayment, amount: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">تاریخ</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={newClearancePayment.date} onChange={e => setNewClearancePayment({...newClearancePayment, date: e.target.value})} /></div>
                                    <button onClick={handleAddClearancePayment} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 h-[38px]"><Plus size={16} className="mx-auto"/></button>
                                </div>
                                <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">بانک</th><th className="p-3">مبلغ</th><th className="p-3">تاریخ</th><th className="p-3">حذف</th></tr></thead><tbody>{clearanceForm.payments?.map(p => (<tr key={p.id} className="border-b hover:bg-gray-50"><td className="p-3">{p.bank}</td><td className="p-3 font-mono">{formatCurrency(p.amount)}</td><td className="p-3">{p.date}</td><td className="p-3"><button onClick={()=>handleDeleteClearancePayment(p.id)} className="text-red-500"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
                            </div>
                        </div>
                    )}

                    {/* GREEN LEAF TAB */}
                    {activeTab === 'green_leaf' && (
                        <div className="p-6 max-w-5xl mx-auto space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Leaf size={20} className="text-green-600"/> اظهارنامه و کوتاژ (حقوق ورودی)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end bg-green-50 p-4 rounded-lg">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره کوتاژ</label><input className="w-full border rounded p-2 text-sm" value={newCustomsDuty.cottageNumber} onChange={e => setNewCustomsDuty({...newCustomsDuty, cottageNumber: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مبلغ کل (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newCustomsDuty.amount)} onChange={e => setNewCustomsDuty({...newCustomsDuty, amount: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">روش پرداخت</label><select className="w-full border rounded p-2 text-sm" value={newCustomsDuty.paymentMethod} onChange={e => setNewCustomsDuty({...newCustomsDuty, paymentMethod: e.target.value as 'Bank' | 'Guarantee'})}><option value="Bank">نقدی (بانک)</option><option value="Guarantee">ضمانت‌نامه</option></select></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-700">پارت</label><input className="w-full border rounded p-2 text-sm" value={newCustomsDuty.part} onChange={e => setNewCustomsDuty({...newCustomsDuty, part: e.target.value})} /></div>
                                    <button onClick={handleAddCustomsDuty} className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 h-[38px]"><Plus size={16} className="mx-auto"/></button>
                                </div>
                                <div className="space-y-2">{greenLeafForm.duties?.map(d => (<div key={d.id} className="flex justify-between items-center border p-3 rounded-lg bg-gray-50"><div><span className="font-bold text-sm">کوتاژ: {d.cottageNumber}</span> <span className="text-xs bg-gray-200 px-2 py-0.5 rounded mx-2">{d.paymentMethod === 'Bank' ? 'نقدی' : 'ضمانت‌نامه'}</span> <span className="font-mono font-bold text-green-700">{formatCurrency(d.amount)}</span></div><button onClick={()=>handleDeleteCustomsDuty(d.id)} className="text-red-500"><Trash2 size={16}/></button></div>))}</div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2"><ShieldCheck size={20} className="text-orange-600"/> ضمانت‌نامه‌های گمرکی</h3>
                                <div className="bg-orange-50 p-4 rounded-lg space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مربوط به کوتاژ</label><select className="w-full border rounded p-2 text-sm bg-white" value={selectedDutyForGuarantee} onChange={e => setSelectedDutyForGuarantee(e.target.value)}><option value="">انتخاب کوتاژ</option>{greenLeafForm.duties.map(d => <option key={d.id} value={d.id}>{d.cottageNumber} ({formatCurrency(d.amount)})</option>)}</select></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره ضمانت‌نامه</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={newGuaranteeDetails.guaranteeNumber} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, guaranteeNumber: e.target.value})} /></div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">شماره چک تضمین</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={newGuaranteeDetails.chequeNumber} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeNumber: e.target.value})} /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">مبلغ چک (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newGuaranteeDetails.chequeAmount)} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeAmount: deformatNumberString(e.target.value)})} /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">بانک چک</label><select className="w-full border rounded p-2 text-sm bg-white" value={newGuaranteeDetails.chequeBank} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeBank: e.target.value})}><option value="">انتخاب بانک</option>{availableBanks.map(b => <option key={b} value={b}>{b}</option>)}</select></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-700">سپرده نقدی (ریال)</label><input className="w-full border rounded p-2 text-sm dir-ltr" value={formatNumberString(newGuaranteeDetails.cashAmount)} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, cashAmount: deformatNumberString(e.target.value)})} /></div>
                                    </div>
                                    <button onClick={handleAddGuarantee} className="w-full bg-orange-600 text-white p-2 rounded-lg font-bold hover:bg-orange-700">ثبت ضمانت‌نامه</button>
                                </div>
                                <div className="space-y-2">{greenLeafForm.guarantees?.map(g => (<div key={g.id} className="border p-3 rounded-lg bg-gray-50 flex justify-between items-center"><div className="text-sm space-y-1"><div className="font-bold">شماره: {g.guaranteeNumber}</div><div className="text-xs text-gray-600">چک: {g.chequeNumber} ({g.chequeBank}) - مبلغ: {formatCurrency(g.chequeAmount || 0)}</div><div className="text-xs text-gray-600">سپرده نقدی: {formatCurrency(g.cashAmount || 0)}</div></div><div className="flex gap-2 items-center"><button onClick={() => handleToggleGuaranteeDelivery(g.id)} className={`text-xs px-2 py-1 rounded font-bold transition-colors ${g.isDelivered ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{g.isDelivered ? 'عودت شد' : 'نزد سازمان'}</button><button onClick={()=>handleDeleteGuarantee(g.id)} className="text-red-500"><Trash2 size={16}/></button></div></div>))}</div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                    <h3 className="font-bold text-gray-800">مالیات بر ارزش افزوده</h3>
                                    <div className="flex gap-2 items-end"><input className="flex-1 border rounded p-2 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newTax.amount)} onChange={e => setNewTax({...newTax, amount: deformatNumberString(e.target.value)})} /><button onClick={handleAddTax} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"><Plus size={16}/></button></div>
                                    <div className="space-y-1">{greenLeafForm.taxes?.map(t => (<div key={t.id} className="flex justify-between bg-gray-50 p-2 rounded text-sm"><span className="font-mono">{formatCurrency(t.amount)}</span><button onClick={()=>handleDeleteTax(t.id)} className="text-red-500"><X size={14}/></button></div>))}</div>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
                                    <h3 className="font-bold text-gray-800">عوارض راهداری / هلال احمر</h3>
                                    <div className="flex gap-2 items-end"><input className="flex-1 border rounded p-2 text-sm dir-ltr" placeholder="مبلغ (ریال)" value={formatNumberString(newRoadToll.amount)} onChange={e => setNewRoadToll({...newRoadToll, amount: deformatNumberString(e.target.value)})} /><button onClick={handleAddRoadToll} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"><Plus size={16}/></button></div>
                                    <div className="space-y-1">{greenLeafForm.roadTolls?.map(t => (<div key={t.id} className="flex justify-between bg-gray-50 p-2 rounded text-sm"><span className="font-mono">{formatCurrency(t.amount)}</span><button onClick={()=>handleDeleteRoadToll(t.id)} className="text-red-500"><X size={14}/></button></div>))}</div>
                                </div>
                            </div>
                            <div className="bg-green-100 p-4 rounded-lg flex justify-between items-center font-bold text-green-900 border border-green-200"><span>جمع کل هزینه‌های گمرکی (نقدی + سپرده + مالیات + عوارض)</span><span className="font-mono text-lg">{formatCurrency(calculateGreenLeafTotal(greenLeafForm))}</span></div>
                        </div>
                    )}

                    {/* FINAL CALCULATION TAB */}
                    {activeTab === 'final_calculation' && (
                        <div className="p-6 max-w-6xl mx-auto space-y-8">
                            <div className="bg-white p-6 rounded-xl shadow-sm border flex flex-col md:flex-row justify-between items-center gap-4">
                                <div><h3 className="font-bold text-gray-800 text-lg mb-1">وضعیت نهایی پرونده</h3><p className="text-xs text-gray-500">مدیریت تعهدات و بایگانی پرونده</p></div>
                                <div className="flex gap-2 flex-wrap justify-end">
                                    <button onClick={toggleCommitment} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 border transition-colors ${selectedRecord.isCommitmentFulfilled ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-green-50'}`}>{selectedRecord.isCommitmentFulfilled ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}{selectedRecord.isCommitmentFulfilled ? 'رفع تعهد شده' : 'رفع تعهد نشده'}</button>
                                    <button onClick={handleArchiveRecord} disabled={selectedRecord.isArchived} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${selectedRecord.isArchived ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'}`}><Archive size={18}/> {selectedRecord.isArchived ? 'بایگانی شده (ترخیص شد)' : 'ترخیص شد (بایگانی)'}</button>
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-2">
                                <button onClick={handlePrintTrade} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm"><Printer size={16}/> چاپ گزارش</button>
                                <button onClick={handleDownloadFinalCalculationPDF} disabled={isGeneratingPdf} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 text-sm">{isGeneratingPdf ? <Loader2 size={16} className="animate-spin"/> : <FileDown size={16}/>} دانلود PDF</button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="bg-white p-6 rounded-xl shadow-sm border h-fit"><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Calculator size={20} className="text-rose-600"/> صورت کلی هزینه‌ها</h3><div className="overflow-hidden rounded-lg border"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شرح هزینه</th><th className="p-3">مبلغ ارزی</th><th className="p-3">مبلغ ریالی</th></tr></thead><tbody className="divide-y divide-gray-100">{STAGES.map(stage => { const data = selectedRecord.stages[stage]; if (!data || (data.costRial === 0 && data.costCurrency === 0)) return null; return (<tr key={stage}><td className="p-3 text-gray-600">{stage}</td><td className="p-3 font-mono">{data.costCurrency > 0 ? formatCurrency(data.costCurrency) : '-'}</td><td className="p-3 font-mono">{formatCurrency(data.costRial)}</td></tr>); })}<tr className="bg-rose-50 font-bold border-t-2 border-rose-200"><td className="p-3">جمع کل</td><td className="p-3 font-mono dir-ltr">{formatCurrency(totalCurrency)} {selectedRecord.mainCurrency}</td><td className="p-3 font-mono dir-ltr">{formatCurrency(totalRial)} IRR</td></tr></tbody></table></div><div className="mt-4 bg-gray-50 p-4 rounded-lg border border-gray-200"><label className="text-xs font-bold text-gray-600 block mb-2">نرخ ارز محاسباتی</label><div className="flex gap-2"><input className="flex-1 border rounded p-2 text-sm dir-ltr font-mono font-bold" value={formatNumberString(calcExchangeRate)} onChange={e => handleUpdateCalcRate(deformatNumberString(e.target.value))} placeholder="نرخ تبدیل..." /><div className="bg-gray-200 px-3 py-2 rounded text-sm font-bold flex items-center">ریال</div></div><div className="mt-3 pt-3 border-t border-gray-300 flex justify-between items-center"><span className="text-sm font-bold text-gray-700">قیمت نهایی کل (ریالی):</span><span className="text-lg font-black text-rose-700 dir-ltr">{formatCurrency(grandTotalRial)}</span></div><div className="mt-1 flex justify-between items-center"><span className="text-xs text-gray-500">میانگین قیمت هر کیلو:</span><span className="text-sm font-bold text-gray-700 dir-ltr">{formatCurrency(costPerKg)}</span></div></div></div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border h-fit"><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><ShieldCheck size={20} className="text-blue-600"/> لیست چک‌های ضمانت</h3><div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">نوع</th><th className="p-3">شماره / بانک</th><th className="p-3">مبلغ</th><th className="p-3">وضعیت</th></tr></thead><tbody className="divide-y divide-gray-100">{getAllGuarantees().map((g) => (<tr key={g.id}><td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded ${g.type === 'ارزی' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{g.type}</span></td><td className="p-3"><div className="font-mono text-xs">{g.number}</div><div className="text-[10px] text-gray-500">{g.bank}</div></td><td className="p-3 font-mono">{formatCurrency(Number(g.amount))}</td><td className="p-3 text-center"><button onClick={g.toggleFunc} className={`text-xs px-2 py-1 rounded font-bold transition-colors ${g.isDelivered ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>{g.isDelivered ? 'عودت شد' : 'نزد سازمان'}</button></td></tr>))}{getAllGuarantees().length === 0 && (<tr><td colSpan={4} className="p-4 text-center text-gray-400">هیچ ضمانت‌نامه‌ای ثبت نشده است</td></tr>)}</tbody></table></div></div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border"><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Scale size={20} className="text-emerald-600"/> قیمت تمام شده کالاها (به تفکیک)</h3><div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-emerald-50 text-emerald-800"><tr><th className="p-3 rounded-r-lg">ردیف</th><th className="p-3">شرح کالا</th><th className="p-3">وزن (KG)</th><th className="p-3">قیمت خرید (ارزی)</th><th className="p-3">سهم از هزینه‌ها (ریال)</th><th className="p-3">قیمت تمام شده نهایی (ریال)</th><th className="p-3 rounded-l-lg">قیمت تمام شده هر کیلو</th></tr></thead><tbody className="divide-y divide-gray-100">{selectedRecord.items.map((item, idx) => { const totalPurchasePriceCurrency = selectedRecord.items.reduce((acc, i) => acc + i.totalPrice, 0); const totalPurchasePriceRial = totalPurchasePriceCurrency * exchangeRate; const totalOverheadRial = grandTotalRial - totalPurchasePriceRial; const weightShare = totalWeight > 0 ? item.weight / totalWeight : 0; const allocatedOverhead = totalOverheadRial * weightShare; const itemPurchasePriceRial = item.totalPrice * exchangeRate; const finalItemCost = itemPurchasePriceRial + allocatedOverhead; const finalItemCostPerKg = item.weight > 0 ? finalItemCost / item.weight : 0; return (<tr key={item.id} className="hover:bg-gray-50"><td className="p-3 text-center">{idx + 1}</td><td className="p-3 font-bold">{item.name}</td><td className="p-3 font-mono">{formatNumberString(item.weight)}</td><td className="p-3 font-mono">{formatCurrency(item.totalPrice)} {selectedRecord.mainCurrency}</td><td className="p-3 text-gray-500 font-mono text-xs">{formatCurrency(allocatedOverhead)}</td><td className="p-3 font-mono font-bold text-emerald-700">{formatCurrency(finalItemCost)}</td><td className="p-3 font-mono font-bold text-blue-700 bg-blue-50">{formatCurrency(finalItemCostPerKg)}</td></tr>); })}<tr className="bg-gray-100 font-bold border-t-2 border-emerald-200"><td colSpan={2} className="p-3 text-center">جمع کل</td><td className="p-3 font-mono dir-ltr">{formatNumberString(totalWeight)} KG</td><td className="p-3 font-mono dir-ltr">{formatCurrency(selectedRecord.items.reduce((acc, i) => acc + i.totalPrice, 0))} {selectedRecord.mainCurrency}</td><td className="p-3 font-mono dir-ltr">{formatCurrency(grandTotalRial - (selectedRecord.items.reduce((acc, i) => acc + i.totalPrice, 0) * exchangeRate))}</td><td className="p-3 font-mono dir-ltr text-emerald-800">{formatCurrency(grandTotalRial)}</td><td></td></tr></tbody></table></div></div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Dashboard View
    return (
        <div className="p-6 h-[calc(100vh-100px)] overflow-y-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                    {navLevel !== 'ROOT' && <button onClick={navLevel === 'GROUP' ? () => goCompany(selectedCompany!) : goRoot} className="p-2 hover:bg-white rounded-full transition-colors"><ChevronRight /></button>}
                    <h2 className="text-2xl font-bold text-gray-800">{navLevel === 'ROOT' ? 'پرونده‌های بازرگانی' : navLevel === 'COMPANY' ? selectedCompany : selectedGroup}</h2>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => setShowArchived(!showArchived)} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${showArchived ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border'}`}><Archive size={18} /> {showArchived ? 'نمایش فعال‌ها' : 'نمایش بایگانی'}</button>
                    <button onClick={() => setViewMode('reports')} className="px-4 py-2 rounded-lg text-sm font-bold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 flex items-center gap-2"><FileSpreadsheet size={18} /> گزارشات</button>
                    <button onClick={() => setShowNewModal(true)} className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-600/20"><Plus size={18} /> پرونده جدید</button>
                </div>
            </div>

            {/* Breadcrumb / Search */}
            <div className="mb-6 flex gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input type="text" placeholder="جستجو در پرونده‌ها..." className="w-full pl-4 pr-10 py-3 rounded-xl border-none shadow-sm focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {searchTerm ? (
                    // Search Results
                    records.filter(r => (showArchived ? r.isArchived : !r.isArchived) && (r.goodsName.includes(searchTerm) || r.fileNumber.includes(searchTerm) || r.sellerName.includes(searchTerm))).map(record => (
                        <div key={record.id} onClick={() => { setSelectedRecord(record); setActiveTab('timeline'); setViewMode('details'); }} className="bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-blue-200 group">
                            <div className="flex justify-between items-start mb-3">
                                <div className="bg-blue-50 text-blue-600 p-2 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors"><FileText size={24} /></div>
                                <span className={`text-[10px] px-2 py-1 rounded-full ${record.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{record.status === 'Completed' ? 'تکمیل شده' : 'در جریان'}</span>
                            </div>
                            <h3 className="font-bold text-gray-800 mb-1 truncate">{record.goodsName}</h3>
                            <p className="text-xs text-gray-500 mb-3 font-mono">{record.fileNumber}</p>
                            <div className="flex justify-between items-center text-xs text-gray-400 border-t pt-3">
                                <span>{record.company}</span>
                                <span>{record.sellerName}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    // Folders (Company / Group) or Files
                    navLevel !== 'GROUP' ? (
                        getGroupedData().map((item: any) => (
                            <div key={item.name} onClick={() => item.type === 'company' ? goCompany(item.name) : goGroup(item.name)} className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-indigo-200 flex flex-col items-center justify-center gap-3 group">
                                <div className={`p-4 rounded-full ${item.type === 'company' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'} group-hover:scale-110 transition-transform`}>
                                    {item.type === 'company' ? <Building2 size={32} /> : <Package size={32} />}
                                </div>
                                <h3 className="font-bold text-gray-800 text-lg text-center">{item.name}</h3>
                                <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{item.count} پرونده</span>
                            </div>
                        ))
                    ) : (
                        // List Records in Group
                        records.filter(r => (showArchived ? r.isArchived : !r.isArchived) && r.company === selectedCompany && r.commodityGroup === selectedGroup).map(record => (
                            <div key={record.id} onClick={() => { setSelectedRecord(record); setActiveTab('timeline'); setViewMode('details'); }} className="bg-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-blue-200 group relative">
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record.id); }} className="absolute top-4 left-4 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="bg-blue-50 text-blue-600 p-2 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors"><FileText size={24} /></div>
                                </div>
                                <h3 className="font-bold text-gray-800 mb-1 truncate">{record.goodsName}</h3>
                                <p className="text-xs text-gray-500 mb-3 font-mono">{record.fileNumber}</p>
                                <div className="flex justify-between items-center text-xs text-gray-400 border-t pt-3">
                                    <span>{record.sellerName}</span>
                                    <span>{new Date(record.createdAt).toLocaleDateString('fa-IR')}</span>
                                </div>
                            </div>
                        ))
                    )
                )}
            </div>

            {/* New Record Modal */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-fade-in">
                        <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-gray-800">ایجاد پرونده جدید</h3><button onClick={() => setShowNewModal(false)}><X size={24} className="text-gray-400 hover:text-red-500"/></button></div>
                        <div className="space-y-4">
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">شماره پرونده</label><input className="w-full border rounded-xl p-3 bg-gray-50 font-mono text-left dir-ltr" value={newFileNumber} onChange={e => setNewFileNumber(e.target.value)} placeholder="File No..." /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">نام کالا (شرح کلی)</label><input className="w-full border rounded-xl p-3 bg-gray-50" value={newGoodsName} onChange={e => setNewGoodsName(e.target.value)} placeholder="مثال: قطعات الکترونیکی" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">فروشنده</label><input className="w-full border rounded-xl p-3 bg-gray-50" value={newSellerName} onChange={e => setNewSellerName(e.target.value)} /></div>
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">ارز پایه</label><select className="w-full border rounded-xl p-3 bg-gray-50" value={newMainCurrency} onChange={e => setNewMainCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">گروه کالایی</label><select className="w-full border rounded-xl p-3 bg-gray-50" value={newCommodityGroup} onChange={e => setNewCommodityGroup(e.target.value)}><option value="">انتخاب...</option>{commodityGroups.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">شرکت</label><select className="w-full border rounded-xl p-3 bg-gray-50" value={newRecordCompany} onChange={e => setNewRecordCompany(e.target.value)}><option value="">انتخاب...</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            </div>
                            <button onClick={handleCreateRecord} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 mt-4">ایجاد پرونده</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TradeModule;
