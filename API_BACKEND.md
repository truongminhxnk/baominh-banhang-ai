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

App hiện dùng **luồng baominh**: QR có nội dung chuyển khoản **VT-{loginId}** (loginId = email thay `@` bằng `.`), backend webhook parse nội dung để lấy loginId và cập nhật user; app **polling GET /api/check_payment/:loginId** để tự động phản hồi thanh toán thành công.

### GET `/api/check_payment/:loginId` (luồng chính — giống baominh.ai.vn)
- `loginId` = email user, thay `@` bằng `.` (vd: `user.gmail.com`).
- Trả về: `{ found: boolean, user?: { expiryDate?: number (timestamp ms), planType?: string, premiumStartDate?: number, ... } }`.
- App gọi mỗi 5 giây khi user đang ở bước thanh toán. Khi `user.expiryDate` tăng (so với trước khi chọn gói) → coi là thanh toán thành công, hiển thị thông báo và cập nhật gói.

### POST `/api/sepay_webhook` (nội dung chuyển khoản có **VT-{loginId}**)
- Payload SePay có `content` / `description` chứa nội dung chuyển khoản. Backend cần parse **VT-{loginId}** hoặc **VT{loginId}** (regex: `VT-?([a-zA-Z0-9_.-]+)`).
- **Chuẩn hóa loginId từ nội dung chuyển khoản:** Ngân hàng/SePay có thể gửi nội dung **không có dấu chấm** (vd: `VTgtam6215gmailcom`). User đăng ký bằng email `gtam6215@gmail.com` → app poll với cả `gtam6215.gmail.com` và `gtam6215gmailcom`. Backend nên **chuẩn hóa** loginId nhận được (vd: `gtam6215gmailcom` → thử tìm user có email `gtam6215@gmail.com`, tức loginId `gtam6215.gmail.com`) hoặc lưu/tìm user theo **cả hai** dạng (có dấu chấm và không dấu chấm) để `GET /api/check_payment/:loginId` trả về đúng user dù app gửi loginId có hoặc không có dấu chấm.
- Xác định user theo `loginId` (khớp với email đã đăng ký, dạng email với `@` → `.`).
- Map số tiền (`transferAmount`) với gói (vd: **250000** → 1 tháng, **700000** → 3 tháng, **1350000** → 6 tháng, **2500000** → 1 năm), tính `expiryDate` mới, cập nhật user (và lưu payment log nếu cần). Trả về **200**.
- App không gọi tạo đơn; chỉ cần webhook cập nhật user và API `check_payment` trả về user mới.

### POST `/api/payment/order` (tùy chọn — luồng cũ theo orderId)
- Body: `{ userId, userEmail, planId, amount, description }`
- Trả về: `{ orderId: string, qrUrl?: string, amount: number, message?: string }`
- Dùng nếu backend muốn luồng theo đơn + `GET /api/payment/status?orderId=xxx`. App hiện ưu tiên luồng VT-{loginId} + check_payment.

### GET `/api/payment/status?orderId=xxx` (tùy chọn)
- Trả về: `{ status: 'pending' | 'paid' | 'failed' | 'expired', orderId?, paidAt?, startDate?, endDate?, message? }`
- Dùng khi backend triển khai luồng theo orderId.

## 4. Webhook SePay (backend tự implement)

**URL nhận phản hồi từ SePay.vn (cấu hình trên dashboard SePay):**

```
https://ai.baominh.io.vn/api/sepay_webhook
```

- Trên SePay.vn bạn cấu hình **Địa chỉ webhook / URL nhận thông báo** = `https://ai.baominh.io.vn/api/sepay_webhook`.
- SePay gửi **POST** tới URL này khi có giao dịch (chuyển khoản thành công, v.v.).
- Backend cần tạo route **POST /api/sepay_webhook**: xác thực chữ ký (dùng `SEPAY_WEBHOOK_API_KEY` hoặc cơ chế SePay cung cấp), đọc nội dung chuyển khoản để lấy `orderId` hoặc **VT-{loginId}**, cập nhật user/đơn và trả **200**.
- Nếu webhook trả 404/500, SePay coi như thất bại → **không có phản hồi tự động gia hạn** dù khách đã chuyển khoản thành công.

### Sửa lỗi 404: "Cannot POST /api/sepay_webhook" (không phản hồi tự động gia hạn)

**Triệu chứng:** SePay gọi `https://ai.baominh.io.vn/api/sepay_webhook` nhưng server trả **404** với nội dung `Cannot POST /api/sepay_webhook`. Thanh toán đã thành công nhưng app không tự động gia hạn vì backend không nhận được webhook.

**Nguyên nhân:** Domain **ai.baominh.io.vn** đang chỉ phục vụ **frontend tĩnh** (HTML/JS). Không có server xử lý **POST /api/sepay_webhook**, nên mọi request tới `/api/*` bị 404.

**Cách xử lý (chọn một):**

1. **Proxy /api từ ai.baominh.io.vn sang backend đã chạy (vd: tts.baominh.io.vn)**  
   Nếu bạn đã có backend webhook chạy tại **tts.baominh.io.vn** (trả 200 khi gọi `/api/sepay_webhook`), cấu hình **Nginx** trên server host **ai.baominh.io.vn** để chuyển tiếp `/api/*` tới đó:

   ```nginx
   server {
       server_name ai.baominh.io.vn;
       root /var/www/ai/dist;
       index index.html;
       location / {
           try_files $uri $uri/ /index.html;
       }
       location /api/ {
           proxy_pass https://tts.baominh.io.vn;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   Sau khi reload Nginx, SePay gọi `https://ai.baominh.io.vn/api/sepay_webhook` sẽ được proxy tới **tts.baominh.io.vn** → backend xử lý → trả 200.  
   **Quan trọng:** Trong app (`.env.production`), đặt `VITE_API_URL=https://ai.baominh.io.vn/api` (hoặc `https://tts.baominh.io.vn/api` nếu app gọi thẳng tts) để `check_payment` và các API khác dùng cùng backend.

2. **Đổi URL webhook trên SePay sang thẳng backend**  
   Trên dashboard SePay.vn, đặt **Địa chỉ webhook** = URL backend đã có route webhook, ví dụ:  
   `https://tts.baominh.io.vn/api/sepay_webhook`  
   Khi đó không cần proxy trên ai.baominh.io.vn. Đảm bảo `VITE_API_URL` trong app trỏ tới cùng backend (vd: `https://tts.baominh.io.vn/api`) để `GET /api/check_payment/:loginId` hoạt động.

### Sửa: Webhook trả 200 nhưng "Unknown amount, ignore" (không gia hạn)

**Triệu chứng:** SePay gọi webhook → server trả **200** với body `{"ok":true,"message":"Unknown amount, ignore"}`. Thanh toán đã thành công nhưng backend **bỏ qua** giao dịch vì không nhận diện số tiền.

**Nguyên nhân:** Backend (vd: tts.baominh.io.vn) map số tiền → gói qua bảng cấu hình (vd: `PLAN_CONFIG`). App Bảo Minh AI dùng các mức: **250000** (1 tháng), **700000** (3 tháng), **1350000** (6 tháng), **2500000** (1 năm). Nếu backend chỉ có 150000, 450000, 900000, 1800000 thì `transferAmount: 250000` sẽ bị coi là "Unknown amount" và bỏ qua.

**Cách xử lý:** Trên backend (server xử lý webhook tại tts.baominh.io.vn hoặc ai.baominh.io.vn), bổ sung mapping đúng với giá gói của app:

| transferAmount (VND) | Gói   | Tháng |
|---------------------|-------|-------|
| 250000              | 1 tháng | 1     |
| 700000              | 3 tháng | 3     |
| 1350000             | 6 tháng | 6     |
| 2500000             | 1 năm   | 12    |

Ví dụ (Node/Express): `const PLAN_CONFIG = { 250000: { planType: '1m', months: 1 }, 700000: { planType: '3m', months: 3 }, 1350000: { planType: '6m', months: 6 }, 2500000: { planType: '1y', months: 12 } };`  
Sau khi thêm, webhook sẽ cập nhật user (expiryDate, planType) và trả 200; app polling `check_payment` sẽ nhận và hiển thị gia hạn thành công.

### Phản hồi thanh toán không hiện (app poll nhưng không báo thành công)

- **1) loginId không khớp:** Nội dung chuyển khoản từ ngân hàng có thể là `VTgtam6215gmailcom` (không dấu chấm). Backend lưu/tìm user theo loginId đó; app gửi `check_payment(gtam6215.gmail.com)` → không trùng. **App đã sửa:** khi poll gọi `check_payment` với **cả hai** loginId (có dấu chấm và không dấu chấm). **Backend nên:** chuẩn hóa loginId từ nội dung (vd. `gmailcom` → `.gmail.com`) hoặc khi `check_payment/:loginId` nhận cả hai dạng và trả về cùng user.
- **2) VITE_API_URL trỏ sai:** Nếu `VITE_API_URL=https://ai.baominh.io.vn/api` mà domain đó không có backend (chỉ frontend tĩnh), `GET /api/check_payment/:loginId` sẽ 404 → app không nhận được dữ liệu. Cấu hình proxy `/api` sang backend (xem mục 404 webhook) hoặc đặt `VITE_API_URL` trỏ thẳng tới backend (vd. `https://tts.baominh.io.vn/api`).
- **3) Webhook bỏ qua giao dịch:** "Unknown amount" → backend không cập nhật user → dù poll đúng loginId cũng không thấy `expiryDate` đổi. Bổ sung map 250000, 700000, 1350000, 2500000 như bảng trên.

### Sửa lỗi 500: "operator does not exist: json ~~ text" (PostgreSQL)

Nếu webhook trả về 500 với thông báo kiểu:
`operator does not exist: json ~~ text ... WHERE (payment.bank_info LIKE '%' || ...::JSON || '%')`

**Nguyên nhân:** Cột `payment.bank_info` kiểu `JSON`/`JSONB` không dùng được toán tử `LIKE` (~~) trực tiếp với chuỗi.

**Cách sửa (backend Python/SQLAlchemy):**

1. **Tìm đơn theo `sepay_id` trong payload (vd `id: 42237671`):**  
   Không dùng `Payment.bank_info.like('%...%')`. Dùng một trong hai:

   - **Cách 1 – cast sang text rồi LIKE (phù hợp nếu `bank_info` là JSON):**
     ```python
     from sqlalchemy import cast, String
     # Tìm bản ghi có bank_info chứa sepay_id (vd "42237671")
     sepay_id = str(payload.get("id"))  # 42237671
     q = session.query(Payment).filter(
         cast(Payment.bank_info, String).like(f"%{sepay_id}%")
     )
     ```
   - **Cách 2 – dùng JSONB và toán tử chứa (nếu cột là JSONB):**
     ```python
     # Nếu bank_info là JSONB và lưu dạng {"sepay_id": "42237671"}
     q = session.query(Payment).filter(
         Payment.bank_info["sepay_id"].astext == sepay_id
     )
     ```

2. **Ghép nội dung chuyển khoản với đơn:**  
   Payload SePay gửi có `content` (vd `"BAOMINH gtam6215 1m FT26044178920260 ..."`). App Bảo Minh tạo đơn với `description` kiểu `BAOMINH {userId} {planId}`. Backend nên:
   - Lấy `orderId` từ bảng đơn (order/payment) đã tạo khi user bấm thanh toán (không nên tìm đơn bằng cách `bank_info LIKE '%...json...%'`).
   - Hoặc parse `content`: tìm chuỗi có pattern `BAOMINH ... 1m` hoặc `orderId` đã lưu khi tạo đơn, rồi cập nhật đúng bản ghi đó thành `status: 'paid'`, `startDate`, `endDate`.

3. **Khuyến nghị:** Khi tạo đơn (POST /api/payment/order), backend trả về `orderId` và lưu đơn với `orderId` duy nhất. Khi webhook SePay gọi tới, đối chiếu bằng `content` (có chứa mã đơn / mã giao dịch) hoặc lưu thêm `sepay_id` vào cột text/JSON và tìm theo `sepay_id` bằng cast text như trên, sau đó cập nhật đúng một đơn thành đã thanh toán và trả về 200. Khi đó app polling `GET /api/payment/status?orderId=...` sẽ nhận `status: 'paid'` và tự động hiển thị thành công.

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
