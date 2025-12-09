
export enum PaymentMethod {
  CASH = 'نقد',
  CHEQUE = 'چک',
  TRANSFER = 'حواله بانکی',
  POS = 'کارتخوان'
}

export enum OrderStatus {
  PENDING = 'در انتظار بررسی مالی', 
  APPROVED_FINANCE = 'تایید مالی / در انتظار مدیریت', 
  APPROVED_MANAGER = 'تایید مدیریت / در انتظار مدیرعامل', 
  APPROVED_CEO = 'تایید نهایی', 
  REJECTED = 'رد شده'
}

export enum ExitPermitStatus {
  PENDING_CEO = 'در انتظار تایید مدیرعامل',
  PENDING_FACTORY = 'تایید مدیرعامل / در انتظار خروج (کارخانه)',
  EXITED = 'خارج شده (بایگانی)',
  REJECTED = 'رد شده'
}

export enum UserRole {
  ADMIN = 'admin',        
  CEO = 'ceo',            
  MANAGER = 'manager',    
  FINANCIAL = 'financial',
  SALES_MANAGER = 'sales_manager', 
  FACTORY_MANAGER = 'factory_manager', 
  USER = 'user'           
}

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  canManageTrade?: boolean; 
  receiveNotifications?: boolean; 
  avatar?: string; 
  telegramChatId?: string; 
  phoneNumber?: string; 
}

export interface PaymentDetail {
  id: string;
  amount: number;
  method: PaymentMethod;
  chequeNumber?: string;
  chequeDate?: string; 
  bankName?: string;
  description?: string; 
}

export interface PaymentOrder {
  id: string;
  trackingNumber: number;
  date: string; 
  payee: string; 
  totalAmount: number; 
  description: string;
  status: OrderStatus;
  payingCompany?: string; 
  paymentDetails: PaymentDetail[];
  requester: string;
  approverFinancial?: string;
  approverManager?: string;
  approverCeo?: string;
  rejectionReason?: string;
  rejectedBy?: string; 
  attachments?: { fileName: string; data: string; }[];
  createdAt: number;
  updatedAt?: number; 
}

// Exit Permit Types
export interface ExitPermitItem {
  id: string;
  goodsName: string;
  cartonCount: number;
  weight: number;
}

export interface ExitPermitDestination {
  id: string;
  recipientName: string;
  address: string;
  phone?: string;
}

export interface ExitPermit {
  id: string;
  permitNumber: number;
  date: string;
  requester: string; 
  items: ExitPermitItem[];
  destinations: ExitPermitDestination[];
  goodsName?: string;
  cartonCount?: number;
  weight?: number; 
  recipientName?: string;
  destinationAddress?: string;
  plateNumber?: string; 
  driverName?: string; 
  description?: string;
  status: ExitPermitStatus;
  approverCeo?: string;
  approverFactory?: string;
  rejectionReason?: string;
  rejectedBy?: string;
  createdAt: number;
  updatedAt?: number;
}

// --- WAREHOUSE MODULE TYPES ---
export interface WarehouseItem {
    id: string;
    code: string;
    name: string;
    unit: string; // e.g., Kg, Carton, Pcs
    containerCapacity?: number; // Capacity per container
    description?: string;
}

export interface WarehouseTransactionItem {
    itemId: string;
    itemName: string; // Cached name
    quantity: number;
    weight: number;
    unitPrice?: number; // Optional, only for OUT (Bijak)
}

export interface WarehouseTransaction {
    id: string;
    type: 'IN' | 'OUT';
    date: string; // ISO Date
    company: string; // Owner Company
    number: number; // Receipt Number or Bijak Number
    
    // For IN
    proformaNumber?: string;
    
    // For OUT
    recipientName?: string;
    driverName?: string;
    plateNumber?: string;
    destination?: string;

    items: WarehouseTransactionItem[];
    description?: string;
    
    createdAt: number;
    createdBy: string;
}

export interface RolePermissions {
    canViewAll: boolean;
    canViewPaymentOrders: boolean;
    canViewExitPermits: boolean;
    canApproveFinancial: boolean;
    canApproveManager: boolean;
    canApproveCeo: boolean;
    canEditOwn: boolean;
    canEditAll: boolean;
    canDeleteOwn: boolean;
    canDeleteAll: boolean;
    canManageTrade: boolean; 
    canManageSettings?: boolean; 
    canCreateExitPermit?: boolean; 
    canApproveExitCeo?: boolean; 
    canApproveExitFactory?: boolean;
    
    // Warehouse Permissions
    canManageWarehouse?: boolean; // Full Access
    canViewWarehouseReports?: boolean; // Read Only
}

export interface Company {
    id: string;
    name: string;
    logo?: string; 
}

export interface Contact {
    id: string;
    name: string;
    number: string;
    isGroup?: boolean; 
}

export interface SystemSettings {
  currentTrackingNumber: number;
  currentExitPermitNumber: number; 
  companyNames: string[]; 
  companies?: Company[]; 
  defaultCompany: string; 
  bankNames: string[]; 
  commodityGroups: string[]; 
  rolePermissions: Record<string, RolePermissions>; 
  savedContacts?: Contact[]; 
  pwaIcon?: string; 
  telegramBotToken?: string; 
  telegramAdminId?: string; 
  smsApiKey?: string; 
  smsSenderNumber?: string; 
  googleCalendarId?: string; 
  whatsappNumber?: string; 
  geminiApiKey?: string; 
  
  // Warehouse Settings
  warehouseSequences?: Record<string, number>; // Company Name -> Next Bijak Number
  defaultWarehouseGroup?: string; // WhatsApp ID
  defaultSalesManager?: string; // WhatsApp ID
}

export interface DashboardStats {
  totalPending: number;
  totalApproved: number;
  totalAmount: number;
}

export interface ChatMessage {
    id: string;
    sender: string;
    senderUsername: string; 
    recipient?: string; 
    groupId?: string; 
    role: UserRole;
    message: string;
    timestamp: number;
    attachment?: {
        fileName: string;
        url: string;
    };
    audioUrl?: string; 
    isEdited?: boolean; 
    replyTo?: {
        id: string;
        sender: string;
        message: string;
    };
}

export interface ChatGroup {
    id: string;
    name: string;
    members: string[]; 
    createdBy: string;
    icon?: string; 
}

export interface GroupTask {
    id: string;
    groupId: string;
    title: string;
    assignee?: string; 
    isCompleted: boolean;
    createdBy: string;
    createdAt: number;
}

export interface AppNotification {
    id: string;
    title: string;
    message: string;
    timestamp: number;
    read: boolean;
}

// ... (Trade Module Types kept same for brevity) ...
export enum TradeStage {
    LICENSES = 'مجوزها و پروفرما',
    INSURANCE = 'بیمه',
    ALLOCATION_QUEUE = 'در صف تخصیص ارز',
    ALLOCATION_APPROVED = 'تخصیص یافته',
    CURRENCY_PURCHASE = 'خرید ارز',
    SHIPPING_DOCS = 'اسناد حمل',
    INSPECTION = 'گواهی بازرسی',
    CLEARANCE_DOCS = 'ترخیصیه و قبض انبار',
    GREEN_LEAF = 'برگ سبز',
    INTERNAL_SHIPPING = 'حمل داخلی',
    AGENT_FEES = 'هزینه‌های ترخیص',
    FINAL_COST = 'قیمت تمام شده'
}

export interface TradeStageData {
    stage: TradeStage;
    isCompleted: boolean;
    description: string;
    costRial: number;
    costCurrency: number;
    currencyType: string; 
    attachments: { fileName: string; url: string }[];
    updatedAt: number;
    updatedBy: string;
    queueDate?: string; 
    currencyRate?: number; 
    allocationDate?: string; 
    allocationExpiry?: string; 
    allocationCode?: string; 
}

export interface TradeItem {
    id: string;
    name: string;
    weight: number; 
    unitPrice: number;
    totalPrice: number;
}

export interface InsuranceEndorsement {
    id: string;
    date: string;
    amount: number; 
    description: string;
}

export interface InspectionPayment {
    id: string;
    part: string; 
    amount: number;
    bank: string;
    date: string;
    description?: string;
}

export interface InspectionCertificate {
    id: string;
    part: string; 
    certificateNumber: string;
    company: string;
    amount: number;
    description?: string;
}

export interface InspectionData {
    inspectionCompany?: string; 
    certificateNumber?: string;
    totalInvoiceAmount?: number;
    certificates: InspectionCertificate[]; 
    payments: InspectionPayment[]; 
}

export interface WarehouseReceipt {
    id: string;
    number: string;
    part: string;
    issueDate: string;
}

export interface ClearancePayment {
    id: string;
    part: string;
    amount: number;
    date: string;
    bank: string;
    payingBank?: string; 
}

export interface ClearanceData {
    receipts: WarehouseReceipt[];
    payments: ClearancePayment[];
}

export interface GreenLeafCustomsDuty {
    id: string;
    cottageNumber: string; 
    part: string; 
    amount: number; 
    paymentMethod: 'Bank' | 'Guarantee'; 
    bank?: string;
    date?: string;
}

export interface GreenLeafGuarantee {
    id: string;
    relatedDutyId: string; 
    guaranteeNumber: string; 
    chequeNumber?: string;
    chequeBank?: string;
    chequeDate?: string;
    chequeAmount?: number; 
    isDelivered?: boolean; 
    cashAmount: number;
    cashBank?: string;
    cashDate?: string;
    part?: string; 
}

export interface GreenLeafTax {
    id: string;
    part: string;
    amount: number;
    bank: string;
    date: string;
}

export interface GreenLeafRoadToll {
    id: string;
    part: string;
    amount: number;
    bank: string;
    date: string;
}

export interface GreenLeafData {
    duties: GreenLeafCustomsDuty[];
    guarantees: GreenLeafGuarantee[];
    taxes: GreenLeafTax[];
    roadTolls: GreenLeafRoadToll[];
}

export interface ShippingPayment {
    id: string;
    part: string;
    amount: number;
    date: string;
    bank: string;
    description?: string;
}

export interface InternalShippingData {
    payments: ShippingPayment[];
}

export interface AgentPayment {
    id: string;
    agentName: string;
    amount: number;
    bank: string;
    date: string;
    part: string;
    description?: string;
}

export interface AgentData {
    payments: AgentPayment[];
}

export interface CurrencyPayment {
    id: string;
    date: string;
    amount: number;
    bank: string;
    type: 'PAYMENT' | 'REFUND'; 
    description?: string;
}

export interface TradeTransaction {
    id: string;
    date: string;
    amount: number;
    bank?: string;
    description: string;
}

export interface CurrencyTranche {
    id: string;
    date: string;
    amount: number; 
    currencyType: string;
    rate?: number; 
    brokerName?: string;
    exchangeName?: string;
    isDelivered?: boolean;
    deliveryDate?: string;
}

export interface CurrencyPurchaseData {
    guaranteeCheque?: {
        chequeNumber: string;
        amount: number;
        dueDate: string;
        bank: string;
        isReturned?: boolean; 
        returnDate?: string; 
        isDelivered?: boolean; 
    };
    payments: CurrencyPayment[]; 
    tranches?: CurrencyTranche[];
    purchasedAmount: number; 
    purchasedCurrencyType?: string; 
    purchaseDate?: string; 
    brokerName?: string; 
    exchangeName?: string; 
    deliveredAmount: number; 
    deliveredCurrencyType?: string; 
    deliveryDate?: string; 
    recipientName?: string; 
    remittedAmount: number; 
    isDelivered: boolean; 
}

export type ShippingDocType = 'Commercial Invoice' | 'Packing List' | 'Certificate of Origin' | 'Bill of Lading';
export type DocStatus = 'Draft' | 'Final';

export interface InvoiceItem {
    id: string;
    name: string;
    weight: number;
    unitPrice: number;
    totalPrice: number;
    part?: string; 
}

export interface PackingItem {
    id: string;
    description: string;
    netWeight: number;
    grossWeight: number;
    packageCount: number;
    part: string;
}

export interface ShippingDocument {
    id: string;
    type: ShippingDocType;
    status: DocStatus; 
    documentNumber: string;
    documentDate: string;
    partNumber?: string; 
    invoiceItems?: InvoiceItem[];
    amount?: number; 
    freightCost?: number; 
    currency?: string;
    packingItems?: PackingItem[];
    netWeight?: number; 
    grossWeight?: number; 
    packagesCount?: number; 
    chamberOfCommerce?: string;
    vesselName?: string;
    portOfLoading?: string;
    portOfDischarge?: string;
    description?: string;
    attachments: { fileName: string; url: string }[];
    createdAt: number;
    createdBy: string;
}

export interface TradeRecord {
    id: string;
    company?: string; 
    fileNumber: string; 
    registrationNumber?: string; 
    registrationDate?: string; 
    registrationExpiry?: string; 
    currencyAllocationType?: string; 
    allocationCurrencyRank?: 'Type1' | 'Type2'; 
    isPriority?: boolean; 
    commodityGroup?: string; 
    sellerName: string; 
    mainCurrency?: string; 
    items: TradeItem[];
    freightCost: number; 
    exchangeRate?: number; 
    operatingBank?: string; 
    licenseData?: {
        transactions: TradeTransaction[]; 
        registrationCost?: number;
        bankName?: string;
        paymentDate?: string;
    };
    insuranceData?: {
        policyNumber: string;
        company: string;
        cost: number; 
        bank: string;
        endorsements?: InsuranceEndorsement[]; 
    };
    inspectionData?: InspectionData;
    clearanceData?: ClearanceData;
    greenLeafData?: GreenLeafData;
    internalShippingData?: InternalShippingData;
    agentData?: AgentData;
    currencyPurchaseData?: CurrencyPurchaseData;
    shippingDocuments?: ShippingDocument[];
    startDate: string; 
    status: 'Active' | 'Completed' | 'Cancelled';
    isCommitmentFulfilled?: boolean; 
    isArchived?: boolean; 
    stages: Record<string, TradeStageData>; 
    createdAt: number;
    createdBy: string;
    goodsName?: string; 
    orderNumber?: string;
}
