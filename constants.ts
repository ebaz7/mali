
import { PaymentMethod, OrderStatus, PaymentOrder } from './types';

export const generateUUID = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const normalizeInputNumber = (str: string): string => {
  if (!str) return '';
  const persianDigits = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
  const arabicDigits = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  
  let result = str;
  for (let i = 0; i < 10; i++) {
    result = result.replace(persianDigits[i], i.toString()).replace(arabicDigits[i], i.toString());
  }
  return result;
};

export const formatNumberString = (value: string | number | undefined): string => {
  if (value === undefined || value === null || value === '') return '';
  const str = value.toString();
  const normalized = normalizeInputNumber(str).replace(/[^0-9]/g, '');
  if (!normalized) return '';
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export const deformatNumberString = (value: string): number => {
  const normalized = normalizeInputNumber(value).replace(/[^0-9]/g, '');
  return Number(normalized);
};

export const INITIAL_ORDERS: PaymentOrder[] = [];

export const getStatusLabel = (status: OrderStatus) => {
    switch (status) {
        case OrderStatus.PENDING: return 'در انتظار مالی';
        case OrderStatus.APPROVED_FINANCE: return 'تایید مالی';
        case OrderStatus.APPROVED_MANAGER: return 'تایید مدیریت';
        case OrderStatus.APPROVED_CEO: return 'تایید نهایی';
        case OrderStatus.REJECTED: return 'رد شده';
        default: return status;
    }
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('fa-IR').format(amount) + ' ریال';
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const jalaliToGregorian = (j_y: number, j_m: number, j_d: number): Date => {
  const jy = j_y - 979;
  const jm = j_m - 1;
  const jd = j_d - 1;

  let j_day_no = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor((jy % 33 + 3) / 4);
  for (let i = 0; i < jm; ++i) j_day_no += (i < 6) ? 31 : 30;
  j_day_no += jd;

  let g_day_no = j_day_no + 79;

  let gy = 1600 + 400 * Math.floor(g_day_no / 146097);
  g_day_no = g_day_no % 146097;

  let leap = true;
  if (g_day_no >= 36525) {
    g_day_no--;
    gy += 100 * Math.floor(g_day_no / 36524);
    g_day_no = g_day_no % 36524;

    if (g_day_no >= 365) g_day_no++;
    else leap = false;
  }

  gy += 4 * Math.floor(g_day_no / 1461);
  g_day_no %= 1461;

  if (g_day_no >= 366) {
    leap = false;
    g_day_no--;
    gy += Math.floor(g_day_no / 365);
    g_day_no = g_day_no % 365;
  }

  let i;
  for (i = 0; g_day_no >= ((i < 1) ? (31 + (leap ? 1 : 0)) : ((i === 1) ? 28 : ((i < 7) ? 31 : 30))); i++) {
    g_day_no -= ((i < 1) ? (31 + (leap ? 1 : 0)) : ((i === 1) ? 28 : ((i < 7) ? 31 : 30)));
  }
  
  const gm = i + 1;
  const gd = g_day_no + 1;

  return new Date(gy, gm - 1, gd);
};

export const parsePersianDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    const [y, m, d] = parts.map(Number);
    if (!y || !m || !d) return null;
    
    if (y < 1900) {
        return jalaliToGregorian(y, m, d);
    }
    return new Date(y, m - 1, d);
};

export const getCurrentShamsiDate = () => {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { calendar: 'persian', year: 'numeric', month: 'numeric', day: 'numeric' };
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', options).formatToParts(now);
  
  const y = parseInt(parts.find(p => p.type === 'year')?.value || '1403');
  const m = parseInt(parts.find(p => p.type === 'month')?.value || '1');
  const d = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  
  return { year: y, month: m, day: d };
};

export const getShamsiDateFromIso = (isoDate: string) => {
  const [yStr, mStr, dStr] = isoDate.split('-').map(Number);
  const date = new Date(yStr, mStr - 1, dStr);

  const options: Intl.DateTimeFormatOptions = { calendar: 'persian', year: 'numeric', month: 'numeric', day: 'numeric' };
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', options).formatToParts(date);
  
  const y = parseInt(parts.find(p => p.type === 'year')?.value || '1403');
  const m = parseInt(parts.find(p => p.type === 'month')?.value || '1');
  const d = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  
  return { year: y, month: m, day: d };
};
