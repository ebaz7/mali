
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  FINANCIAL = 'financial',
  MANAGER = 'manager',
  CEO = 'ceo'
}

export enum OrderStatus {
  PENDING = 'در انتظار بررسی مالی',
  APPROVED_FINANCE = 'تایید مالی / در انتظار مدیریت',
  APPROVED_MANAGER = 'تایید مدیریت / در انتظار مدیرعامل',
  APPROVED_CEO = 'تایید نهایی',
  REJECTED = 'رد شده'
}

export enum PaymentMethod {
  CASH = 'نقد / تنخواه',
  CHEQUE = 'چک',
  TRANSFER = 'حواله بانکی'
}

export interface User {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: UserRole;
  avatar?: string;
  telegramChatId?: string;
  canManageTrade?: boolean;
}

export interface PaymentDetail {
  id: string;
  method: PaymentMethod;
  amount: number;
  chequeNumber?: string;
  bankName?: string;
  description?: string;
  chequeDate?: string;
}

export interface PaymentOrder {
  id: string;
  trackingNumber: number;
  date: string;
  payee: string;
  totalAmount: number;
  description: string;
  status: OrderStatus;
  requester: string;
  createdAt: number;
  updatedAt?: number;
  paymentDetails: PaymentDetail[];
  attachments?: { fileName: string, data: string }[];
  payingCompany?: string;
  approverFinancial?: string;
  approverManager?: string;
  approverCeo?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface Company {
    id: string;
    name: string;
    logo?: string;
}

export interface RolePermissions {
    canViewAll?: boolean;
    canEditOwn?: boolean;
    canEditAll?: boolean;
    canDeleteOwn?: boolean;
    canDeleteAll?: boolean;
    canApproveFinancial?: boolean;
    canApproveManager?: boolean;
    canApproveCeo?: boolean;
    canManageTrade?: boolean;
    canManageSettings?: boolean;
}

export interface SystemSettings {
  currentTrackingNumber: number;
  companyNames: string[]; // Legacy
  companies: Company[];
  defaultCompany: string;
  bankNames: string[];
  commodityGroups: string[];
  rolePermissions: Record<string, RolePermissions>;
  pwaIcon?: string;
  telegramBotToken?: string;
  telegramAdminId?: string;
  smsApiKey?: string;
  smsSenderNumber?: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  senderUsername: string;
  role: UserRole;
  message: string;
  timestamp: number;
  recipient?: string; // For private messages (username)
  groupId?: string; // For group messages
  attachment?: { fileName: string, url: string };
  audioUrl?: string;
  replyTo?: { id: string, sender: string, message: string };
  isEdited?: boolean;
}

export interface ChatGroup {
  id: string;
  name: string;
  members: string[]; // usernames
  createdBy: string;
  icon?: string;
}

export interface GroupTask {
  id: string;
  groupId: string;
  title: string;
  assignee?: string; // username
  isCompleted: boolean;
  createdBy: string;
  createdAt: number;
}

// Trade Types

export enum TradeStage {
    PROFORMA = 'پیش‌فاکتور (Proforma)',
    LICENSES = 'مجوزها / ثبت سفارش',
    ALLOCATION_QUEUE = 'صف تخصیص ارز',
    ALLOCATION_APPROVED = 'تایید تخصیص',
    CURRENCY_PURCHASE = 'خرید ارز',
    INSURANCE = 'بیمه باربری',
    SHIPPING_DOCS = 'اسناد حمل',
    INSPECTION = 'بازرسی',
    CLEARANCE_DOCS = 'ترخیصیه و قبض انبار',
    GREEN_LEAF = 'اظهار و برگ سبز',
    INTERNAL_SHIPPING = 'حمل داخلی',
    AGENT_FEES = 'کارمزد ترخیص'
}

export interface TradeItem {
    id: string;
    name: string;
    weight: number;
    unitPrice: number;
    totalPrice: number;
}

export interface TradeTransaction {
    id: string;
    amount: number;
    date: string;
    bank: string;
    description?: string;
}

export interface InsuranceEndorsement {
    id: string;
    date: string;
    description: string;
    amount: number;
}

export interface InspectionCertificate {
    id: string;
    part: string;
    company: string;
    certificateNumber: string;
    amount: number;
    description?: string;
}

export interface InspectionPayment {
    id: string;
    part: string;
    amount: number;
    date: string;
    bank: string;
    description?: string;
}

export interface InspectionData {
    certificates: InspectionCertificate[];
    payments: InspectionPayment[];
    // Legacy/Init
    company?: string;
    cost?: number;
    result?: string;
    date?: string;
    certificateNumber?: string;
    inspectionCompany?: string;
    totalInvoiceAmount?: number;
}

export interface WarehouseReceipt {
    id: string;
    number: string;
    part: string;
    issueDate: string;
}

export interface ClearancePayment {
    id: string;
    amount: number;
    part: string;
    bank: string;
    date: string;
    payingBank?: string;
}

export interface ClearanceData {
    receipts: WarehouseReceipt[];
    payments: ClearancePayment[];
    // Legacy
    customsName?: string; 
    declarationNumber?: string; 
    greenPath?: boolean;
    cost?: number; 
    date?: string;
}

export interface GreenLeafCustomsDuty {
    id: string;
    cottageNumber: string;
    part: string;
    amount: number;
    paymentMethod: string;
    bank?: string;
    date?: string;
}

export interface GreenLeafGuarantee {
    id: string;
    relatedDutyId?: string;
    guaranteeNumber: string;
    chequeNumber?: string;
    chequeBank?: string;
    chequeDate?: string;
    chequeAmount?: number;
    isDelivered: boolean;
    cashAmount?: number;
    cashBank?: string;
    cashDate?: string;
    part?: string;
}

export interface GreenLeafTax {
    id: string;
    amount: number;
    part: string;
    bank: string;
    date: string;
}

export interface GreenLeafRoadToll {
    id: string;
    amount: number;
    part: string;
    bank: string;
    date: string;
}

export interface GreenLeafData {
    duties: GreenLeafCustomsDuty[];
    guarantees: GreenLeafGuarantee[];
    taxes: GreenLeafTax[];
    roadTolls: GreenLeafRoadToll[];
    // Legacy
    number?: string;
    date?: string;
    fileUrl?: string;
}

export interface ShippingPayment {
    id: string;
    part: string;
    amount: number;
    date: string;
    bank: string;
    description: string;
}

export interface InternalShippingData {
    payments: ShippingPayment[];
    // Legacy
    driverName?: string;
    plateNumber?: string;
    cost?: number;
    destination?: string;
    arrivalDate?: string;
}

export interface AgentPayment {
    id: string;
    agentName: string;
    amount: number;
    bank: string;
    date: string;
    part: string;
    description: string;
}

export interface AgentData {
    payments: AgentPayment[];
    // Legacy
    name?: string;
    phone?: string;
    cost?: number;
}

export interface CurrencyTranche {
    id: string;
    date: string;
    amount: number;
    currencyType: string;
    brokerName?: string;
    exchangeName?: string;
    rate?: number;
    isDelivered?: boolean;
    deliveryDate?: string;
}

export interface CurrencyPurchaseData {
    payments: any[]; 
    purchasedAmount: number;
    purchasedCurrencyType: string;
    purchaseDate?: string;
    brokerName?: string;
    exchangeName?: string;
    deliveredAmount: number;
    deliveredCurrencyType?: string;
    deliveryDate?: string;
    recipientName?: string;
    remittedAmount: number;
    isDelivered: boolean;
    tranches: CurrencyTranche[];
    guaranteeCheque?: {
        amount: string | number;
        bank: string;
        chequeNumber: string;
        dueDate: string;
        isDelivered?: boolean;
    };
    // Legacy
    amount?: number;
    rate?: number;
    date?: string;
}

export interface InvoiceItem {
    id: string;
    name: string;
    weight: number;
    unitPrice: number;
    totalPrice: number;
    part: string;
}

export interface PackingItem {
    id: string;
    description: string;
    netWeight: number;
    grossWeight: number;
    packageCount: number;
    part: string;
}

export type ShippingDocType = 'Commercial Invoice' | 'Packing List' | 'Bill of Lading' | 'Certificate of Origin' | 'Insurance Policy' | 'Other';
export type DocStatus = 'Draft' | 'Final';

export interface ShippingDocument {
    id: string;
    type: ShippingDocType;
    status: DocStatus;
    documentNumber: string;
    documentDate: string;
    createdAt: number;
    createdBy: string;
    attachments: { fileName: string, url: string }[];
    
    invoiceItems?: InvoiceItem[];
    freightCost?: number;
    currency?: string;

    packingItems?: PackingItem[];
    netWeight?: number;
    grossWeight?: number;
    packagesCount?: number;

    vesselName?: string;
    portOfLoading?: string;
    portOfDischarge?: string;
    description?: string;
    
    // Legacy
    title?: string;
    fileUrl?: string;
}

export interface TradeStageData {
    stage: TradeStage;
    isCompleted: boolean;
    description: string;
    costRial: number;
    costCurrency: number;
    currencyType: string;
    attachments: { fileName: string, url: string }[];
    updatedAt: number;
    updatedBy: string;
    
    queueDate?: string;
    allocationDate?: string;
    allocationCode?: string;
    allocationExpiry?: string;
    
    // Legacy
    completedAt?: number;
    completedBy?: string;
    notes?: string;
}

export interface TradeRecord {
    id: string;
    company?: string; 
    fileNumber: string; 
    registrationNumber?: string; 
    registrationDate?: string; 
    registrationExpiry?: string; 
    
    commodityGroup?: string; 
    sellerName: string; 
    mainCurrency?: string; 
    currencyAllocationType?: string; 

    items: TradeItem[];
    freightCost: number; 
    exchangeRate?: number; 
    operatingBank?: string; 

    licenseData?: {
        transactions: TradeTransaction[]; 
        // Legacy
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
    
    // Legacy support
    goodsName?: string; 
    orderNumber?: string;
}
