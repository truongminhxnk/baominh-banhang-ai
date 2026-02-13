/**
 * API client: đồng bộ dữ liệu cửa hàng lên VPS và kiểm tra thanh toán SePay.
 * Cấu hình: VITE_API_URL trong .env.local (vd: https://your-vps.com/api)
 */

const getBaseUrl = (): string => {
  const url = (import.meta as any).env?.VITE_API_URL as string | undefined;
  return url ? url.replace(/\/$/, '') : '';
};

export interface UserProfilePayload {
  isPremium?: boolean;
  expiryDate?: number;
  premiumStartDate?: number;
  trialStartDate?: number;
}

export interface StorePayload {
  storeName?: string;
  storeWebsite?: string;
  storeHotline?: string;
  storeAddress?: string;
  storeDocs?: string;
  inventory?: any[];
  customers?: any[];
  preOrders?: any[];
  stockLogs?: any[];
  keyPool?: string[];
  language?: string;
  userId?: string; // email hoặc id user đã đăng nhập
  /** Thông tin gói đăng ký từ server (để đồng bộ isPremium, expiryDate...) */
  userProfile?: UserProfilePayload;
}

export interface PaymentOrderRequest {
  userId: string;
  userEmail: string;
  planId: string;
  amount: number;
  description: string;
}

export interface PaymentOrderResponse {
  orderId: string;
  qrUrl?: string;
  amount: number;
  message?: string;
}

export interface PaymentStatusResponse {
  status: 'pending' | 'paid' | 'failed' | 'expired';
  orderId?: string;
  paidAt?: string; // ISO date
  startDate?: number; // timestamp
  endDate?: number;   // timestamp
  message?: string;
}

/** GET /api/store - Lấy dữ liệu cửa hàng từ server (theo userId nếu có) */
export async function loadStoreData(userId?: string): Promise<StorePayload | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const url = userId ? `${base}/store?userId=${encodeURIComponent(userId)}` : `${base}/store`;
    const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return data as StorePayload;
  } catch {
    return null;
  }
}

/** POST/PUT /api/store - Lưu dữ liệu cửa hàng lên server */
export async function saveStoreData(payload: StorePayload): Promise<boolean> {
  const base = getBaseUrl();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** POST /api/payment/order - Tạo đơn thanh toán (server trả orderId để SePay webhook gửi về) */
export async function createPaymentOrder(req: PaymentOrderRequest): Promise<PaymentOrderResponse | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/payment/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** GET /api/payment/status?orderId=xxx - Kiểm tra trạng thái thanh toán (sau khi SePay webhook cập nhật) */
export async function checkPaymentStatus(orderId: string): Promise<PaymentStatusResponse | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/payment/status?orderId=${encodeURIComponent(orderId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function isApiConfigured(): boolean {
  return !!getBaseUrl();
}

// --- Giới hạn 1 thiết bị cho tài khoản Premium ---

export interface RegisterDeviceResponse {
  ok: boolean;
  previousDeviceRevoked?: boolean;
  message?: string;
}

export interface SessionCheckResponse {
  valid: boolean;
  reason?: string;
}

/** POST /api/auth/device — Đăng ký thiết bị hiện tại. Server lưu userId -> deviceId. Nếu đã có thiết bị khác thì trả previousDeviceRevoked: true. */
export async function registerDevice(userId: string, deviceId: string): Promise<RegisterDeviceResponse | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/auth/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, deviceId }),
    });
    if (!res.ok) return null;
    return (await res.json()) as RegisterDeviceResponse;
  } catch {
    return null;
  }
}

/** GET /api/auth/session?userId=xxx&deviceId=yyy — Kiểm tra phiên. Nếu thiết bị khác đã đăng nhập thì valid: false. */
export async function checkSession(userId: string, deviceId: string): Promise<SessionCheckResponse | null> {
  const base = getBaseUrl();
  if (!base) return null;
  try {
    const url = `${base}/auth/session?userId=${encodeURIComponent(userId)}&deviceId=${encodeURIComponent(deviceId)}`;
    const res = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return { valid: false, reason: 'session_check_failed' };
    return (await res.json()) as SessionCheckResponse;
  } catch {
    return null;
  }
}

const DEVICE_ID_KEY = 'bm_device_id';

/** Lấy hoặc tạo deviceId cố định cho trình duyệt/máy này (không phụ thuộc user). */
export function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 11)}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
