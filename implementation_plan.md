# Kế hoạch sửa lỗi dự án (ttcsn) dựa trên tài liệu Test Case Nhóm 8

Tài liệu này chi tiết kế hoạch khắc phục tất cả các lỗi được phát hiện trong 4 trang của tệp `Testcase.Nhóm8.xlsx` nhằm đảm bảo hệ thống đạt độ bảo mật cao, hoạt động ổn định và chính xác theo logic nghiệp vụ.

---

## User Review Required

> [!IMPORTANT]
> **Hệ thống Xác thực & Phân quyền (Authentication & Authorization):**
> 1. Sử dụng cơ chế token JWT (được ký bằng thuật toán HMAC-SHA256 thông qua thư viện `crypto` tích hợp sẵn của Node.js để không cần cài thêm dependencies) nhằm xác thực người dùng và phân quyền Admin/Khách hàng.
> 2. Các yêu cầu AJAX/fetch từ client sẽ tự động chèn token này vào Header `Authorization: Bearer <token>` thông qua một fetch interceptor chung được nhúng tại đầu các mã nguồn JavaScript phía giao diện (frontend).
> 3. Kiểm soát phân quyền phía Backend cho từng API: chặn truy cập trái phép và ngăn chặn hoàn toàn lỗi IDOR (Broken Access Control) bằng cách đối chiếu ID khách hàng trong token với tham số URL hoặc thân request (body).

---

## Open Questions

Không có câu hỏi mở nào cần giải đáp. Mọi lỗi nghiệp vụ và bảo mật đều đã được chỉ rõ trong các test case.

---

## Proposed Changes

Chúng ta sẽ sửa đổi các thành phần sau để khắc phục triệt để các lỗi:

### [1] Backend Server

#### [MODIFY] [server.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/server.js)

1. **Bổ sung Tiện ích Token JWT (sử dụng thư viện `crypto` mặc định):**
   - Xây dựng hàm `generateToken(payload)` và `verifyToken(token)` để tạo và kiểm tra tính hợp lệ của token.
   - Payload chứa thông tin: `id` (idKH hoặc idQTV), `sdt`, `role` ("admin" hoặc "customer").

2. **Xây dựng Middleware Xác thực:**
   - `authenticateToken`: Đọc token từ header `Authorization: Bearer <token>`. Nếu hợp lệ, gán `req.user = payload` và tiếp tục. Nếu không, trả về `401 Unauthorized`.
   - `requireAdmin`: Kiểm tra `req.user.role === 'admin'`. Nếu không phải, trả về `403 Forbidden`.

3. **Cấu hình Headers Bảo mật & CORS:**
   - Cài đặt các header bảo mật:
     - `Content-Security-Policy`
     - `X-Content-Type-Options: nosniff`
     - `X-Frame-Options: DENY`
     - `Referrer-Policy: no-referrer-when-downgrade`
   - Cấu hình CORS chặt chẽ: Không cho phép wildcard `*` đi kèm với thông tin nhạy cảm.

4. **Ngăn chặn Brute Force tại API `/login`:**
   - Sử dụng một bộ đệm lưu trữ bộ nhớ (in-memory rate limiter) ghi nhận số lần đăng nhập sai theo địa chỉ IP hoặc số điện thoại. 
   - Nếu sai quá 5 lần trong vòng 1 phút, chặn tạm thời trong 1 phút (trả về lỗi `429 Too Many Requests`).

5. **Ngăn chặn SQL Injection tại các tham số ID:**
   - Thực hiện kiểm tra định dạng số nguyên (`parseInt`) cho mọi tham số ID nhận từ URL (như `idKH`, `idLichKham`, `idLS`, `idKhoa`, `idBacSi`, `idHoSoYTe`). Trả về `400 Bad Request` nếu không phải số hợp lệ.

6. **Ngăn chặn Stored XSS:**
   - Tạo hàm `escapeHtml(text)` để mã hóa các ký tự đặc biệt (`<`, `>`, `&`, `"`, `'`) thành HTML entities.
   - Áp dụng hàm này cho toàn bộ các trường chuỗi nhận từ người dùng trước khi lưu vào cơ sở dữ liệu (các trường như: họ tên, địa chỉ, lý do khám, tên khoa, tên bác sĩ, kết luận khám, chi tiết bệnh án).

7. **Khắc phục lỗi logic Đặt lịch khám (`/api/dat-lich` và `/api/admin/lichkham`):**
   - Ràng buộc IDOR: Tự động gán `idKH = req.user.id` từ token đối với người dùng đặt lịch (không cho client gửi tùy ý `idKH`).
   - Ràng buộc tồn tại: Kiểm tra sự tồn tại của `idBacSi` trong bảng `BACSI` và `idKH` trong bảng `KHACHHANG`.
   - Kiểm tra trùng lịch: Kiểm tra xem bác sĩ đã có lịch khám vào ngày và giờ được chọn hay chưa (nếu có lịch trùng và trạng thái lịch đó không phải "đã hủy" thì từ chối).
   - Kiểm tra ngày trong quá khứ: Không cho phép đặt lịch khám có ngày nhỏ hơn ngày hiện tại.
   - Kiểm tra quan hệ bác sĩ - khoa: Đảm bảo `idBacSi` thuộc về `idKhoa` đã chọn.

8. **Kiểm tra quyền sở hữu đối với các API cá nhân của Khách hàng:**
   - Đối với các API: `/api/khachhang/:idKH` (GET, PUT), `/hosoyte/:idKH` (GET), `/api/lich-user/:idKH` (GET), `/api/khachhang/:idKH/changepassword` (PUT):
     - Xác thực token phải khớp: `req.user.id === parseInt(idKH)` OR `req.user.role === 'admin'`.
   - Đối với API hủy lịch `/api/huy-lich` (POST):
     - Truy vấn lịch khám từ CSDL, kiểm tra xem lịch khám đó có thuộc về `req.user.id` hay không (nếu là khách hàng). Nếu không trùng khớp, trả về `403 Forbidden`.

9. **Áp dụng xác thực cho các API của Admin:**
   - Yêu cầu middleware `requireAdmin` đối với các API:
     - `GET /api/taikhoan`
     - `DELETE /api/taikhoan/:idKH`
     - `POST /api/admin/bacsi`, `PUT /api/admin/bacsi/:id`, `DELETE /api/admin/bacsi/:id`
     - `POST /api/khoa`, `PUT /api/khoa/:id`, `DELETE /api/khoa/:id` (áp dụng xác thực admin đầy đủ)
     - `POST /api/admin/lichsu`, `PUT /api/admin/lichsu/:id`, `DELETE /api/admin/lichsu/:id`
     - `GET /api/admin/lichkham`, `POST /api/admin/lichkham`, `PUT /api/admin/lichkham/:id`, `DELETE /api/admin/lichkham/:id`
     - `GET /api/admin/hosoyte`, `POST /api/admin/hosoyte`, `GET /api/admin/hosoyte/:id`, `DELETE /api/admin/hosoyte/:id`
     - `GET /api/dashboard`, `GET /api/hoatdong`
   - Cập nhật định dạng phản hồi khi xóa khoa từ `needConfirm` thành `requireConfirm` để đồng bộ với test case.

---

### [2] Giao diện (Frontend) - Tự động đính kèm Token xác thực

Chúng ta sẽ chèn một fetch interceptor chung vào đầu các tệp Javascript dưới đây để tự động lấy token từ `localStorage` và gửi lên qua header `Authorization`.

#### [MODIFY] [script1.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Khách%20hàng/trangchupre/script1.js)
- Lưu `token` vào `localStorage` khi đăng nhập thành công.

#### [MODIFY] [account.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Khách%20hàng/trangchu/account.js)
#### [MODIFY] [trangchu1.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Khách%20hàng/trangchu/trangchu1.js)
#### [MODIFY] [lichUser1.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Khách%20hàng/datlichkham/lichUser1.js)
#### [MODIFY] [order1.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Khách%20hàng/datlichkham/order1.js)
#### [MODIFY] [hosoyte.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Khách%20hàng/hosoyte/hosoyte.js)
#### [MODIFY] [admin-dashboard.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Quản%20trị%20viên/admin-dashboard.js)
#### [MODIFY] [admin-doctors.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Quản%20trị%20viên/admin-doctors.js)
#### [MODIFY] [admin-hosoyte.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Quản%20trị%20viên/admin-hosoyte.js)
#### [MODIFY] [admin-khoa.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Quản%20trị%20viên/admin-khoa.js)
#### [MODIFY] [admin-lichkham.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Quản%20trị%20viên/admin-lichkham.js)
#### [MODIFY] [admin-lskhambenh.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Quản%20trị%20viên/admin-lskhambenh.js)
#### [MODIFY] [admin-tkhoan.js](file:///d:/Dai_Hoc/Nam_4/Kiem_Thu_Pham_Mem/cosonganh_final/cosonganh_final/Quản%20trị%20viên/admin-tkhoan.js)

- Nhúng đoạn interceptor đầu file JS:
  ```javascript
  (function() {
      const originalFetch = window.fetch;
      window.fetch = function(url, options = {}) {
          const token = localStorage.getItem("token");
          if (token) {
              options.headers = options.headers || {};
              if (options.headers instanceof Headers) {
                  options.headers.set("Authorization", "Bearer " + token);
              } else {
                  options.headers["Authorization"] = "Bearer " + token;
              }
          }
          return originalFetch(url, options);
      };
  })();
  ```

---

## Verification Plan

### Automated Tests
Chúng ta sẽ chuẩn bị một kịch bản kiểm thử API tự động bằng Node.js / Postman (lưu tại `scratch/verify_api.js`) mô phỏng các hành vi tấn công bảo mật và kiểm tra logic nghiệp vụ:
1. Đăng ký & Đăng nhập (Kiểm tra chặn Brute force mật khẩu, mật khẩu yếu).
2. Tấn công IDOR: Thử dùng token của khách hàng A để gọi API truy cập dữ liệu của khách hàng B (mong đợi 403).
3. Thiếu phân quyền: Thử dùng token khách hàng thường để gọi API Admin (mong đợi 403).
4. SQL Injection: Gửi các chuỗi ký tự tấn công SQLi qua tham số URL và body (mong đợi xử lý an toàn không lỗi DB).
5. Stored XSS: Gửi các chuỗi script HTML (mong đợi được encode thực thể HTML an toàn).
6. Nghiệp vụ: Đặt trùng lịch cùng bác sĩ/khung giờ, đặt lịch ngày quá khứ, đặt lịch bác sĩ sai khoa (mong đợi 400).

### Manual Verification
1. Khởi chạy máy chủ Node.js (`npm run dev` hoặc `nodemon server.js`).
2. Mở trình duyệt, đăng nhập bằng các tài khoản kiểm thử để xác nhận các trang khách hàng và trang quản trị hoạt động bình thường, ghi nhận hoạt động log đầy đủ.
