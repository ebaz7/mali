
import React, { useState, useEffect, useRef } from 'react';
import { User, TradeRecord, TradeStage, TradeItem, SystemSettings, InsuranceEndorsement, CurrencyPurchaseData, TradeTransaction, CurrencyTranche, TradeStageData, ShippingDocument, ShippingDocType, DocStatus, InvoiceItem, InspectionData, InspectionPayment, InspectionCertificate, ClearanceData, WarehouseReceipt, ClearancePayment, GreenLeafData, GreenLeafCustomsDuty, GreenLeafGuarantee, GreenLeafTax, GreenLeafRoadToll, InternalShippingData, ShippingPayment } from '../types';
import { getTradeRecords, saveTradeRecord, updateTradeRecord, deleteTradeRecord, getSettings, uploadFile } from '../services/storageService';
import { generateUUID, formatCurrency, formatNumberString, deformatNumberString, parsePersianDate, formatDate, calculateDaysDiff } from '../constants';
import { Container, Plus, Search, CheckCircle2, Save, Trash2, X, Package, ArrowRight, History, Banknote, Coins, Wallet, FileSpreadsheet, Shield, LayoutDashboard, Printer, FileDown, Paperclip, Building2, FolderOpen, Home, Calculator, FileText, Microscope, ListFilter, Warehouse, Calendar, PieChart, BarChart, Clock, Leaf, Scale, ShieldCheck, Percent, Truck, CheckSquare, Square, ToggleLeft, ToggleRight, DollarSign } from 'lucide-react';

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

    // Navigation State
    const [navLevel, setNavLevel] = useState<'ROOT' | 'COMPANY' | 'GROUP'>('ROOT');
    const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<'dashboard' | 'details' | 'reports'>('dashboard');
    const [activeReport, setActiveReport] = useState<ReportType>('general');
    const [reportFilterCompany, setReportFilterCompany] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal & Form States
    const [showNewModal, setShowNewModal] = useState(false);
    const [newFileNumber, setNewFileNumber] = useState('');
    const [newGoodsName, setNewGoodsName] = useState(''); // Stores System File Number
    const [newSellerName, setNewSellerName] = useState('');
    const [newCommodityGroup, setNewCommodityGroup] = useState('');
    const [newMainCurrency, setNewMainCurrency] = useState('EUR');
    const [newRecordCompany, setNewRecordCompany] = useState('');
    
    const [activeTab, setActiveTab] = useState<'timeline' | 'proforma' | 'insurance' | 'currency_purchase' | 'shipping_docs' | 'inspection' | 'clearance_docs' | 'green_leaf' | 'internal_shipping'>('timeline');
    
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
        freightCost: 0
    });
    const [newInvoiceItem, setNewInvoiceItem] = useState<Partial<InvoiceItem>>({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
    const [uploadingDocFile, setUploadingDocFile] = useState(false);
    const docFileInputRef = useRef<HTMLInputElement>(null);

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
            // Initialize Forms
            setInsuranceForm(selectedRecord.insuranceData || { policyNumber: '', company: '', cost: 0, bank: '', endorsements: [] });
            
            const inspData = selectedRecord.inspectionData || { certificates: [], payments: [] };
            if (inspData.certificates.length === 0 && selectedRecord.inspectionData?.certificateNumber) {
                 inspData.certificates.push({ id: generateUUID(), part: 'Original', certificateNumber: selectedRecord.inspectionData.certificateNumber, company: selectedRecord.inspectionData.inspectionCompany || '', amount: selectedRecord.inspectionData.totalInvoiceAmount || 0 });
            }
            setInspectionForm(inspData);

            setClearanceForm(selectedRecord.clearanceData || { receipts: [], payments: [] });

            setGreenLeafForm(selectedRecord.greenLeafData || { duties: [], guarantees: [], taxes: [], roadTolls: [] });
            
            setInternalShippingForm(selectedRecord.internalShippingData || { payments: [] });

            const curData = selectedRecord.currencyPurchaseData || { payments: [], purchasedAmount: 0, purchasedCurrencyType: selectedRecord.mainCurrency || 'EUR', tranches: [], isDelivered: false, deliveredAmount: 0 };
            if (!curData.tranches) curData.tranches = [];
            setCurrencyForm(curData as CurrencyPurchaseData);
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
            
            // Reset Inputs
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
            setShippingDocForm({ status: 'Draft', documentNumber: '', documentDate: '', attachments: [], currency: selectedRecord.mainCurrency || 'EUR', invoiceItems: [], freightCost: 0 });
            setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 });
        }
    }, [selectedRecord]);

    const loadRecords = async () => { setRecords(await getTradeRecords()); };

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

    const handleCreateRecord = async () => { 
        if (!newFileNumber || !newGoodsName) return; 
        const newRecord: TradeRecord = { 
            id: generateUUID(), 
            company: newRecordCompany, 
            fileNumber: newFileNumber, 
            orderNumber: newFileNumber, 
            goodsName: newGoodsName, // Used as Title on Dashboard
            registrationNumber: newGoodsName, // Used as NTSW Number
            sellerName: newSellerName, 
            commodityGroup: newCommodityGroup, 
            mainCurrency: newMainCurrency, 
            items: [], 
            freightCost: 0, 
            startDate: new Date().toISOString(), 
            status: 'Active', 
            stages: {}, 
            createdAt: Date.now(), 
            createdBy: currentUser.fullName, 
            licenseData: { transactions: [] }, 
            shippingDocuments: [] 
        }; 
        STAGES.forEach(stage => { newRecord.stages[stage] = { stage, isCompleted: false, description: '', costRial: 0, costCurrency: 0, currencyType: newMainCurrency, attachments: [], updatedAt: Date.now(), updatedBy: '' }; }); 
        await saveTradeRecord(newRecord); 
        await loadRecords(); 
        setShowNewModal(false); 
        setNewFileNumber(''); 
        setNewGoodsName(''); 
        setSelectedRecord(newRecord); 
        setActiveTab('proforma'); 
        setViewMode('details'); 
    };
    
    const handleDeleteRecord = async (id: string) => { if (confirm("آیا از حذف این پرونده بازرگانی اطمینان دارید؟")) { await deleteTradeRecord(id); if (selectedRecord?.id === id) setSelectedRecord(null); loadRecords(); } };
    
    // Proforma Handlers
    const handleUpdateProforma = (field: keyof TradeRecord, value: string | number) => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, [field]: value }; updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddItem = async () => { if (!selectedRecord || !newItem.name) return; const item: TradeItem = { id: generateUUID(), name: newItem.name, weight: Number(newItem.weight), unitPrice: Number(newItem.unitPrice), totalPrice: Number(newItem.totalPrice) || (Number(newItem.weight) * Number(newItem.unitPrice)) }; const updatedItems = [...selectedRecord.items, item]; const updatedRecord = { ...selectedRecord, items: updatedItems }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 }); };
    const handleRemoveItem = async (id: string) => { if (!selectedRecord) return; const updatedItems = selectedRecord.items.filter(i => i.id !== id); const updatedRecord = { ...selectedRecord, items: updatedItems }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddLicenseTx = async () => { if (!selectedRecord || !newLicenseTx.amount) return; const tx: TradeTransaction = { id: generateUUID(), date: newLicenseTx.date || '', amount: Number(newLicenseTx.amount), bank: newLicenseTx.bank || '', description: newLicenseTx.description || '' }; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = [...(currentLicenseData.transactions || []), tx]; const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; updatedRecord.stages[TradeStage.LICENSES].isCompleted = totalCost > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewLicenseTx({ amount: 0, bank: '', date: '', description: 'هزینه ثبت سفارش' }); };
    const handleRemoveLicenseTx = async (id: string) => { if (!selectedRecord) return; const currentLicenseData = selectedRecord.licenseData || { transactions: [] }; const updatedTransactions = (currentLicenseData.transactions || []).filter(t => t.id !== id); const updatedRecord = { ...selectedRecord, licenseData: { ...currentLicenseData, transactions: updatedTransactions } }; const totalCost = updatedTransactions.reduce((acc, t) => acc + t.amount, 0); if (!updatedRecord.stages[TradeStage.LICENSES]) updatedRecord.stages[TradeStage.LICENSES] = getStageData(updatedRecord, TradeStage.LICENSES); updatedRecord.stages[TradeStage.LICENSES].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    // Insurance Handlers
    const handleSaveInsurance = async () => { if (!selectedRecord) return; const updatedRecord = { ...selectedRecord, insuranceData: insuranceForm }; const totalCost = (Number(insuranceForm.cost) || 0) + (insuranceForm.endorsements || []).reduce((acc, e) => acc + e.amount, 0); if (!updatedRecord.stages[TradeStage.INSURANCE]) updatedRecord.stages[TradeStage.INSURANCE] = getStageData(updatedRecord, TradeStage.INSURANCE); updatedRecord.stages[TradeStage.INSURANCE].costRial = totalCost; updatedRecord.stages[TradeStage.INSURANCE].isCompleted = !!insuranceForm.policyNumber; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); alert("اطلاعات بیمه ذخیره شد."); };
    const handleAddEndorsement = () => { if (!newEndorsement.amount) return; const amount = endorsementType === 'increase' ? Number(newEndorsement.amount) : -Number(newEndorsement.amount); const endorsement: InsuranceEndorsement = { id: generateUUID(), date: newEndorsement.date || '', amount: amount, description: newEndorsement.description || '' }; const updatedEndorsements = [...(insuranceForm.endorsements || []), endorsement]; setInsuranceForm({ ...insuranceForm, endorsements: updatedEndorsements }); setNewEndorsement({ amount: 0, description: '', date: '' }); };
    const handleDeleteEndorsement = (id: string) => { setInsuranceForm({ ...insuranceForm, endorsements: insuranceForm.endorsements?.filter(e => e.id !== id) }); };

    // Inspection Handlers
    const handleAddInspectionCertificate = async () => { if (!selectedRecord || !newInspectionCertificate.amount) return; const cert: InspectionCertificate = { id: generateUUID(), part: newInspectionCertificate.part || 'Part', company: newInspectionCertificate.company || '', certificateNumber: newInspectionCertificate.certificateNumber || '', amount: Number(newInspectionCertificate.amount), description: '' }; const updatedCertificates = [...(inspectionForm.certificates || []), cert]; const updatedData = { ...inspectionForm, certificates: updatedCertificates }; setInspectionForm(updatedData); setNewInspectionCertificate({ part: '', company: '', certificateNumber: '', amount: 0 }); const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); updatedRecord.stages[TradeStage.INSPECTION].isCompleted = updatedCertificates.length > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteInspectionCertificate = async (id: string) => { if (!selectedRecord) return; const updatedCertificates = (inspectionForm.certificates || []).filter(c => c.id !== id); const updatedData = { ...inspectionForm, certificates: updatedCertificates }; setInspectionForm(updatedData); const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddInspectionPayment = async () => { if (!selectedRecord || !newInspectionPayment.amount) return; const payment: InspectionPayment = { id: generateUUID(), part: newInspectionPayment.part || 'Part', amount: Number(newInspectionPayment.amount), date: newInspectionPayment.date || '', bank: newInspectionPayment.bank || '', description: '' }; const updatedPayments = [...(inspectionForm.payments || []), payment]; const updatedData = { ...inspectionForm, payments: updatedPayments }; setInspectionForm(updatedData); setNewInspectionPayment({ part: '', amount: 0, date: '', bank: '' }); const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteInspectionPayment = async (id: string) => { if (!selectedRecord) return; const updatedPayments = (inspectionForm.payments || []).filter(p => p.id !== id); const updatedData = { ...inspectionForm, payments: updatedPayments }; setInspectionForm(updatedData); const updatedRecord = { ...selectedRecord, inspectionData: updatedData }; if (!updatedRecord.stages[TradeStage.INSPECTION]) updatedRecord.stages[TradeStage.INSPECTION] = getStageData(updatedRecord, TradeStage.INSPECTION); updatedRecord.stages[TradeStage.INSPECTION].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0); await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    // Clearance Handlers
    const handleAddWarehouseReceipt = async () => { if (!selectedRecord || !newWarehouseReceipt.number) return; const receipt: WarehouseReceipt = { id: generateUUID(), number: newWarehouseReceipt.number || '', part: newWarehouseReceipt.part || '', issueDate: newWarehouseReceipt.issueDate || '' }; const updatedReceipts = [...(clearanceForm.receipts || []), receipt]; const updatedData = { ...clearanceForm, receipts: updatedReceipts }; setClearanceForm(updatedData); setNewWarehouseReceipt({ number: '', part: '', issueDate: '' }); const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); updatedRecord.stages[TradeStage.CLEARANCE_DOCS].isCompleted = updatedReceipts.length > 0; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteWarehouseReceipt = async (id: string) => { if (!selectedRecord) return; const updatedReceipts = (clearanceForm.receipts || []).filter(r => r.id !== id); const updatedData = { ...clearanceForm, receipts: updatedReceipts }; setClearanceForm(updatedData); const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleAddClearancePayment = async () => { if (!selectedRecord || !newClearancePayment.amount) return; const payment: ClearancePayment = { id: generateUUID(), amount: Number(newClearancePayment.amount), part: newClearancePayment.part || '', bank: newClearancePayment.bank || '', date: newClearancePayment.date || '', payingBank: newClearancePayment.payingBank }; const updatedPayments = [...(clearanceForm.payments || []), payment]; const updatedData = { ...clearanceForm, payments: updatedPayments }; setClearanceForm(updatedData); setNewClearancePayment({ amount: 0, part: '', bank: '', date: '', payingBank: '' }); const totalCost = updatedPayments.reduce((acc, p) => acc + p.amount, 0); const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); updatedRecord.stages[TradeStage.CLEARANCE_DOCS].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };
    const handleDeleteClearancePayment = async (id: string) => { if (!selectedRecord) return; const updatedPayments = (clearanceForm.payments || []).filter(p => p.id !== id); const updatedData = { ...clearanceForm, payments: updatedPayments }; setClearanceForm(updatedData); const totalCost = updatedPayments.reduce((acc, p) => acc + p.amount, 0); const updatedRecord = { ...selectedRecord, clearanceData: updatedData }; if (!updatedRecord.stages[TradeStage.CLEARANCE_DOCS]) updatedRecord.stages[TradeStage.CLEARANCE_DOCS] = getStageData(updatedRecord, TradeStage.CLEARANCE_DOCS); updatedRecord.stages[TradeStage.CLEARANCE_DOCS].costRial = totalCost; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    // Green Leaf Handlers
    const calculateGreenLeafTotal = (data: GreenLeafData) => {
        let total = 0;
        // 1. Bank payments from Customs Duties
        total += data.duties.filter(d => d.paymentMethod === 'Bank').reduce((acc, d) => acc + d.amount, 0);
        // 2. Cash deposits and Cheque Amounts from Guarantees
        total += data.guarantees.reduce((acc, g) => acc + (g.cashAmount || 0) + (g.chequeAmount || 0), 0);
        // 3. Tax
        total += data.taxes.reduce((acc, t) => acc + t.amount, 0);
        // 4. Road Tolls
        total += data.roadTolls.reduce((acc, r) => acc + r.amount, 0);
        return total;
    };

    const updateGreenLeafRecord = async (newData: GreenLeafData) => {
        if (!selectedRecord) return;
        setGreenLeafForm(newData);
        const totalCost = calculateGreenLeafTotal(newData);
        const updatedRecord = { ...selectedRecord, greenLeafData: newData };
        
        if (!updatedRecord.stages[TradeStage.GREEN_LEAF]) updatedRecord.stages[TradeStage.GREEN_LEAF] = getStageData(updatedRecord, TradeStage.GREEN_LEAF);
        updatedRecord.stages[TradeStage.GREEN_LEAF].costRial = totalCost;
        updatedRecord.stages[TradeStage.GREEN_LEAF].isCompleted = (newData.duties.length > 0);
        
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleAddCustomsDuty = async () => {
        if (!newCustomsDuty.cottageNumber || !newCustomsDuty.amount) return;
        const duty: GreenLeafCustomsDuty = {
            id: generateUUID(),
            cottageNumber: newCustomsDuty.cottageNumber,
            part: newCustomsDuty.part || '',
            amount: Number(newCustomsDuty.amount),
            paymentMethod: newCustomsDuty.paymentMethod || 'Bank',
            bank: newCustomsDuty.bank,
            date: newCustomsDuty.date
        };
        const updatedDuties = [...greenLeafForm.duties, duty];
        await updateGreenLeafRecord({ ...greenLeafForm, duties: updatedDuties });
        setNewCustomsDuty({ cottageNumber: '', part: '', amount: 0, paymentMethod: 'Bank', bank: '', date: '' });
    };

    const handleDeleteCustomsDuty = async (id: string) => {
        // Also remove related guarantee if any
        const updatedDuties = greenLeafForm.duties.filter(d => d.id !== id);
        const updatedGuarantees = greenLeafForm.guarantees.filter(g => g.relatedDutyId !== id);
        await updateGreenLeafRecord({ ...greenLeafForm, duties: updatedDuties, guarantees: updatedGuarantees });
    };

    const handleAddGuarantee = async () => {
        if (!selectedDutyForGuarantee || !newGuaranteeDetails.guaranteeNumber) return;
        
        const duty = greenLeafForm.duties.find(d => d.id === selectedDutyForGuarantee);
        const guarantee: GreenLeafGuarantee = {
            id: generateUUID(),
            relatedDutyId: selectedDutyForGuarantee,
            guaranteeNumber: newGuaranteeDetails.guaranteeNumber,
            chequeNumber: newGuaranteeDetails.chequeNumber,
            chequeBank: newGuaranteeDetails.chequeBank,
            chequeDate: newGuaranteeDetails.chequeDate,
            chequeAmount: Number(newGuaranteeDetails.chequeAmount) || 0,
            isDelivered: false,
            cashAmount: Number(newGuaranteeDetails.cashAmount) || 0,
            cashBank: newGuaranteeDetails.cashBank,
            cashDate: newGuaranteeDetails.cashDate,
            part: duty?.part // Inherit part from duty
        };
        const updatedGuarantees = [...greenLeafForm.guarantees, guarantee];
        await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees });
        setNewGuaranteeDetails({ guaranteeNumber: '', chequeNumber: '', chequeBank: '', chequeDate: '', cashAmount: 0, cashBank: '', cashDate: '', chequeAmount: 0 });
        setSelectedDutyForGuarantee('');
    };

    const handleDeleteGuarantee = async (id: string) => {
        const updatedGuarantees = greenLeafForm.guarantees.filter(g => g.id !== id);
        await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees });
    };

    const handleToggleGuaranteeDelivery = async (id: string) => {
        const updatedGuarantees = greenLeafForm.guarantees.map(g => 
            g.id === id ? { ...g, isDelivered: !g.isDelivered } : g
        );
        await updateGreenLeafRecord({ ...greenLeafForm, guarantees: updatedGuarantees });
    };

    const handleAddTax = async () => {
        if (!newTax.amount) return;
        const tax: GreenLeafTax = { id: generateUUID(), amount: Number(newTax.amount), part: newTax.part || '', bank: newTax.bank || '', date: newTax.date || '' };
        const updatedTaxes = [...greenLeafForm.taxes, tax];
        await updateGreenLeafRecord({ ...greenLeafForm, taxes: updatedTaxes });
        setNewTax({ part: '', amount: 0, bank: '', date: '' });
    };
    
    const handleDeleteTax = async (id: string) => {
        const updatedTaxes = greenLeafForm.taxes.filter(t => t.id !== id);
        await updateGreenLeafRecord({ ...greenLeafForm, taxes: updatedTaxes });
    };

    const handleAddRoadToll = async () => {
        if (!newRoadToll.amount) return;
        const toll: GreenLeafRoadToll = { id: generateUUID(), amount: Number(newRoadToll.amount), part: newRoadToll.part || '', bank: newRoadToll.bank || '', date: newRoadToll.date || '' };
        const updatedTolls = [...greenLeafForm.roadTolls, toll];
        await updateGreenLeafRecord({ ...greenLeafForm, roadTolls: updatedTolls });
        setNewRoadToll({ part: '', amount: 0, bank: '', date: '' });
    };

    const handleDeleteRoadToll = async (id: string) => {
        const updatedTolls = greenLeafForm.roadTolls.filter(t => t.id !== id);
        await updateGreenLeafRecord({ ...greenLeafForm, roadTolls: updatedTolls });
    };

    // Internal Shipping Handlers
    const handleAddShippingPayment = async () => {
        if (!selectedRecord || !newShippingPayment.amount) return;
        const payment: ShippingPayment = {
            id: generateUUID(),
            part: newShippingPayment.part || '',
            amount: Number(newShippingPayment.amount),
            date: newShippingPayment.date || '',
            bank: newShippingPayment.bank || '',
            description: newShippingPayment.description || ''
        };
        const updatedPayments = [...(internalShippingForm.payments || []), payment];
        const updatedData = { ...internalShippingForm, payments: updatedPayments };
        setInternalShippingForm(updatedData);
        setNewShippingPayment({ part: '', amount: 0, date: '', bank: '', description: '' });
        
        const updatedRecord = { ...selectedRecord, internalShippingData: updatedData };
        if (!updatedRecord.stages[TradeStage.INTERNAL_SHIPPING]) updatedRecord.stages[TradeStage.INTERNAL_SHIPPING] = getStageData(updatedRecord, TradeStage.INTERNAL_SHIPPING);
        
        updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
        updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].isCompleted = updatedPayments.length > 0;
        
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleDeleteShippingPayment = async (id: string) => {
        if (!selectedRecord) return;
        const updatedPayments = (internalShippingForm.payments || []).filter(p => p.id !== id);
        const updatedData = { ...internalShippingForm, payments: updatedPayments };
        setInternalShippingForm(updatedData);
        
        const updatedRecord = { ...selectedRecord, internalShippingData: updatedData };
        if (!updatedRecord.stages[TradeStage.INTERNAL_SHIPPING]) updatedRecord.stages[TradeStage.INTERNAL_SHIPPING] = getStageData(updatedRecord, TradeStage.INTERNAL_SHIPPING);
        
        updatedRecord.stages[TradeStage.INTERNAL_SHIPPING].costRial = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
        
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };


    // Currency Handlers
    const handleAddCurrencyTranche = async () => { if (!selectedRecord || !newCurrencyTranche.amount) return; const tranche: CurrencyTranche = { id: generateUUID(), date: newCurrencyTranche.date || '', amount: Number(newCurrencyTranche.amount), currencyType: newCurrencyTranche.currencyType || selectedRecord.mainCurrency || 'EUR', brokerName: newCurrencyTranche.brokerName || '', exchangeName: newCurrencyTranche.exchangeName || '', rate: Number(newCurrencyTranche.rate) || 0, isDelivered: newCurrencyTranche.isDelivered, deliveryDate: newCurrencyTranche.deliveryDate }; const currentTranches = currencyForm.tranches || []; const updatedTranches = [...currentTranches, tranche]; const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setNewCurrencyTranche({ amount: 0, currencyType: selectedRecord.mainCurrency || 'EUR', date: '', exchangeName: '', brokerName: '', isDelivered: false }); };
    const handleRemoveTranche = async (id: string) => { if (!selectedRecord) return; if (!confirm('آیا از حذف این پارت مطمئن هستید؟')) return; const updatedTranches = (currencyForm.tranches || []).filter(t => t.id !== id); const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0); const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0); const updatedForm = { ...currencyForm, tranches: updatedTranches, purchasedAmount: totalPurchased, deliveredAmount: totalDelivered }; setCurrencyForm(updatedForm); const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); }
    
    const handleToggleTrancheDelivery = async (id: string) => {
        if (!selectedRecord) return;
        const updatedTranches = (currencyForm.tranches || []).map(t => {
            if (t.id === id) return { ...t, isDelivered: !t.isDelivered };
            return t;
        });
        
        // Recalculate totals
        const totalPurchased = updatedTranches.reduce((acc, t) => acc + t.amount, 0);
        const totalDelivered = updatedTranches.filter(t => t.isDelivered).reduce((acc, t) => acc + t.amount, 0);

        const updatedForm = {
            ...currencyForm,
            tranches: updatedTranches,
            purchasedAmount: totalPurchased,
            deliveredAmount: totalDelivered
        };

        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
    };

    const handleSaveCurrencyGuarantee = async () => {
        if (!selectedRecord) return;
        const gCheck = {
            amount: deformatNumberString(currencyGuarantee.amount),
            bank: currencyGuarantee.bank,
            chequeNumber: currencyGuarantee.number,
            dueDate: currencyGuarantee.date,
            isDelivered: currencyGuarantee.isDelivered
        };
        const updatedForm = { ...currencyForm, guaranteeCheque: gCheck };
        setCurrencyForm(updatedForm);
        const updatedRecord = { ...selectedRecord, currencyPurchaseData: updatedForm };
        await updateTradeRecord(updatedRecord);
        setSelectedRecord(updatedRecord);
        alert("اطلاعات چک ضمانت ارزی ذخیره شد.");
    };

    // Shipping Docs Handlers
    const handleAddInvoiceItem = () => { if (!newInvoiceItem.name) return; const newItem: InvoiceItem = { id: generateUUID(), name: newInvoiceItem.name, weight: Number(newInvoiceItem.weight), unitPrice: Number(newInvoiceItem.unitPrice), totalPrice: Number(newInvoiceItem.totalPrice) || (Number(newInvoiceItem.weight) * Number(newInvoiceItem.unitPrice)) }; setShippingDocForm(prev => ({ ...prev, invoiceItems: [...(prev.invoiceItems || []), newItem] })); setNewInvoiceItem({ name: '', weight: 0, unitPrice: 0, totalPrice: 0 }); };
    const handleRemoveInvoiceItem = (id: string) => { setShippingDocForm(prev => ({ ...prev, invoiceItems: (prev.invoiceItems || []).filter(i => i.id !== id) })); };
    const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingDocFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setShippingDocForm(prev => ({ ...prev, attachments: [...(prev.attachments || []), { fileName: result.fileName, url: result.url }] })); } catch (error) { alert('خطا در آپلود فایل'); } finally { setUploadingDocFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const handleSaveShippingDoc = async () => { if (!selectedRecord || !shippingDocForm.documentNumber) return; const newDoc: ShippingDocument = { id: generateUUID(), type: activeShippingSubTab, status: shippingDocForm.status || 'Draft', documentNumber: shippingDocForm.documentNumber, documentDate: shippingDocForm.documentDate || '', createdAt: Date.now(), createdBy: currentUser.fullName, attachments: shippingDocForm.attachments || [], invoiceItems: activeShippingSubTab === 'Commercial Invoice' ? shippingDocForm.invoiceItems : undefined, freightCost: activeShippingSubTab === 'Commercial Invoice' ? Number(shippingDocForm.freightCost) : undefined, currency: shippingDocForm.currency, netWeight: shippingDocForm.netWeight, grossWeight: shippingDocForm.grossWeight, packagesCount: shippingDocForm.packagesCount, vesselName: shippingDocForm.vesselName, portOfLoading: shippingDocForm.portOfLoading, portOfDischarge: shippingDocForm.portOfDischarge, description: shippingDocForm.description }; const updatedDocs = [...(selectedRecord.shippingDocuments || []), newDoc]; const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs }; if (!updatedRecord.stages[TradeStage.SHIPPING_DOCS]) updatedRecord.stages[TradeStage.SHIPPING_DOCS] = getStageData(updatedRecord, TradeStage.SHIPPING_DOCS); if (activeShippingSubTab === 'Commercial Invoice') { updatedRecord.stages[TradeStage.SHIPPING_DOCS].costCurrency = updatedDocs.filter(d => d.type === 'Commercial Invoice').reduce((acc, d) => acc + (d.invoiceItems?.reduce((sum, i) => sum + i.totalPrice, 0) || 0) + (d.freightCost || 0), 0); } await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setShippingDocForm({ status: 'Draft', documentNumber: '', documentDate: '', attachments: [], invoiceItems: [], freightCost: 0 }); };
    const handleDeleteShippingDoc = async (id: string) => { if (!selectedRecord) return; const updatedDocs = (selectedRecord.shippingDocuments || []).filter(d => d.id !== id); const updatedRecord = { ...selectedRecord, shippingDocuments: updatedDocs }; await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); };

    // Timeline Modal Handlers
    const handleStageClick = (stage: TradeStage) => { const data = getStageData(selectedRecord, stage); setEditingStage(stage); setStageFormData(data); };
    const handleStageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploadingStageFile(true); const reader = new FileReader(); reader.onload = async (ev) => { const base64 = ev.target?.result as string; try { const result = await uploadFile(file.name, base64); setStageFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), { fileName: result.fileName, url: result.url }] })); } catch (error) { alert('خطا در آپلود'); } finally { setUploadingStageFile(false); } }; reader.readAsDataURL(file); e.target.value = ''; };
    const handleSaveStage = async () => { if (!selectedRecord || !editingStage) return; const updatedRecord = { ...selectedRecord }; updatedRecord.stages[editingStage] = { ...getStageData(selectedRecord, editingStage), ...stageFormData, updatedAt: Date.now(), updatedBy: currentUser.fullName }; if (editingStage === TradeStage.ALLOCATION_QUEUE && stageFormData.queueDate) { updatedRecord.stages[TradeStage.ALLOCATION_QUEUE].queueDate = stageFormData.queueDate; } if (editingStage === TradeStage.ALLOCATION_APPROVED) { updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationDate = stageFormData.allocationDate; updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationCode = stageFormData.allocationCode; updatedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationExpiry = stageFormData.allocationExpiry; } await updateTradeRecord(updatedRecord); setSelectedRecord(updatedRecord); setEditingStage(null); };

    // ... (Reports Logic - renderReportContent - kept mostly same)
    const renderReportContent = () => {
        let filteredRecords = records;
        if (reportFilterCompany) filteredRecords = records.filter(r => r.company === reportFilterCompany);
        
        switch (activeReport) {
            case 'general':
                return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">فروشنده</th><th className="p-3">کالا</th><th className="p-3">شرکت</th><th className="p-3">مرحله جاری</th><th className="p-3">وضعیت</th></tr></thead><tbody>{filteredRecords.map(r => { const currentStage = STAGES.slice().reverse().find(s => r.stages[s]?.isCompleted) || 'شروع نشده'; return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{r.sellerName}</td><td className="p-3">{r.goodsName}</td><td className="p-3">{r.company}</td><td className="p-3"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">{currentStage}</span></td><td className="p-3">{r.status}</td></tr>); })}</tbody></table></div>);
            case 'currency':
                return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">ارز</th><th className="p-3">خریداری شده</th><th className="p-3">تحویل شده</th><th className="p-3">باقیمانده</th></tr></thead><tbody>{filteredRecords.map(r => { const d = r.currencyPurchaseData; if (!d) return null; const purchased = d.purchasedAmount || 0; const delivered = d.deliveredAmount || 0; return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{r.mainCurrency}</td><td className="p-3 font-bold text-blue-600">{formatCurrency(purchased)}</td><td className="p-3 font-bold text-green-600">{formatCurrency(delivered)}</td><td className="p-3 font-bold text-red-600">{formatCurrency(purchased - delivered)}</td></tr>); })}</tbody></table></div>);
            case 'allocation_queue':
                return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">کالا</th><th className="p-3">تاریخ ورود به صف</th><th className="p-3">مدت انتظار</th><th className="p-3">وضعیت</th></tr></thead><tbody>{filteredRecords.filter(r => r.stages[TradeStage.ALLOCATION_QUEUE]?.isCompleted && !r.stages[TradeStage.ALLOCATION_APPROVED]?.isCompleted).map(r => { const queueDate = r.stages[TradeStage.ALLOCATION_QUEUE].queueDate; const days = queueDate ? calculateDaysDiff(queueDate) : '-'; return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{r.goodsName}</td><td className="p-3">{queueDate || '-'}</td><td className="p-3"><span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold">{days} روز</span></td><td className="p-3 text-amber-600">در صف</td></tr>); })}</tbody></table></div>);
            case 'clearance':
                return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">قبض انبار(ها)</th><th className="p-3">هزینه ترخیصیه</th><th className="p-3">تعداد پارت</th></tr></thead><tbody>{filteredRecords.filter(r => r.clearanceData?.receipts.length).map(r => { return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{r.clearanceData?.receipts.map(rc => rc.number).join(', ')}</td><td className="p-3">{formatCurrency(r.clearanceData?.payments.reduce((acc,p)=>acc+p.amount,0) || 0)}</td><td className="p-3">{r.clearanceData?.receipts.length}</td></tr>); })}</tbody></table></div>);
            case 'green_leaf':
                return (<div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-gray-100 text-gray-700"><tr><th className="p-3">شماره پرونده</th><th className="p-3">کوتاژها</th><th className="p-3">حقوق گمرکی (بانک)</th><th className="p-3">ضمانت‌نامه‌ها</th><th className="p-3">جمع هزینه‌های گمرکی</th></tr></thead><tbody>{filteredRecords.filter(r => r.greenLeafData?.duties.length).map(r => { const d = r.greenLeafData; if(!d) return null; const total = calculateGreenLeafTotal(d); return (<tr key={r.id} className="border-b hover:bg-gray-50"><td className="p-3 font-mono">{r.fileNumber}</td><td className="p-3">{d.duties.map(x => x.cottageNumber).join(', ')}</td><td className="p-3">{formatCurrency(d.duties.filter(x=>x.paymentMethod==='Bank').reduce((a,b)=>a+b.amount,0))}</td><td className="p-3">{d.guarantees.length} مورد</td><td className="p-3 font-bold">{formatCurrency(total)}</td></tr>); })}</tbody></table></div>);
            default: return <div>گزارش در حال تکمیل است...</div>;
        }
    };

    if (viewMode === 'reports') {
        // ... (Return Reports view - kept same)
        return (
            <div className="flex h-[calc(100vh-100px)] bg-gray-50 rounded-2xl overflow-hidden border">
                <div className="w-64 bg-white border-l p-4 flex flex-col gap-2">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><FileSpreadsheet size={20}/> گزارشات بازرگانی</h3>
                    <div className="mb-4"><label className="text-xs font-bold text-gray-500 mb-1 block">فیلتر شرکت</label><select className="w-full border rounded p-1 text-sm" value={reportFilterCompany} onChange={e => setReportFilterCompany(e.target.value)}><option value="">همه شرکت‌ها</option>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                    <button onClick={() => setActiveReport('general')} className={`p-2 rounded text-right text-sm ${activeReport === 'general' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>📄 لیست کلی پرونده‌ها</button>
                    <button onClick={() => setActiveReport('allocation_queue')} className={`p-2 rounded text-right text-sm ${activeReport === 'allocation_queue' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>⏳ در صف تخصیص</button>
                    <button onClick={() => setActiveReport('currency')} className={`p-2 rounded text-right text-sm ${activeReport === 'currency' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>💰 وضعیت خرید ارز</button>
                    <button onClick={() => setActiveReport('clearance')} className={`p-2 rounded text-right text-sm ${activeReport === 'clearance' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>🏭 ترخیصیه و قبض انبار</button>
                    <button onClick={() => setActiveReport('green_leaf')} className={`p-2 rounded text-right text-sm ${activeReport === 'green_leaf' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>🍃 برگ سبز و گمرک</button>
                    <div className="mt-auto"><button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 border p-2 rounded hover:bg-gray-50 text-gray-600"><Printer size={16}/> چاپ گزارش</button><button onClick={() => setViewMode('dashboard')} className="w-full mt-2 flex items-center justify-center gap-2 bg-gray-800 text-white p-2 rounded hover:bg-gray-900">بازگشت به داشبورد</button></div>
                </div>
                <div className="flex-1 p-6 overflow-auto">
                    <h2 className="text-xl font-bold mb-4">{activeReport === 'general' ? 'لیست کلی پرونده‌ها' : activeReport === 'allocation_queue' ? 'گزارش صف تخصیص' : activeReport === 'currency' ? 'گزارش ارزی' : 'گزارش'}</h2>
                    {renderReportContent()}
                </div>
            </div>
        );
    }

    if (selectedRecord && viewMode === 'details') {
        const totalRial = STAGES.reduce((sum, stage) => sum + (selectedRecord.stages[stage]?.costRial || 0), 0);
        const totalCurrency = STAGES.reduce((sum, stage) => sum + (selectedRecord.stages[stage]?.costCurrency || 0), 0);
        
        // Calculate Cost Price (Final Price)
        const totalWeight = selectedRecord.items.reduce((sum, item) => sum + item.weight, 0);
        const exchangeRate = selectedRecord.exchangeRate || 0;
        const grandTotalRial = totalRial + (totalCurrency * exchangeRate);
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
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                        {/* TAB CONTENT */}
                        {activeTab === 'timeline' && (
                             <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                                {STAGES.map((stage, i) => {
                                    const data = selectedRecord.stages[stage];
                                    const isCompleted = data?.isCompleted;
                                    
                                    // Day Counter Logic for Allocation Queue
                                    let dayCounter = null;
                                    if (stage === TradeStage.ALLOCATION_QUEUE && data?.queueDate) {
                                        const endDate = selectedRecord.stages[TradeStage.ALLOCATION_APPROVED]?.isCompleted && selectedRecord.stages[TradeStage.ALLOCATION_APPROVED]?.allocationDate 
                                            ? selectedRecord.stages[TradeStage.ALLOCATION_APPROVED].allocationDate 
                                            : undefined;
                                        const days = calculateDaysDiff(data.queueDate, endDate);
                                        dayCounter = <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold ml-2">{days} روز</span>;
                                    }

                                    return (
                                        <div key={stage} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-300 group-[.is-active]:bg-emerald-500 text-slate-500 group-[.is-active]:text-emerald-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 cursor-pointer hover:scale-110 transition-transform" onClick={() => handleStageClick(stage)}>
                                                {isCompleted ? <CheckCircle2 size={20}/> : <Clock size={20}/>}
                                            </div>
                                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors" onClick={() => handleStageClick(stage)}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="font-bold text-gray-700">{stage} {dayCounter}</div>
                                                    <time className="font-mono text-xs text-slate-500">{data?.updatedAt ? new Date(data.updatedAt).toLocaleDateString('fa-IR') : '-'}</time>
                                                </div>
                                                <div className="text-slate-500 text-sm">{data?.description || 'بدون توضیحات'}</div>
                                                <div className="flex gap-2 mt-2">
                                                    {data?.costRial ? <span className="text-xs bg-gray-100 px-2 py-1 rounded">هزینه: {formatCurrency(data.costRial)}</span> : null}
                                                    {data?.attachments?.length ? <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded flex items-center gap-1"><Paperclip size={12}/> {data.attachments.length} فایل</span> : null}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                             </div>
                        )}

                        {activeTab === 'proforma' && (
                             <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-500">شماره پرونده</label><input className="w-full border rounded p-2" value={selectedRecord.fileNumber} onChange={(e) => handleUpdateProforma('fileNumber', e.target.value)} /></div>
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-500">فروشنده</label><input className="w-full border rounded p-2" value={selectedRecord.sellerName} onChange={(e) => handleUpdateProforma('sellerName', e.target.value)} /></div>
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-500">ارز پایه</label><select className="w-full border rounded p-2 bg-white" value={selectedRecord.mainCurrency} onChange={(e) => handleUpdateProforma('mainCurrency', e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                                 </div>
                                 
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-blue-50 p-4 rounded border border-blue-100">
                                     <div className="space-y-1"><label className="text-xs font-bold text-blue-800">شماره ثبت سفارش</label><input className="w-full border rounded p-2" value={selectedRecord.registrationNumber || ''} onChange={(e) => handleUpdateProforma('registrationNumber', e.target.value)} /></div>
                                     <div className="space-y-1"><label className="text-xs font-bold text-blue-800">تاریخ صدور ثبت سفارش</label><input className="w-full border rounded p-2" value={selectedRecord.registrationDate || ''} onChange={(e) => handleUpdateProforma('registrationDate', e.target.value)} placeholder="1403/01/01"/></div>
                                     <div className="space-y-1"><label className="text-xs font-bold text-blue-800">مهلت ثبت سفارش</label><input className="w-full border rounded p-2" value={selectedRecord.registrationExpiry || ''} onChange={(e) => handleUpdateProforma('registrationExpiry', e.target.value)} placeholder="1403/07/01"/></div>
                                 </div>

                                 {/* License Costs */}
                                 <div className="border-t pt-4">
                                     <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Wallet size={18} /> هزینه‌های مجوز و ثبت سفارش</h3>
                                     <div className="flex gap-2 items-end bg-gray-50 p-3 rounded mb-2">
                                         <div className="flex-1"><label className="text-xs block mb-1">مبلغ (ریال)</label><input className="w-full border rounded p-1 text-sm" value={formatNumberString(newLicenseTx.amount)} onChange={e => setNewLicenseTx({...newLicenseTx, amount: deformatNumberString(e.target.value)})}/></div>
                                         <div className="flex-1"><label className="text-xs block mb-1">بانک</label><input className="w-full border rounded p-1 text-sm" value={newLicenseTx.bank} onChange={e => setNewLicenseTx({...newLicenseTx, bank: e.target.value})}/></div>
                                         <div className="flex-1"><label className="text-xs block mb-1">تاریخ</label><input className="w-full border rounded p-1 text-sm" value={newLicenseTx.date} onChange={e => setNewLicenseTx({...newLicenseTx, date: e.target.value})}/></div>
                                         <div className="flex-[2]"><label className="text-xs block mb-1">شرح</label><input className="w-full border rounded p-1 text-sm" value={newLicenseTx.description} onChange={e => setNewLicenseTx({...newLicenseTx, description: e.target.value})}/></div>
                                         <button onClick={handleAddLicenseTx} className="bg-blue-600 text-white p-1.5 rounded h-[30px] w-[30px] flex items-center justify-center"><Plus size={18}/></button>
                                     </div>
                                     <div className="space-y-1">{selectedRecord.licenseData?.transactions.map(tx => (<div key={tx.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span className="font-mono">{formatCurrency(tx.amount)}</span><span>{tx.bank}</span><span>{tx.date}</span><span className="text-gray-500">{tx.description}</span><button onClick={()=>handleRemoveLicenseTx(tx.id)} className="text-red-500"><Trash2 size={14}/></button></div>))}</div>
                                 </div>

                                 <div className="border-t pt-4">
                                     <h3 className="font-bold text-gray-700 mb-3">اقلام کالا</h3>
                                     <div className="flex gap-2 items-end bg-gray-50 p-3 rounded mb-2">
                                         <div className="flex-[2]"><label className="text-xs block mb-1">نام کالا</label><input className="w-full border rounded p-1 text-sm" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})}/></div>
                                         <div className="flex-1"><label className="text-xs block mb-1">وزن (KG)</label><input className="w-full border rounded p-1 text-sm" type="number" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: Number(e.target.value)})}/></div>
                                         <div className="flex-1"><label className="text-xs block mb-1">فی ({selectedRecord.mainCurrency})</label><input className="w-full border rounded p-1 text-sm" type="number" value={newItem.unitPrice} onChange={e => setNewItem({...newItem, unitPrice: Number(e.target.value)})}/></div>
                                         <button onClick={handleAddItem} className="bg-blue-600 text-white p-1.5 rounded"><Plus size={18}/></button>
                                     </div>
                                     <div className="space-y-1">{selectedRecord.items.map(item => (<div key={item.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span>{item.name}</span><div className="flex gap-4"><span className="bg-gray-100 px-2 rounded">{item.weight} KG</span><span className="font-mono">{formatCurrency(item.totalPrice)} {selectedRecord.mainCurrency}</span><button onClick={()=>handleRemoveItem(item.id)} className="text-red-500"><Trash2 size={14}/></button></div></div>))}</div>
                                 </div>
                             </div>
                        )}

                        {activeTab === 'insurance' && (
                            <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">شماره بیمه‌نامه</label><input className="w-full border rounded p-2" value={insuranceForm.policyNumber} onChange={(e) => setInsuranceForm({...insuranceForm, policyNumber: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">شرکت بیمه</label><input className="w-full border rounded p-2" value={insuranceForm.company} onChange={(e) => setInsuranceForm({...insuranceForm, company: e.target.value})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">هزینه اولیه (ریال)</label><input className="w-full border rounded p-2" value={formatNumberString(insuranceForm.cost)} onChange={(e) => setInsuranceForm({...insuranceForm, cost: deformatNumberString(e.target.value)})} /></div>
                                    <div className="space-y-1"><label className="text-xs font-bold text-gray-500">بانک پرداخت کننده</label><input className="w-full border rounded p-2" value={insuranceForm.bank} onChange={(e) => setInsuranceForm({...insuranceForm, bank: e.target.value})} /></div>
                                </div>
                                <div className="border-t pt-4">
                                    <h3 className="font-bold text-gray-700 mb-3">الحاقیه‌ها</h3>
                                    <div className="bg-gray-50 p-3 rounded mb-2 flex gap-2 items-end">
                                        <div className="flex items-center gap-2 bg-white border rounded px-2 py-1 h-[34px]"><button onClick={() => setEndorsementType('increase')} className={`text-xs px-2 py-1 rounded ${endorsementType === 'increase' ? 'bg-green-100 text-green-700 font-bold' : 'text-gray-500'}`}>افزایش</button><button onClick={() => setEndorsementType('refund')} className={`text-xs px-2 py-1 rounded ${endorsementType === 'refund' ? 'bg-red-100 text-red-700 font-bold' : 'text-gray-500'}`}>برگشت</button></div>
                                        <input className="border rounded p-1 text-sm flex-1" placeholder="مبلغ (ریال)" value={formatNumberString(newEndorsement.amount)} onChange={e => setNewEndorsement({...newEndorsement, amount: deformatNumberString(e.target.value)})} />
                                        <input className="border rounded p-1 text-sm flex-1" placeholder="تاریخ" value={newEndorsement.date} onChange={e => setNewEndorsement({...newEndorsement, date: e.target.value})} />
                                        <input className="border rounded p-1 text-sm flex-[2]" placeholder="توضیحات" value={newEndorsement.description} onChange={e => setNewEndorsement({...newEndorsement, description: e.target.value})} />
                                        <button onClick={handleAddEndorsement} className="bg-blue-600 text-white p-1.5 rounded"><Plus size={18}/></button>
                                    </div>
                                    <div className="space-y-1">{insuranceForm.endorsements?.map(e => (<div key={e.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span className={`font-bold ${e.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>{e.amount > 0 ? 'افزایش' : 'برگشت'}: {formatCurrency(Math.abs(e.amount))}</span><span>{e.date}</span><span className="text-gray-500">{e.description}</span><button onClick={() => handleDeleteEndorsement(e.id)} className="text-red-500"><Trash2 size={14}/></button></div>))}</div>
                                </div>
                                <button onClick={handleSaveInsurance} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 mt-4"><Save size={18} className="inline mr-1"/> ذخیره اطلاعات بیمه</button>
                            </div>
                        )}

                        {activeTab === 'currency_purchase' && (
                            <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                                {/* Tranches Section */}
                                <div className="border-b pb-4 mb-4">
                                    <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Coins size={20} className="text-amber-500"/> پارت‌های خریداری شده</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-7 gap-2 bg-amber-50 p-3 rounded mb-2 items-end">
                                        <div><label className="text-[10px] block mb-1">مبلغ ارزی</label><input className="w-full border rounded p-1 text-sm" value={formatNumberString(newCurrencyTranche.amount)} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, amount: deformatNumberString(e.target.value)})}/></div>
                                        <div><label className="text-[10px] block mb-1">نوع ارز</label><select className="w-full border rounded p-1 text-sm bg-white" value={newCurrencyTranche.currencyType} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, currencyType: e.target.value})}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                                        <div><label className="text-[10px] block mb-1">نرخ (ریال)</label><input className="w-full border rounded p-1 text-sm" value={formatNumberString(newCurrencyTranche.rate)} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, rate: deformatNumberString(e.target.value)})}/></div>
                                        <div><label className="text-[10px] block mb-1">صرافی</label><input className="w-full border rounded p-1 text-sm" value={newCurrencyTranche.exchangeName} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, exchangeName: e.target.value})}/></div>
                                        <div><label className="text-[10px] block mb-1">کارگزاری</label><input className="w-full border rounded p-1 text-sm" placeholder="کارگزاری" value={newCurrencyTranche.brokerName} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, brokerName: e.target.value})}/></div>
                                        <div><label className="text-[10px] block mb-1">تاریخ خرید</label><input className="w-full border rounded p-1 text-sm" value={newCurrencyTranche.date} onChange={e => setNewCurrencyTranche({...newCurrencyTranche, date: e.target.value})}/></div>
                                        <button onClick={handleAddCurrencyTranche} className="bg-amber-600 text-white p-1.5 rounded h-[30px] w-full flex items-center justify-center gap-1 font-bold"><Plus size={16}/> افزودن</button>
                                    </div>
                                    <div className="space-y-1">
                                        {currencyForm.tranches?.map((t, idx) => (
                                            <div key={t.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm">
                                                <span className="font-bold text-blue-600">{formatCurrency(t.amount)} {t.currencyType}</span>
                                                <span>نرخ: {formatCurrency(t.rate || 0)}</span>
                                                <span>{t.exchangeName}</span>
                                                {t.brokerName && <span className="text-gray-500 text-xs bg-gray-100 px-2 rounded">کارگزاری: {t.brokerName}</span>}
                                                <span>{t.date}</span>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => handleToggleTrancheDelivery(t.id)} 
                                                        className={`flex items-center gap-1 text-xs border px-2 py-1 rounded cursor-pointer transition-colors ${t.isDelivered ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                                                        title="تغییر وضعیت تحویل"
                                                    >
                                                        {t.isDelivered ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
                                                        {t.isDelivered ? 'تحویل شد' : 'تحویل نشده'}
                                                    </button>
                                                    <button onClick={() => handleRemoveTranche(t.id)} className="text-red-500"><Trash2 size={14}/></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-gray-100 p-2 rounded mt-2 text-center text-sm font-bold">مجموع خریداری شده: <span className="text-blue-600">{formatCurrency(currencyForm.purchasedAmount)} {selectedRecord.mainCurrency}</span></div>
                                </div>

                                {/* Guarantee Cheque Section */}
                                <div>
                                    <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><ShieldCheck size={20} className="text-blue-600"/> چک ضمانت ارزی</h3>
                                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                            <div><label className="text-xs font-bold block mb-1">مبلغ چک</label><input className="w-full border rounded p-2 text-sm" value={currencyGuarantee.amount} onChange={e => setCurrencyGuarantee({...currencyGuarantee, amount: formatNumberString(deformatNumberString(e.target.value).toString())})}/></div>
                                            <div>
                                                <label className="text-xs font-bold block mb-1">بانک</label>
                                                <select className="w-full border rounded p-2 text-sm bg-white" value={currencyGuarantee.bank} onChange={e => setCurrencyGuarantee({...currencyGuarantee, bank: e.target.value})}>
                                                    <option value="">انتخاب کنید...</option>
                                                    {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
                                                </select>
                                            </div>
                                            <div><label className="text-xs font-bold block mb-1">شماره چک</label><input className="w-full border rounded p-2 text-sm" value={currencyGuarantee.number} onChange={e => setCurrencyGuarantee({...currencyGuarantee, number: e.target.value})}/></div>
                                            <div><label className="text-xs font-bold block mb-1">تاریخ سررسید</label><input className="w-full border rounded p-2 text-sm" value={currencyGuarantee.date} onChange={e => setCurrencyGuarantee({...currencyGuarantee, date: e.target.value})}/></div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded border border-blue-200">
                                                <input type="checkbox" checked={currencyGuarantee.isDelivered} onChange={e => setCurrencyGuarantee({...currencyGuarantee, isDelivered: e.target.checked})} className="w-4 h-4 text-blue-600"/>
                                                <span className={`text-sm font-bold ${currencyGuarantee.isDelivered ? 'text-green-600' : 'text-gray-500'}`}>{currencyGuarantee.isDelivered ? 'تحویل شده' : 'نزد شرکت'}</span>
                                            </label>
                                            <button onClick={handleSaveCurrencyGuarantee} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700">ذخیره اطلاعات چک</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'shipping_docs' && (
                             <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                                 <div className="flex gap-2 overflow-x-auto pb-2 border-b">
                                     {['Commercial Invoice', 'Packing List', 'Certificate of Origin', 'Bill of Lading'].map(t => (
                                         <button key={t} onClick={() => setActiveShippingSubTab(t as ShippingDocType)} className={`px-3 py-1.5 rounded-lg whitespace-nowrap text-sm ${activeShippingSubTab === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{t}</button>
                                     ))}
                                 </div>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-500">شماره سند</label><input className="w-full border rounded p-2" value={shippingDocForm.documentNumber} onChange={e => setShippingDocForm({...shippingDocForm, documentNumber: e.target.value})} /></div>
                                     <div className="space-y-1"><label className="text-xs font-bold text-gray-500">تاریخ سند</label><input className="w-full border rounded p-2" value={shippingDocForm.documentDate} onChange={e => setShippingDocForm({...shippingDocForm, documentDate: e.target.value})} /></div>
                                 </div>
                                 
                                 {activeShippingSubTab === 'Commercial Invoice' && (
                                     <div className="border-t pt-4">
                                         <h4 className="font-bold text-gray-700 mb-2">اقلام اینویس</h4>
                                         <div className="flex gap-2 items-end bg-gray-50 p-2 rounded mb-2">
                                             <input className="border rounded p-1 text-sm flex-1" placeholder="نام کالا" value={newInvoiceItem.name} onChange={e => setNewInvoiceItem({...newInvoiceItem, name: e.target.value})} />
                                             <input className="border rounded p-1 text-sm w-20" placeholder="قیمت کل" type="number" value={newInvoiceItem.totalPrice} onChange={e => setNewInvoiceItem({...newInvoiceItem, totalPrice: Number(e.target.value)})} />
                                             <button onClick={handleAddInvoiceItem} className="bg-blue-600 text-white p-1 rounded"><Plus size={16}/></button>
                                         </div>
                                         <div className="space-y-1">{shippingDocForm.invoiceItems?.map(i => (<div key={i.id} className="flex justify-between bg-white border p-2 rounded text-sm"><span>{i.name}</span><span>{i.totalPrice}</span><button onClick={()=>handleRemoveInvoiceItem(i.id)} className="text-red-500"><X size={14}/></button></div>))}</div>
                                     </div>
                                 )}

                                 <div className="border-t pt-4"><label className="text-xs font-bold block mb-2">فایل اسکن شده</label><div className="flex gap-2"><input type="file" className="hidden" ref={docFileInputRef} onChange={handleDocFileChange} /><button onClick={() => docFileInputRef.current?.click()} disabled={uploadingDocFile} className="bg-gray-100 border px-3 py-1 rounded text-xs">{uploadingDocFile ? '...' : 'آپلود فایل'}</button></div><div className="mt-2 space-y-1">{shippingDocForm.attachments?.map((a,i) => (<div key={i} className="text-xs text-blue-600"><a href={a.url} target="_blank">{a.fileName}</a></div>))}</div></div>
                                 <button onClick={handleSaveShippingDoc} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">ذخیره سند</button>
                                 <div className="mt-6 border-t pt-4"><h4 className="font-bold text-gray-700 mb-2">اسناد ثبت شده</h4><div className="space-y-2">{selectedRecord.shippingDocuments?.filter(d => d.type === activeShippingSubTab).map(d => (<div key={d.id} className="bg-gray-50 p-3 rounded border flex justify-between items-center"><div><div className="font-bold text-sm">{d.documentNumber}</div><div className="text-xs text-gray-500">{d.documentDate}</div></div><button onClick={() => handleDeleteShippingDoc(d.id)} className="text-red-500"><Trash2 size={16}/></button></div>))}</div></div>
                             </div>
                        )}

                        {activeTab === 'inspection' && (
                             <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                                 {/* Certificates */}
                                 <div>
                                     <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Microscope size={20}/> گواهی‌های بازرسی (COI / IC)</h3>
                                     <div className="flex gap-2 items-end bg-blue-50 p-3 rounded mb-2">
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="نوع (Original/Amendment)" value={newInspectionCertificate.part} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, part: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="شماره گواهی" value={newInspectionCertificate.certificateNumber} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, certificateNumber: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="شرکت بازرسی" value={newInspectionCertificate.company} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, company: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="مبلغ صورتحساب" value={formatNumberString(newInspectionCertificate.amount)} onChange={e => setNewInspectionCertificate({...newInspectionCertificate, amount: deformatNumberString(e.target.value)})} />
                                         <button onClick={handleAddInspectionCertificate} className="bg-blue-600 text-white p-1.5 rounded"><Plus size={18}/></button>
                                     </div>
                                     <div className="space-y-1">{inspectionForm.certificates.map(c => (<div key={c.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span>{c.part} - {c.certificateNumber}</span><span>{c.company}</span><span className="font-mono">{formatCurrency(c.amount)}</span><button onClick={() => handleDeleteInspectionCertificate(c.id)} className="text-red-500"><Trash2 size={14}/></button></div>))}</div>
                                 </div>
                                 {/* Payments */}
                                 <div className="border-t pt-4">
                                     <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Banknote size={20}/> پرداخت‌های بازرسی</h3>
                                     <div className="flex gap-2 items-end bg-gray-50 p-3 rounded mb-2">
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="بابت (پارت)" value={newInspectionPayment.part} onChange={e => setNewInspectionPayment({...newInspectionPayment, part: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="مبلغ (ریال)" value={formatNumberString(newInspectionPayment.amount)} onChange={e => setNewInspectionPayment({...newInspectionPayment, amount: deformatNumberString(e.target.value)})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="بانک" value={newInspectionPayment.bank} onChange={e => setNewInspectionPayment({...newInspectionPayment, bank: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="تاریخ" value={newInspectionPayment.date} onChange={e => setNewInspectionPayment({...newInspectionPayment, date: e.target.value})} />
                                         <button onClick={handleAddInspectionPayment} className="bg-green-600 text-white p-1.5 rounded"><Plus size={18}/></button>
                                     </div>
                                     <div className="space-y-1">{inspectionForm.payments.map(p => (<div key={p.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span>{p.part}</span><span className="font-mono">{formatCurrency(p.amount)}</span><span>{p.bank}</span><span>{p.date}</span><button onClick={() => handleDeleteInspectionPayment(p.id)} className="text-red-500"><Trash2 size={14}/></button></div>))}</div>
                                     <div className="mt-2 text-left font-bold text-sm">جمع هزینه بازرسی: <span className="text-blue-600">{formatCurrency(inspectionForm.payments.reduce((a,b)=>a+b.amount,0))}</span></div>
                                 </div>
                             </div>
                        )}

                        {activeTab === 'clearance_docs' && (
                             <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6">
                                 {/* Warehouse Receipts */}
                                 <div>
                                     <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Warehouse size={20}/> لیست قبض انبار</h3>
                                     <div className="flex gap-2 items-end bg-blue-50 p-3 rounded mb-2">
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="شماره قبض انبار" value={newWarehouseReceipt.number} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, number: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="پارت (اختیاری)" value={newWarehouseReceipt.part} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, part: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="تاریخ صدور" value={newWarehouseReceipt.issueDate} onChange={e => setNewWarehouseReceipt({...newWarehouseReceipt, issueDate: e.target.value})} />
                                         <button onClick={handleAddWarehouseReceipt} className="bg-blue-600 text-white p-1.5 rounded"><Plus size={18}/></button>
                                     </div>
                                     <div className="space-y-1">{clearanceForm.receipts.map(r => (<div key={r.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span className="font-bold">{r.number}</span><span>{r.part}</span><span>{r.issueDate}</span><button onClick={() => handleDeleteWarehouseReceipt(r.id)} className="text-red-500"><Trash2 size={14}/></button></div>))}</div>
                                 </div>
                                 {/* Payments */}
                                 <div className="border-t pt-4">
                                     <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Banknote size={20}/> هزینه‌های ترخیصیه</h3>
                                     <div className="flex gap-2 items-end bg-gray-50 p-3 rounded mb-2 flex-wrap">
                                         <input className="border rounded p-1 text-sm w-32" placeholder="پارت" value={newClearancePayment.part} onChange={e => setNewClearancePayment({...newClearancePayment, part: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="مبلغ (ریال)" value={formatNumberString(newClearancePayment.amount)} onChange={e => setNewClearancePayment({...newClearancePayment, amount: deformatNumberString(e.target.value)})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="بانک گیرنده" value={newClearancePayment.bank} onChange={e => setNewClearancePayment({...newClearancePayment, bank: e.target.value})} />
                                         <input className="border rounded p-1 text-sm flex-1" placeholder="بانک پرداخت کننده" value={newClearancePayment.payingBank} onChange={e => setNewClearancePayment({...newClearancePayment, payingBank: e.target.value})} />
                                         <input className="border rounded p-1 text-sm w-32" placeholder="تاریخ" value={newClearancePayment.date} onChange={e => setNewClearancePayment({...newClearancePayment, date: e.target.value})} />
                                         <button onClick={handleAddClearancePayment} className="bg-green-600 text-white p-1.5 rounded"><Plus size={18}/></button>
                                     </div>
                                     <div className="space-y-1">{clearanceForm.payments.map(p => (<div key={p.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span>{p.part}</span><span className="font-mono">{formatCurrency(p.amount)}</span><span>به: {p.bank}</span><span>از: {p.payingBank}</span><span>{p.date}</span><button onClick={() => handleDeleteClearancePayment(p.id)} className="text-red-500"><Trash2 size={14}/></button></div>))}</div>
                                     <div className="mt-2 text-left font-bold text-sm">جمع هزینه ترخیصیه: <span className="text-blue-600">{formatCurrency(clearanceForm.payments.reduce((a,b)=>a+b.amount,0))}</span></div>
                                 </div>
                             </div>
                        )}

                        {activeTab === 'green_leaf' && (
                            <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6 animate-fade-in">
                                {/* SECTION 1: Customs Duties */}
                                <div>
                                    <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Building2 size={20} className="text-blue-600"/> حقوق گمرکی (کوتاژ)</h3>
                                    <div className="bg-blue-50 p-3 rounded mb-2 border border-blue-100">
                                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-2 items-end">
                                            <div><label className="text-[10px] block mb-1 font-bold">شماره کوتاژ</label><input className="w-full border rounded p-1.5 text-sm" value={newCustomsDuty.cottageNumber} onChange={e => setNewCustomsDuty({...newCustomsDuty, cottageNumber: e.target.value})}/></div>
                                            <div><label className="text-[10px] block mb-1 font-bold">پارت</label><input className="w-full border rounded p-1.5 text-sm" value={newCustomsDuty.part} onChange={e => setNewCustomsDuty({...newCustomsDuty, part: e.target.value})}/></div>
                                            <div><label className="text-[10px] block mb-1 font-bold">مبلغ (ریال)</label><input className="w-full border rounded p-1.5 text-sm font-mono dir-ltr" value={formatNumberString(newCustomsDuty.amount)} onChange={e => setNewCustomsDuty({...newCustomsDuty, amount: deformatNumberString(e.target.value)})}/></div>
                                            <div><label className="text-[10px] block mb-1 font-bold">روش پرداخت</label><select className="w-full border rounded p-1.5 text-sm bg-white" value={newCustomsDuty.paymentMethod} onChange={e => setNewCustomsDuty({...newCustomsDuty, paymentMethod: e.target.value as any})}><option value="Bank">بانکی</option><option value="Guarantee">ضمانت‌نامه</option></select></div>
                                            <button onClick={handleAddCustomsDuty} className="bg-blue-600 text-white p-1.5 rounded h-[34px] flex items-center justify-center font-bold"><Plus size={16}/> ثبت</button>
                                        </div>
                                        {newCustomsDuty.paymentMethod === 'Bank' && (
                                            <div className="flex gap-2 animate-fade-in">
                                                <input className="w-full border rounded p-1.5 text-sm" placeholder="نام بانک پرداخت کننده" value={newCustomsDuty.bank} onChange={e => setNewCustomsDuty({...newCustomsDuty, bank: e.target.value})} />
                                                <input className="w-full border rounded p-1.5 text-sm" placeholder="تاریخ پرداخت" value={newCustomsDuty.date} onChange={e => setNewCustomsDuty({...newCustomsDuty, date: e.target.value})} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        {greenLeafForm.duties.map(d => (
                                            <div key={d.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm hover:bg-gray-50">
                                                <span className="font-bold text-gray-700 w-24">{d.cottageNumber}</span>
                                                <span className="w-16 text-gray-500">{d.part}</span>
                                                <span className={`px-2 py-0.5 rounded text-xs ${d.paymentMethod === 'Guarantee' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>{d.paymentMethod === 'Guarantee' ? 'ضمانت‌نامه' : 'بانکی'}</span>
                                                <span className="font-mono">{formatCurrency(d.amount)}</span>
                                                {d.paymentMethod === 'Bank' && <span className="text-xs text-gray-500">{d.bank} | {d.date}</span>}
                                                <button onClick={() => handleDeleteCustomsDuty(d.id)} className="text-red-500"><Trash2 size={14}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* SECTION 2: Guarantees */}
                                <div className="border-t pt-6">
                                    <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><ShieldCheck size={20} className="text-purple-600"/> ضمانت‌نامه‌ها</h3>
                                    
                                    <div className="bg-purple-50 p-3 rounded mb-2 border border-purple-100">
                                        <label className="text-xs font-bold block mb-2">انتخاب کوتاژ جهت ثبت ضمانت‌نامه</label>
                                        <div className="flex gap-2 mb-3">
                                            <select 
                                                className="flex-1 border rounded p-1.5 text-sm bg-white" 
                                                value={selectedDutyForGuarantee} 
                                                onChange={e => setSelectedDutyForGuarantee(e.target.value)}
                                            >
                                                <option value="">-- انتخاب کنید --</option>
                                                {greenLeafForm.duties
                                                    .filter(d => d.paymentMethod === 'Guarantee' && !greenLeafForm.guarantees.some(g => g.relatedDutyId === d.id))
                                                    .map(d => (
                                                        <option key={d.id} value={d.id}>کوتاژ {d.cottageNumber} (پارت {d.part}) - {formatCurrency(d.amount)}</option>
                                                    ))
                                                }
                                            </select>
                                        </div>
                                        
                                        {selectedDutyForGuarantee && (
                                            <div className="space-y-3 animate-fade-in">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div><label className="text-[10px] block mb-1 font-bold">شماره ضمانت‌نامه</label><input className="w-full border rounded p-1.5 text-sm" value={newGuaranteeDetails.guaranteeNumber} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, guaranteeNumber: e.target.value})} /></div>
                                                    <div><label className="text-[10px] block mb-1 font-bold">شماره چک</label><input className="w-full border rounded p-1.5 text-sm" value={newGuaranteeDetails.chequeNumber} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeNumber: e.target.value})} /></div>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <label className="text-[10px] block mb-1 font-bold">بانک چک</label>
                                                        <select className="w-full border rounded p-1.5 text-sm bg-white" value={newGuaranteeDetails.chequeBank} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeBank: e.target.value})}>
                                                            <option value="">انتخاب کنید...</option>
                                                            {availableBanks.map(b => <option key={b} value={b}>{b}</option>)}
                                                        </select>
                                                    </div>
                                                    <div><label className="text-[10px] block mb-1 font-bold">مبلغ چک</label><input className="w-full border rounded p-1.5 text-sm" value={formatNumberString(newGuaranteeDetails.chequeAmount)} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeAmount: deformatNumberString(e.target.value)})} /></div>
                                                    <div><label className="text-[10px] block mb-1 font-bold">تاریخ سررسید</label><input className="w-full border rounded p-1.5 text-sm" value={newGuaranteeDetails.chequeDate} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, chequeDate: e.target.value})} /></div>
                                                </div>
                                                <div className="bg-white p-2 rounded border border-purple-200">
                                                    <div className="text-xs font-bold text-purple-700 mb-2 border-b pb-1">بخش نقدی ضمانت‌نامه</div>
                                                    <div className="flex gap-2 items-end">
                                                        <input className="flex-1 border rounded p-1 text-sm" placeholder="مبلغ (ریال)" value={formatNumberString(newGuaranteeDetails.cashAmount)} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, cashAmount: deformatNumberString(e.target.value)})} />
                                                        <input className="flex-1 border rounded p-1 text-sm" placeholder="بانک" value={newGuaranteeDetails.cashBank} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, cashBank: e.target.value})} />
                                                        <input className="w-24 border rounded p-1 text-sm" placeholder="تاریخ" value={newGuaranteeDetails.cashDate} onChange={e => setNewGuaranteeDetails({...newGuaranteeDetails, cashDate: e.target.value})} />
                                                    </div>
                                                </div>
                                                <button onClick={handleAddGuarantee} className="w-full bg-purple-600 text-white py-1.5 rounded font-bold hover:bg-purple-700">ثبت ضمانت‌نامه</button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        {greenLeafForm.guarantees.map(g => {
                                            const duty = greenLeafForm.duties.find(d => d.id === g.relatedDutyId);
                                            return (
                                                <div key={g.id} className="bg-white border p-3 rounded text-sm hover:bg-gray-50 flex flex-col gap-2">
                                                    <div className="flex justify-between items-center mb-1 border-b pb-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-purple-700">ضمانت: {g.guaranteeNumber}</span>
                                                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">پارت: {duty?.part}</span>
                                                        </div>
                                                        <button onClick={() => handleDeleteGuarantee(g.id)} className="text-red-500"><Trash2 size={14}/></button>
                                                    </div>
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-gray-600 flex items-center gap-1">
                                                                <Square size={12} className="fill-current text-gray-300"/> چک: {g.chequeNumber} ({g.chequeBank})
                                                            </span>
                                                            <span className="font-bold font-mono">{formatCurrency(g.chequeAmount || 0)}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs text-gray-600 flex items-center gap-1">
                                                                <Square size={12} className="fill-current text-green-200"/> نقدی: {g.cashBank} ({g.cashDate})
                                                            </span>
                                                            <span className="font-bold font-mono text-green-600">{formatCurrency(g.cashAmount)}</span>
                                                        </div>
                                                        <div className="mt-1 pt-1 border-t flex justify-end">
                                                            <button 
                                                                onClick={() => handleToggleGuaranteeDelivery(g.id)} 
                                                                className={`flex items-center gap-1 text-xs border px-2 py-0.5 rounded cursor-pointer ${g.isDelivered ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                                                            >
                                                                {g.isDelivered ? <CheckSquare size={14}/> : <Square size={14}/>}
                                                                {g.isDelivered ? 'چک تحویل شد' : 'چک تحویل نشده'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* SECTION 3: Tax */}
                                <div className="border-t pt-6">
                                    <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Percent size={20} className="text-orange-500"/> مالیات</h3>
                                    <div className="flex gap-2 items-end bg-orange-50 p-3 rounded mb-2 border border-orange-100">
                                        <input className="w-20 border rounded p-1 text-sm" placeholder="پارت" value={newTax.part} onChange={e => setNewTax({...newTax, part: e.target.value})} />
                                        <input className="flex-1 border rounded p-1 text-sm" placeholder="مبلغ (ریال)" value={formatNumberString(newTax.amount)} onChange={e => setNewTax({...newTax, amount: deformatNumberString(e.target.value)})} />
                                        <input className="flex-1 border rounded p-1 text-sm" placeholder="بانک" value={newTax.bank} onChange={e => setNewTax({...newTax, bank: e.target.value})} />
                                        <input className="w-24 border rounded p-1 text-sm" placeholder="تاریخ" value={newTax.date} onChange={e => setNewTax({...newTax, date: e.target.value})} />
                                        <button onClick={handleAddTax} className="bg-orange-500 text-white p-1.5 rounded"><Plus size={18}/></button>
                                    </div>
                                    <div className="space-y-1">{greenLeafForm.taxes.map(t => (<div key={t.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span>{t.part}</span><span className="font-mono">{formatCurrency(t.amount)}</span><span>{t.bank}</span><span>{t.date}</span><button onClick={() => handleDeleteTax(t.id)} className="text-red-500"><Trash2 size={14}/></button></div>))}</div>
                                </div>

                                {/* SECTION 4: Road Tolls */}
                                <div className="border-t pt-6">
                                    <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Truck size={20} className="text-slate-600"/> عوارض جاده‌ای</h3>
                                    <div className="flex gap-2 items-end bg-slate-100 p-3 rounded mb-2 border border-slate-200">
                                        <input className="w-20 border rounded p-1 text-sm" placeholder="پارت" value={newRoadToll.part} onChange={e => setNewRoadToll({...newRoadToll, part: e.target.value})} />
                                        <input className="flex-1 border rounded p-1 text-sm" placeholder="مبلغ (ریال)" value={formatNumberString(newRoadToll.amount)} onChange={e => setNewRoadToll({...newRoadToll, amount: deformatNumberString(e.target.value)})} />
                                        <input className="flex-1 border rounded p-1 text-sm" placeholder="بانک" value={newRoadToll.bank} onChange={e => setNewRoadToll({...newRoadToll, bank: e.target.value})} />
                                        <input className="w-24 border rounded p-1 text-sm" placeholder="تاریخ" value={newRoadToll.date} onChange={e => setNewRoadToll({...newRoadToll, date: e.target.value})} />
                                        <button onClick={handleAddRoadToll} className="bg-slate-600 text-white p-1.5 rounded"><Plus size={18}/></button>
                                    </div>
                                    <div className="space-y-1">{greenLeafForm.roadTolls.map(t => (<div key={t.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm"><span>{t.part}</span><span className="font-mono">{formatCurrency(t.amount)}</span><span>{t.bank}</span><span>{t.date}</span><button onClick={() => handleDeleteRoadToll(t.id)} className="text-red-500"><Trash2 size={14}/></button></div>))}</div>
                                </div>

                                <div className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200 text-center">
                                    <div className="text-sm text-green-800 mb-1">جمع کل هزینه‌های برگ سبز (قابل انتقال به تایم‌لاین)</div>
                                    <div className="text-2xl font-bold text-green-700">{formatCurrency(calculateGreenLeafTotal(greenLeafForm))}</div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'internal_shipping' && (
                            <div className="bg-white p-6 rounded-xl border shadow-sm space-y-6 animate-fade-in">
                                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2"><Truck size={20} className="text-indigo-600"/> هزینه‌های حمل داخلی</h3>
                                
                                <div className="bg-indigo-50 p-3 rounded mb-2 border border-indigo-100 flex flex-wrap gap-2 items-end">
                                    <input className="border rounded p-1 text-sm flex-1 min-w-[100px]" placeholder="مبلغ (ریال)" value={formatNumberString(newShippingPayment.amount)} onChange={e => setNewShippingPayment({...newShippingPayment, amount: deformatNumberString(e.target.value)})} />
                                    <input className="border rounded p-1 text-sm flex-1 min-w-[100px]" placeholder="پارت / مرحله" value={newShippingPayment.part} onChange={e => setNewShippingPayment({...newShippingPayment, part: e.target.value})} />
                                    <input className="border rounded p-1 text-sm flex-1 min-w-[100px]" placeholder="بانک پرداخت کننده" value={newShippingPayment.bank} onChange={e => setNewShippingPayment({...newShippingPayment, bank: e.target.value})} />
                                    <input className="border rounded p-1 text-sm w-24" placeholder="تاریخ" value={newShippingPayment.date} onChange={e => setNewShippingPayment({...newShippingPayment, date: e.target.value})} />
                                    <input className="border rounded p-1 text-sm flex-[2] min-w-[150px]" placeholder="توضیحات (راننده، باربری...)" value={newShippingPayment.description} onChange={e => setNewShippingPayment({...newShippingPayment, description: e.target.value})} />
                                    <button onClick={handleAddShippingPayment} className="bg-indigo-600 text-white p-1.5 rounded"><Plus size={18}/></button>
                                </div>

                                <div className="space-y-1">
                                    {internalShippingForm.payments.length === 0 && <div className="text-center text-gray-400 py-4 text-sm">هنوز پرداختی ثبت نشده است.</div>}
                                    {internalShippingForm.payments.map(p => (
                                        <div key={p.id} className="flex justify-between items-center bg-white border p-2 rounded text-sm hover:bg-gray-50">
                                            <span className="font-bold font-mono text-indigo-700 w-24">{formatCurrency(p.amount)}</span>
                                            <span className="w-24 font-bold">{p.part}</span>
                                            <span className="w-24 text-gray-600">{p.bank}</span>
                                            <span className="w-24 text-gray-500 text-xs">{p.date}</span>
                                            <span className="flex-1 text-gray-500 truncate text-xs">{p.description}</span>
                                            <button onClick={() => handleDeleteShippingPayment(p.id)} className="text-red-500"><Trash2 size={14}/></button>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-200 text-center">
                                    <div className="text-sm text-indigo-800 mb-1">جمع کل هزینه‌های حمل داخلی</div>
                                    <div className="text-2xl font-bold text-indigo-700">
                                        {formatCurrency(internalShippingForm.payments.reduce((acc, p) => acc + p.amount, 0))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* COST SIDEBAR */}
                    <div className="w-72 bg-white border-r p-4 hidden lg:flex flex-col h-full shadow-lg z-20">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Calculator size={20}/> خلاصه هزینه‌ها</h3>
                        <div className="flex-1 overflow-y-auto space-y-3">
                            {STAGES.map(stage => {
                                const data = selectedRecord.stages[stage];
                                if (!data || (!data.costRial && !data.costCurrency)) return null;
                                return (
                                    <div key={stage} className="text-sm border-b pb-2">
                                        <div className="text-gray-600 mb-1">{stage}</div>
                                        {data.costRial > 0 && <div className="flex justify-between"><span className="text-gray-400 text-xs">ریال:</span><span className="font-mono font-bold">{formatCurrency(data.costRial)}</span></div>}
                                        {data.costCurrency > 0 && <div className="flex justify-between"><span className="text-gray-400 text-xs">ارز:</span><span className="font-mono font-bold text-blue-600">{formatCurrency(data.costCurrency).replace('ریال', data.currencyType)}</span></div>}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-auto border-t pt-4">
                            <div className="flex justify-between items-center mb-2"><span className="font-bold text-gray-700">جمع ریالی:</span><span className="font-mono font-bold">{formatCurrency(totalRial)}</span></div>
                            <div className="flex justify-between items-center"><span className="font-bold text-gray-700">جمع ارزی:</span><span className="font-mono font-bold text-blue-600">{formatCurrency(totalCurrency).replace('ریال', selectedRecord.mainCurrency || '')}</span></div>
                            
                            {/* Cost Price Calculation Section */}
                            <div className="mt-4 pt-4 border-t border-gray-200">
                                <h4 className="font-bold text-gray-800 text-sm mb-2 flex items-center gap-1">
                                    <Scale size={16}/> محاسبه قیمت تمام شده
                                </h4>
                                
                                <div className="mb-3">
                                    <label className="text-[10px] text-gray-500 block mb-1">نرخ ارز محاسباتی (ریال)</label>
                                    <input 
                                        type="text" 
                                        className="w-full border rounded p-1 text-sm font-mono text-center bg-yellow-50"
                                        placeholder="0"
                                        value={formatNumberString(selectedRecord.exchangeRate)}
                                        onChange={(e) => {
                                            const val = deformatNumberString(e.target.value);
                                            const updated = { ...selectedRecord, exchangeRate: val };
                                            updateTradeRecord(updated); // Optimistic UI
                                            setSelectedRecord(updated);
                                        }}
                                    />
                                </div>

                                {totalWeight > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-xs bg-gray-100 p-2 rounded flex justify-between">
                                             <span>وزن کل:</span>
                                             <span className="font-bold">{totalWeight} KG</span>
                                        </div>
                                        <div className="text-xs bg-gray-100 p-2 rounded flex justify-between">
                                             <span>هزینه هر کیلو:</span>
                                             <span className="font-bold text-blue-600">{formatCurrency(Math.round(costPerKg))}</span>
                                        </div>

                                        <div className="mt-2 space-y-2 max-h-40 overflow-y-auto pr-1">
                                            {selectedRecord.items.map((item, idx) => {
                                                 const itemFinalCost = Math.round(item.weight * costPerKg);
                                                 return (
                                                     <div key={idx} className="bg-gray-50 p-2 rounded border text-xs">
                                                         <div className="font-bold text-gray-700 truncate">{item.name}</div>
                                                         <div className="flex justify-between mt-1 items-center">
                                                             <span className="text-gray-500">{item.weight} KG</span>
                                                             <span className="font-bold text-green-700">{formatCurrency(itemFinalCost)}</span>
                                                         </div>
                                                     </div>
                                                 )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Default: Dashboard View
    const groupedData = getGroupedData();

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col animate-fade-in relative">
            {/* Create Modal */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><FolderOpen size={24} className="text-blue-600"/> پرونده جدید</h3>
                        <div className="space-y-3">
                            <div><label className="block text-sm font-bold mb-1">شماره پرونده (داخلی)</label><input className="w-full border rounded p-2" value={newFileNumber} onChange={e => setNewFileNumber(e.target.value)} autoFocus /></div>
                            <div><label className="block text-sm font-bold mb-1">شماره پرونده سامانه</label><input className="w-full border rounded p-2" value={newGoodsName} onChange={e => setNewGoodsName(e.target.value)} placeholder="به عنوان عنوان پرونده و شماره ثبت استفاده می‌شود" /></div>
                            <div><label className="block text-sm font-bold mb-1">فروشنده</label><input className="w-full border rounded p-2" value={newSellerName} onChange={e => setNewSellerName(e.target.value)} /></div>
                            <div><label className="block text-sm font-bold mb-1">شرکت</label><select className="w-full border rounded p-2 bg-white" value={newRecordCompany} onChange={e => setNewRecordCompany(e.target.value)}>{availableCompanies.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="block text-sm font-bold mb-1">گروه کالایی</label><select className="w-full border rounded p-2 bg-white" value={newCommodityGroup} onChange={e => setNewCommodityGroup(e.target.value)}><option value="">انتخاب کنید...</option>{commodityGroups.map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                            <div><label className="block text-sm font-bold mb-1">ارز پایه</label><select className="w-full border rounded p-2 bg-white" value={newMainCurrency} onChange={e => setNewMainCurrency(e.target.value)}>{CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}</select></div>
                            <div className="flex gap-2 mt-4"><button onClick={() => setShowNewModal(false)} className="flex-1 py-2 border rounded text-gray-600 hover:bg-gray-50">انصراف</button><button onClick={handleCreateRecord} className="flex-1 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold">ایجاد پرونده</button></div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    {navLevel !== 'ROOT' && <button onClick={navLevel === 'COMPANY' ? goRoot : () => goCompany(selectedCompany!)} className="p-2 hover:bg-gray-200 rounded-full"><ArrowRight size={20}/></button>}
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        {navLevel === 'ROOT' ? <><LayoutDashboard className="text-blue-600"/> داشبورد بازرگانی</> : navLevel === 'COMPANY' ? <><Building2 className="text-blue-600"/> {selectedCompany}</> : <><Package className="text-blue-600"/> {selectedGroup}</>}
                    </h2>
                </div>
                <div className="flex gap-2">
                    <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/><input type="text" placeholder="جستجو در پرونده‌ها..." className="pl-4 pr-10 py-2 border rounded-lg text-sm w-64" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></div>
                    <button onClick={() => setViewMode('reports')} className="bg-purple-100 text-purple-700 px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-purple-200"><FileSpreadsheet size={18}/> گزارشات</button>
                    <button onClick={() => setShowNewModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20"><Plus size={18}/> پرونده جدید</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 overflow-y-auto pb-20">
                {searchTerm ? (
                    records.filter(r => r.goodsName?.includes(searchTerm) || r.fileNumber.includes(searchTerm)).map(record => (
                        <div key={record.id} onClick={() => { setSelectedRecord(record); setViewMode('details'); }} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-1.5 h-full bg-blue-500 group-hover:w-2 transition-all"></div>
                            <div className="flex justify-between items-start mb-2"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded font-bold">{record.fileNumber}</span><span className="text-xs text-gray-400">{new Date(record.createdAt).toLocaleDateString('fa-IR')}</span></div>
                            <h3 className="font-bold text-gray-800 mb-1 truncate" title={record.goodsName}>{record.goodsName}</h3>
                            <p className="text-xs text-gray-500 mb-4 truncate">{record.company} | {record.sellerName}</p>
                            <div className="flex justify-between items-center pt-3 border-t border-gray-50"><span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded">{record.commodityGroup}</span><button onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record.id); }} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></div>
                        </div>
                    ))
                ) : (
                    navLevel === 'GROUP' ? (
                        records.filter(r => r.company === selectedCompany && r.commodityGroup === selectedGroup).map(record => (
                            <div key={record.id} onClick={() => { setSelectedRecord(record); setViewMode('details'); }} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-1.5 h-full bg-blue-500 group-hover:w-2 transition-all"></div>
                                <div className="flex justify-between items-start mb-2"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded font-bold">{record.fileNumber}</span><span className="text-xs text-gray-400">{new Date(record.createdAt).toLocaleDateString('fa-IR')}</span></div>
                                <h3 className="font-bold text-gray-800 mb-1 truncate" title={record.goodsName}>{record.goodsName}</h3>
                                <p className="text-xs text-gray-500 mb-4 truncate">{record.sellerName}</p>
                                <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                                    <div className="flex -space-x-2 space-x-reverse overflow-hidden">
                                        {STAGES.slice().reverse().map((stage, idx) => (
                                            <div key={stage} className={`w-2 h-2 rounded-full ${record.stages[stage]?.isCompleted ? 'bg-green-500' : 'bg-gray-200'}`} title={stage}></div>
                                        ))}
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record.id); }} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))
                    ) : (
                        groupedData.map((item, idx) => (
                            <div key={idx} onClick={() => item.type === 'company' ? goCompany(item.name) : goGroup(item.name)} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:-translate-y-1 transition-all flex flex-col items-center justify-center gap-3 text-center group">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg ${item.type === 'company' ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200' : 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-200'}`}>
                                    {item.type === 'company' ? <Building2 size={32}/> : <Package size={32}/>}
                                </div>
                                <h3 className="font-bold text-gray-800 text-lg group-hover:text-blue-600 transition-colors">{item.name}</h3>
                                <span className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded-full font-bold">{item.count} پرونده</span>
                            </div>
                        ))
                    )
                )}
            </div>
        </div>
    );
};

export default TradeModule;
