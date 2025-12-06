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
    cost: number;
}

export interface InspectionData {
    company: string;
    cost: number;
    result: string;
    date: string;
}

export interface ClearanceData {
    customsName: string; // نام گمرک
    declarationNumber: string; // شماره کوتاژ
    greenPath: boolean;
    cost: number; // هزینه ترخیص
    date: string;
}

export interface GreenLeafData {
    number: string;
    date: string;
    fileUrl?: string;
}

export interface InternalShippingData {
    driverName: string;
    plateNumber: string;
    cost: number;
    destination: string;
    arrivalDate?: string;
}

export interface AgentData {
    name: string;
    phone: string;
    cost: number;
}

export interface CurrencyPurchaseData {
    amount: number;
    rate: number;
    date: string;
    exchangeName: string; // نام صرافی
}

export interface ShippingDocument {
    id: string;
    title: string;
    fileUrl: string;
    type: 'BL' | 'Invoice' | 'PackingList' | 'CertificateOrigin' | 'Other';
}

export interface TradeStageData {
    isCompleted: boolean;
    completedAt?: number;
    completedBy?: string;
    notes?: string;
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
    currencyAllocationType?: string; // نوع ارز (منشا: مبادله ای، صادرات، ...)

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