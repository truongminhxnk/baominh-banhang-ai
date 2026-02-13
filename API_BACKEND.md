# API Backend cho Bảo Minh AI (VPS)

App gọi các endpoint sau khi đã cấu hình `VITE_API_URL` trong `.env.local`.

## 1. Đồng bộ dữ liệu cửa hàng

### GET `/api/store`
- Query: `?userId=email@user.com` (bắt buộc khi đa tài khoản)
- Trả về JSON: `{ storeName?, storeWebsite?, storeHotline?, storeAddress?, storeDocs?, inventory?, customers?, preOrders?, stockLogs?, keyPool?, language?, userProfile? }`
- **userProfile** (tùy chọn): `{ isPremium?, expiryDate?, premiumStartDate?, trialStartDate? }` — dùng để đồng bộ gói đăng ký (Premium/Trial) theo tài khoản. App sẽ merge vào state user khi load.
- Mỗi tài khoản (userId = email) có dữ liệu riêng; backend lưu theo userId.

### POST `/api/store`
- Body JSON: `StorePayload` (storeName, storeWebsite, storeHotline, storeAddress, storeDocs, inventory, customers, preOrders, stockLogs, keyPool, language, userId)
- Lưu/ghi đè dữ liệu cửa hàng theo `userId` (email). Mỗi tài khoản một bộ dữ liệu riêng.

## 2. Thanh toán SePay

### POST `/api/payment/order`
- Body: `{ userId, userEmail, planId, amount, description }`
- Trả về: `{ orderId: string, qrUrl?: string, amount: number, message?: string }`
- Backend tạo đơn, lưu `orderId`, trả về cho app. Khi SePay gửi webhook xác nhận thanh toán, backend cập nhật trạng thái đơn.

### GET `/api/payment/status?orderId=xxx`
- Trả về: `{ status: 'pending' | 'paid' | 'failed' | 'expired', orderId?, paidAt?, startDate?, endDate?, message? }`
- `startDate` / `endDate`: timestamp (ms) gói premium có hiệu lực. App dùng để hiển thị ngày bắt đầu / kết thúc và cập nhật user.

## 3. Webhook SePay (backend tự implement)

**URL nhận phản hồi từ SePay.vn (cấu hình trên dashboard SePay):**

```
https://ai.baominh.io.vn/api/sepay_webhook
```

- Trên SePay.vn bạn cấu hình **Địa chỉ webhook / URL nhận thông báo** = `https://ai.baominh.io.vn/api/sepay_webhook`.
- SePay gửi **POST** tới URL này khi có giao dịch (chuyển khoản thành công, v.v.).
- Backend cần tạo route **POST /api/sepay_webhook**: xác thực chữ ký (dùng `SEPAY_WEBHOOK_API_KEY` hoặc cơ chế SePay cung cấp), đọc nội dung chuyển khoản để lấy `orderId`, cập nhật đơn tương ứng `status: 'paid'`, `startDate`, `endDate`.
- App polling `GET /api/payment/status?orderId=...` sẽ nhận được `status: 'paid'` và hiển thị thông báo thành công + ngày bắt đầu/kết thúc.

## 4. Giới hạn 1 thiết bị (tài khoản Premium)

Tài khoản Premium chỉ được đăng nhập trên **một thiết bị** tại một thời điểm. Khi user đăng nhập trên thiết bị thứ 2, thiết bị cũ sẽ bị đăng xuất (sau tối đa ~45 giây khi app kiểm tra phiên).

### POST `/api/auth/device`
- Body: `{ userId: string, deviceId: string }` (userId = email, deviceId do app tạo và lưu trong localStorage cho mỗi trình duyệt/máy).
- Backend lưu hoặc cập nhật: `userId -> deviceId` (chỉ giữ **một** deviceId mới nhất cho mỗi userId).
- Nếu **trước đó** đã có một deviceId khác (thiết bị cũ) được lưu cho userId này → trả về `{ ok: true, previousDeviceRevoked: true }` để app hiển thị: "Bạn đã đăng nhập trên thiết bị mới. Thiết bị cũ đã bị đăng xuất."
- Nếu cùng deviceId hoặc lần đầu → trả về `{ ok: true }`.

### GET `/api/auth/session`
- Query: `?userId=xxx&deviceId=yyy`
- Backend so sánh: deviceId hiện tại của userId (đã lưu từ POST /api/auth/device) với `yyy`.
- Nếu **khớp** → trả về `{ valid: true }`.
- Nếu **không khớp** (thiết bị khác đã đăng nhập) → trả về `{ valid: false, reason?: string }`. App sẽ đăng xuất ngay và hiển thị: "Tài khoản đã đăng nhập trên thiết bị khác. Bạn đã bị đăng xuất."

**Luồng:** App (Premium + có VITE_API_URL) khi load/đăng nhập gọi POST /api/auth/device; sau đó mỗi 45 giây gọi GET /api/auth/session. Nếu `valid: false` → đăng xuất và hiện modal cảnh báo.
