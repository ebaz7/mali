
export enum PaymentMethod {
  CASH = 'نقد',
  CHEQUE = 'چک',
  TRANSFER = 'حواله بانکی',
  POS = 'کارتخوان'
}

export enum OrderStatus {
  PENDING = 'در انتظار بررسی مالی', // Waiting for Financial Manager
  APPROVED_FINANCE = 'تایید مالی / در انتظار مدیریت', // Financial done, waiting for Manager
  APPROVED_MANAGER = 'تایید مدیریت / در انتظار مدیرعامل', // Manager done, waiting for CEO
  APPROVED_CEO = 'تایید نهایی', // Done
  REJECTED = 'رد شده'
}

export enum UserRole {
  ADMIN = 'admin',        // Can do everything (superuser)
  CEO = 'ceo',            // Final approver (مدیر عامل)
  MANAGER = 'manager',    // Middle approver (مدیریت)
  FINANCIAL = 'financial',// First approver (مدیر مالی)
  USER = 'user'           // Requester
}

export interface User {
  id: string;
  username: string;
  password: string;
  fullName: string;
  role: UserRole;
  canManageTrade?: boolean; // Specific permission override
  avatar?: string; // Profile picture URL
  telegramChatId?: string; // Telegram Chat ID for notifications
}

export interface PaymentDetail {
  id: string;
  amount: number;
  method: PaymentMethod;
  chequeNumber?: string;
  chequeDate?: string; // New: Cheque Due Date (Shamsi YYYY/MM/DD)
  bankName?: string;
  description?: string; // New optional description field
}

export interface PaymentOrder {
  id: string;
  trackingNumber: number;
  date: string; // ISO String YYYY-MM-DD
  payee: string; 
  totalAmount: number; // Sum of all payment details
  description: string;
  status: OrderStatus;
  payingCompany?: string; // New: The company paying the order
  
  // Payment Details (Array for multiple methods)
  paymentDetails: PaymentDetail[];

  // People
  requester: string;
  approverFinancial?: string;
  approverManager?: string;
  approverCeo?: string;
  
  // Rejection Logic
  rejectionReason?: string;
  rejectedBy?: string; // New: Stores who rejected the order

  // Attachments
  attachments?: {
      fileName: string;
      data: string; // URL if on server, Base64 if offline
  }[];

  createdAt: number;
  updatedAt?: number; // For tracking notifications
}

export interface RolePermissions {
    canViewAll: boolean;
    canApproveFinancial: boolean;
    canApproveManager: boolean;
    canApproveCeo: boolean;
    canEditOwn: boolean;
    canEditAll: boolean;
    canDeleteOwn: boolean;
    canDeleteAll: boolean;
    canManageTrade: boolean; // Default Role-based permission
    canManageSettings?: boolean; // New: Access to settings page
}

export interface Company {
    id: string;
    name: string;
    logo?: string; // URL or Base64
}

export interface SystemSettings {
  currentTrackingNumber: number;
  companyNames: string[]; // Legacy: List of available companies
  companies?: Company[]; // New: Objects with logos
  defaultCompany: string; // Default selection
  bankNames: string[]; // List of available banks
  commodityGroups: string[]; // Trade: Commodity Groups
  rolePermissions: Record<string, RolePermissions>; // Dynamic permissions
  pwaIcon?: string; // Custom PWA Icon URL
  telegramBotToken?: string; // Token for Telegram Bot Notifications
  telegramAdminId?: string; // Chat ID of the main admin for backups
  smsApiKey?: string; // API Key for SMS Panel
  smsSenderNumber?: string; // Sender Number for SMS
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
    audioUrl?: string; // For Voice Messages
    isEdited?: boolean; // Track if message was edited
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
    icon?: string; // Group icon URL
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

// --- TRADE MODULE TYPES ---

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
    currencyType: string; // USD, EUR, AED, etc.
    attachments: { fileName: string; url: string }[];
    updatedAt: number;
    updatedBy: string;
    
    // Specific fields for Allocation Queue
    queueDate?: string; // YYYY/MM/DD - تاریخ ورود به صف
    currencyRate?: number; // نرخ ارز مبادله‌ای/نیمایی برای گزارش
    
    // Specific for Allocation Approved
    allocationDate?: string; // تاریخ تخصیص
    allocationExpiry?: string; // مهلت انقضای تخصیص
    allocationCode?: string; // کد تخصیص (فیش)
}

export interface TradeItem {
    id: string;
    name: string;
    weight: number; // KG
    unitPrice: number;
    totalPrice: number;
}

export interface InsuranceEndorsement {
    id: string;
    date: string;
    amount: number; // Positive = Cost Increase, Negative = Refund/Credit
    description: string;
}

export interface InspectionPayment {
    id: string;
    part: string; // e.g. "Part 1", "Final"
    amount: number;
    bank: string;
    date: string;
    description?: string;
}

export interface InspectionCertificate {
    id: string;
    part: string; // e.g. "COI Original", "Amendment 1"
    certificateNumber: string;
    company: string;
    amount: number;
    description?: string;
}

export interface InspectionData {
    // Legacy fields (kept for migration safety, but UI will focus on arrays)
    inspectionCompany?: string; 
    certificateNumber?: string;
    totalInvoiceAmount?: number;
    
    certificates: InspectionCertificate[]; // List of certificates/parts
    payments: InspectionPayment[]; // List of payments
}

// New Types for Clearance & Warehouse Receipt
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
    payingBank?: string; // بانک پرداخت کننده
}

export interface ClearanceData {
    receipts: WarehouseReceipt[];
    payments: ClearancePayment[];
}

// --- GREEN LEAF (برگ سبز) TYPES ---

export interface GreenLeafCustomsDuty {
    id: string;
    cottageNumber: string; // کوتاژ
    part: string; // پارت
    amount: number; // مبلغ
    paymentMethod: 'Bank' | 'Guarantee'; // روش پرداخت
    // If Bank
    bank?: string;
    date?: string;
}

export interface GreenLeafGuarantee {
    id: string;
    relatedDutyId: string; // Link to the specific Customs Duty
    guaranteeNumber: string; // شماره ضمانت‌نامه
    
    // Cheque Info
    chequeNumber?: string;
    chequeBank?: string;
    chequeDate?: string;
    chequeAmount?: number; // New: Cheque Amount (Add to Cost)
    isDelivered?: boolean; // New: Delivery Status
    
    // Cash Deposit (نقدی ضمانت‌نامه)
    cashAmount: number;
    cashBank?: string;
    cashDate?: string;
    part?: string; // Inherited or manual
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

// --- INTERNAL SHIPPING TYPES ---
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

// --- AGENT/CLEARANCE FEES TYPES ---
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
    type: 'PAYMENT' | 'REFUND'; // واریز | عودت
    description?: string;
}

// New Generic Transaction for License Costs etc.
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
    amount: number; // Amount of foreign currency
    currencyType: string;
    rate?: number; // Rial rate per unit (optional)
    brokerName?: string;
    exchangeName?: string;
    
    // New fields for per-tranche delivery tracking
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
        isDelivered?: boolean; // New: Delivery Status
    };
    payments: CurrencyPayment[]; // Rial flow
    
    // Finalization - Now supports multiple tranches
    tranches?: CurrencyTranche[];

    // Legacy single fields (kept for backward compatibility if needed, but we will rely on tranches)
    purchasedAmount: number; 
    purchasedCurrencyType?: string; 
    purchaseDate?: string; 
    brokerName?: string; 
    exchangeName?: string; 
    
    deliveredAmount: number; // ارز تحویل شده (Total)
    deliveredCurrencyType?: string; 
    deliveryDate?: string; 
    recipientName?: string; 
    
    remittedAmount: number; // ارز حواله شده
    
    isDelivered: boolean; // تیک تحویل نهایی (کلی)
}

export type ShippingDocType = 'Commercial Invoice' | 'Packing List' | 'Certificate of Origin' | 'Bill of Lading';
export type DocStatus = 'Draft' | 'Final';

export interface InvoiceItem {
    id: string;
    name: string;
    weight: number;
    unitPrice: number;
    totalPrice: number;
}

export interface ShippingDocument {
    id: string;
    type: ShippingDocType;
    status: DocStatus; // Initial/Draft or Final
    documentNumber: string;
    documentDate: string;
    partNumber?: string; // For partial shipments
    
    // Invoice Specific
    invoiceItems?: InvoiceItem[];
    amount?: number; // Total amount (calculated or manual)
    freightCost?: number; // Cost of shipping for this invoice
    currency?: string;
    
    // Packing Specific
    netWeight?: number;
    grossWeight?: number;
    packagesCount?: number;

    // CO Specific
    chamberOfCommerce?: string;

    // BL Specific
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
    company?: string; // Company owning this record
    fileNumber: string; // شماره پرونده (داخلی)
    registrationNumber?: string; // شماره ثبت سفارش
    registrationDate?: string; // تاریخ صدور ثبت سفارش
    registrationExpiry?: string; // مهلت ثبت سفارش
    
    commodityGroup?: string; // گروه کالایی
    sellerName: string; // فروشنده
    mainCurrency?: string; // ارز پایه (USD, EUR, etc.)
    
    // Items
    items: TradeItem[];
    freightCost: number; // هزینه حمل
    exchangeRate?: number; // نرخ ارز محاسباتی
    operatingBank?: string; // بانک عامل

    // License/Proforma Costs - Now supports history
    licenseData?: {
        transactions: TradeTransaction[]; // List of payments (Renewal, registration, etc.)
        // Legacy fields
        registrationCost?: number;
        bankName?: string;
        paymentDate?: string;
    };

    // Insurance Details
    insuranceData?: {
        policyNumber: string;
        company: string;
        cost: number; // Initial cost
        bank: string;
        endorsements?: InsuranceEndorsement[]; // الحاقیه ها
    };
    
    // Inspection Details (New)
    inspectionData?: InspectionData;
    
    // Clearance Data (New)
    clearanceData?: ClearanceData;

    // Green Leaf Data (New)
    greenLeafData?: GreenLeafData;
    
    // Internal Shipping Data (New)
    internalShippingData?: InternalShippingData;

    // Agent / Clearance Fees Data (New)
    agentData?: AgentData;
    
    // Currency Purchase Details
    currencyPurchaseData?: CurrencyPurchaseData;

    // Shipping Documents (New)
    shippingDocuments?: ShippingDocument[];

    startDate: string; // ISO Date
    status: 'Active' | 'Completed' | 'Cancelled';
    
    // Finalization Flags
    isCommitmentFulfilled?: boolean; // رفع تعهد
    isArchived?: boolean; // بایگانی شده (ترخیص شده)

    stages: Record<string, TradeStageData>; // Map of Stage Enum to Data

    createdAt: number;
    createdBy: string;
    
    // Legacy support for migration
    goodsName?: string; 
    orderNumber?: string;
}
