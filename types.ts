
export interface AudioConfig {
  sampleRate: number;
  numChannels: number;
}

export enum SessionStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface Transcription {
  text: string;
  isUser: boolean;
  timestamp: number;
}

export interface Product {
  id: string;
  barcode?: string; // Mã vạch/QR
  name: string;
  price: number;
  quantity: number;
  unit: string;
  category: string;
}

export interface CartItem extends Product {
  cartQty: number;
}

export interface Invoice {
  id: string;
  date: string;
  items: CartItem[];
  subtotal: number; // Thành tiền trước thuế
  tax: number;      // Tiền thuế
  total: number;    // Tổng cộng thanh toán
  customerName?: string;
  customerPhone?: string; // SĐT khách
  customerAddress?: string; // Địa chỉ khách
  customerId?: string; // Link tới khách hàng
  type: 'EXPORT' | 'IMPORT'; // Phân biệt Bán ra hay Nhập vào
  isWholesale?: boolean; // Cờ đánh dấu đơn sỉ
}

export interface StockLog {
  id: string;
  date: string;
  productName: string;
  change: number; // Số lượng thay đổi (+ nhập, - xuất)
  reason: string; // Lý do (Nhập tay, Bán hàng, AI Import...)
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string; // Thêm trường địa chỉ
  totalSpent: number;
  lastVisit: string;
  notes?: string;
}

export interface PreOrder {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  productRequest: string;
  quantity: number;
  date: string;
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED';
  notes?: string;
}

export interface UserProfile {
  email: string;
  name: string;
  trialStartDate: number;
  isPremium: boolean;
  expiryDate?: number;
  premiumStartDate?: number; // Ngày bắt đầu gói premium (để hiển thị trên banner)
}

export interface PricingPlan {
  id: string;
  name: string;
  durationMonths: number;
  price: number;
  originalPrice?: number;
  description: string;
}
