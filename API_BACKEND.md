# API Backend cho Bảo Minh AI (VPS)

App gọi các endpoint sau khi đã cấu hình `VITE_API_URL` trong `.env.local`. Người dùng đăng nhập bằng **form Google** (OAuth); app gửi thông tin user lên VPS để **tạo danh sách người dùng**, phục vụ **gia hạn** và **quản lý** (admin có thể xem danh sách, cập nhật gói Premium, v.v.).

## 1. Đăng ký / danh sách người dùng (quản lý & gia hạn đơn giản)

Khi người dùng đăng nhập Google thành công, app gọi **POST /api/users/register** để đăng ký hoặc cập nhật user trên VPS. Quy tắc đơn giản:

- **Tài khoản dùng thử (chưa gia hạn):** Trial 14 ngày. Sau 14 ngày nếu không gia hạn → backend có thể **xóa dữ liệu user sau 3 tháng** (dọn dẹp). Khi user muốn dùng lại, chỉ cần **đăng nhập lại** → app vẫn cho vào, nhưng hiển thị yêu cầu **gia hạn** (trial đã hết / cần nâng cấp).
- **Tài khoản đã gia hạn (Premium):** Lưu trữ và **hiển thị ngày bắt đầu & ngày hết hạn** trên giao diện cho khách; dùng cho **chăm sóc khách hàng** và nhắc gia hạn.

### POST `/api/users/register`
- Body JSON: `{ email: string, name: string, trialStartDate?: number }` (trialStartDate = timestamp ms, lần đăng nhập đầu).
- Backend: tạo mới user nếu chưa có; nếu đã có thì cập nhật (name, lastLoginAt…), **không** ghi đè trialStartDate.
- Trả về: `{ ok: boolean, userProfile?: { isPremium?, expiryDate?, premiumStartDate?, trialStartDate? }, message?: string }`. App dùng `userProfile` để merge vào state và **hiển thị ngày bắt đầu / hết hạn** (Premium) trên UI.
- **Gợi ý backend:** Bảng `users`: `email` (PK), `name`, `trial_start_date`, `is_premium`, `premium_start_date`, `expiry_date`, `created_at`, `updated_at`. Trial không gia hạn: sau 14 ngày đánh dấu hết trial; sau 3 tháng có thể xóa bản ghi (hoặc ẩn). Premium: luôn lưu, hiển thị ngày bắt đầu & hết hạn cho khách và chăm sóc khách hàng.

### (Tùy chọn) GET `/api/users` hoặc `/api/admin/users`
- Admin: danh sách user để gia hạn (cập nhật expiry_date, is_premium) và chăm sóc khách hàng.

## 2. Đồng bộ dữ liệu cửa hàng

### GET `/api/store`
- Query: `?userId=email@user.com` (bắt buộc khi đa tài khoản)
- Trả về JSON: `{ storeName?, storeWebsite?, storeHotline?, storeAddress?, storeDocs?, inventory?, customers?, preOrders?, stockLogs?, keyPool?, language?, userProfile? }`
- **userProfile** (tùy chọn): `{ isPremium?, expiryDate?, premiumStartDate?, trialStartDate? }` — dùng để đồng bộ gói đăng ký (Premium/Trial) theo tài khoản. App sẽ merge vào state user khi load.
- Mỗi tài khoản (userId = email) có dữ liệu riêng; backend lưu theo userId.

### POST `/api/store`
- Body JSON: `StorePayload` (storeName, storeWebsite, storeHotline, storeAddress, storeDocs, inventory, customers, preOrders, stockLogs, keyPool, language, userId)
- Lưu/ghi đè dữ liệu cửa hàng theo `userId` (email). Mỗi tài khoản một bộ dữ liệu riêng.

## 3. Thanh toán SePay

### POST `/api/payment/order`
- Body: `{ userId, userEmail, planId, amount, description }`
- Trả về: `{ orderId: string, qrUrl?: string, amount: number, message?: string }`
- Backend tạo đơn, lưu `orderId`, trả về cho app. Khi SePay gửi webhook xác nhận thanh toán, backend cập nhật trạng thái đơn.

### GET `/api/payment/status?orderId=xxx`
- Trả về: `{ status: 'pending' | 'paid' | 'failed' | 'expired', orderId?, paidAt?, startDate?, endDate?, message? }`
- `startDate` / `endDate`: timestamp (ms) gói premium có hiệu lực. App dùng để hiển thị ngày bắt đầu / kết thúc và cập nhật user.

## 4. Webhook SePay (backend tự implement)

**URL nhận phản hồi từ SePay.vn (cấu hình trên dashboard SePay):**

```
https://ai.baominh.io.vn/api/sepay_webhook
```

- Trên SePay.vn bạn cấu hình **Địa chỉ webhook / URL nhận thông báo** = `https://ai.baominh.io.vn/api/sepay_webhook`.
- SePay gửi **POST** tới URL này khi có giao dịch (chuyển khoản thành công, v.v.).
- Backend cần tạo route **POST /api/sepay_webhook**: xác thực chữ ký (dùng `SEPAY_WEBHOOK_API_KEY` hoặc cơ chế SePay cung cấp), đọc nội dung chuyển khoản để lấy `orderId`, cập nhật đơn tương ứng `status: 'paid'`, `startDate`, `endDate`.
- App polling `GET /api/payment/status?orderId=...` sẽ nhận được `status: 'paid'` và hiển thị thông báo thành công + ngày bắt đầu/kết thúc.

## 5. Giới hạn 1 thiết bị (tài khoản Premium)

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
