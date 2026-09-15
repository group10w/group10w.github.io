# 3.5.1. Thiết kế Test Case kiểm thử bảo mật bằng Burp Suite

## Phạm vi áp dụng cho project

Tài liệu này áp dụng cho project **Hệ thống quản lý y tế - đặt lịch khám bệnh trực tuyến** trong thư mục `cosonganh_final`. Phạm vi kiểm thử tập trung vào backend Node.js/Express chạy tại:

```text
http://localhost:3000
```

Các module được kiểm thử:

- Đăng ký, đăng nhập: `POST /register`, `POST /login`
- Khách hàng: `GET/PUT /api/khachhang/:idKH`, `PUT /api/khachhang/:idKH/changepassword`
- Đặt lịch, xem lịch, hủy lịch: `POST /api/dat-lich`, `GET /api/lich-user/:idKH`, `POST /api/huy-lich`
- Hồ sơ y tế khách hàng: `GET /hosoyte/:idKH`
- Quản trị viên: `/api/admin/bacsi`, `/api/admin/lichkham`, `/api/admin/hosoyte`, `/api/admin/lichsu`, `/api/taikhoan`, `/api/khoa`, `/api/dashboard`, `/api/hoatdong`

Không kiểm thử API chatbot theo yêu cầu.

> [!NOTE]
> **Đặc thù kiến trúc bảo mật của Project:**
> Hệ thống hiện tại lưu trữ trạng thái đăng nhập ở client qua `localStorage` (`userId` và `isAdmin`) và gửi định danh trực tiếp qua Request Body/URL (không sử dụng Cookie để quản lý Session). Do đó, các cuộc tấn công CSRF truyền thống dựa trên Cookie tự động đính kèm sẽ không khả thi. 
> Tuy nhiên, do backend hoàn toàn **thiếu cơ chế kiểm tra token xác thực (JWT/Session)** trên các API nhạy cảm, bất kỳ bên thứ ba nào cũng có thể gửi request trực tiếp (qua CORS wildcard `*`) để thay đổi dữ liệu của người dùng. Các test case CSRF dưới đây đã được cập nhật để phản ánh đúng bản chất kỹ thuật này dưới dạng **Bypass xác thực/Cơ chế Cross-site**.

---

## Thiết lập chung trên Burp Suite

1. Mở Burp Suite Community Edition.
2. Vào `Proxy > Intercept`, chọn `Open browser` để dùng trình duyệt tích hợp của Burp.
3. Truy cập hệ thống tại `http://localhost:3000` hoặc mở trực tiếp các file HTML của project nếu giao diện đang chạy từ file.
4. Đặt `Intercept is off` để Burp tự ghi request vào `Proxy > HTTP history`.
5. Với mỗi test case, chọn request phù hợp trong `HTTP history`, click chuột phải và chọn `Send to Repeater`.
6. Sửa tham số theo dữ liệu test, nhấn `Send` và ghi nhận `Status code`, `Response body`, dữ liệu trong giao diện hoặc database nếu cần.

Quy ước kết quả:

- `Pass`: hệ thống chặn đúng hành vi tấn công hoặc xử lý an toàn.
- `Fail`: hệ thống cho phép truy cập/sửa/xóa dữ liệu trái phép hoặc phản hồi không an toàn.
- `Chưa test`: chưa thực hiện kiểm thử thực tế trên Burp Suite.

---

## 1. Lỗi IDOR / Broken Access Control

**Tổng quan:**  
Trong project này, frontend lưu `userId` trong `localStorage` và gửi trực tiếp `idKH`, `idLichKham`, `idHoSoYTe` lên API. Vì vậy cần kiểm tra việc người dùng có thể đổi ID trong request để xem, sửa hoặc hủy dữ liệu của người khác hay không.

| Test case ID | Mô tả test case | API/module áp dụng | Hướng dẫn thực hiện trên Burp Suite | Dữ liệu test | Đầu ra mong đợi | Ngày test | Kết quả |
|---|---|---|---|---|---|---|---|
| TC_IDOR_01 | Xem thông tin cá nhân của khách hàng khác | `GET /api/khachhang/:idKH` | Đăng nhập bằng khách hàng A -> mở trang tài khoản -> bắt request `GET /api/khachhang/ID_A` trong `HTTP history` -> `Send to Repeater` -> đổi `ID_A` thành `ID_B` -> `Send` | `/api/khachhang/1` đổi thành `/api/khachhang/2` | Khách hàng A không xem được thông tin khách hàng B; server trả `401/403` hoặc thông báo không có quyền | 10/07/2026 | Chưa test |
| TC_IDOR_02 | Cập nhật hồ sơ cá nhân của khách hàng khác | `PUT /api/khachhang/:idKH` | Bắt request cập nhật hồ sơ của khách hàng A -> gửi sang `Repeater` -> đổi path `idKH` sang ID khách hàng B -> sửa `hoTen`, `diachi` -> `Send` | `PUT /api/khachhang/2` body `{"hoTen":"Test IDOR","gioitinh":"Nam","cccd":"012345678901","diachi":"Dia chi bi sua"}` | Không cập nhật được hồ sơ của khách hàng khác; server chặn request | 10/07/2026 | Chưa test |
| TC_IDOR_03 | Xem hồ sơ y tế và lịch sử khám của khách hàng khác | `GET /hosoyte/:idKH` | Đăng nhập khách hàng A -> mở hồ sơ y tế -> bắt request `/hosoyte/ID_A` -> gửi sang `Repeater` -> đổi sang `ID_B` | `/hosoyte/1` đổi thành `/hosoyte/2` | Không trả về thông tin bệnh nhân, hồ sơ y tế hoặc lịch sử khám của người khác | 10/07/2026 | Chưa test |
| TC_IDOR_04 | Xem danh sách lịch khám của khách hàng khác | `GET /api/lich-user/:idKH` | Mở mục lịch khám của khách hàng A -> bắt request `GET /api/lich-user/ID_A` -> gửi sang `Repeater` -> đổi thành `ID_B` | `/api/lich-user/1` đổi thành `/api/lich-user/2` | Chỉ trả lịch khám thuộc tài khoản đang đăng nhập | 10/07/2026 | Chưa test |
| TC_IDOR_05 | Hủy lịch khám của khách hàng khác | `POST /api/huy-lich` | Bắt request hủy lịch của khách hàng A -> gửi sang `Repeater` -> đổi `idLichKham` thành lịch của khách hàng B -> `Send` | `{"idLichKham": 12}` | Không hủy được lịch khám không thuộc tài khoản hiện tại | 10/07/2026 | Chưa test |
| TC_IDOR_06 | Đặt lịch khám gán vào tài khoản khách hàng khác | `POST /api/dat-lich` | Bắt request đặt lịch -> gửi sang `Repeater` -> sửa trường `idKH` trong body thành ID người khác -> `Send` | `{"hoTen":"Nguyen Van A","idKH":2,"idBacSi":1,"idKhoa":1,"ngayKham":"20/07/2026","gioKham":"08:00","lyDo":"Kiem thu IDOR"}` | Server không cho client tự quyết định `idKH`; lịch phải gắn với user đã xác thực | 10/07/2026 | Chưa test |

---

## 2. Lỗi thiếu phân quyền Admin

**Tổng quan:**  
Các API quản trị như quản lý bác sĩ, khoa, lịch khám, hồ sơ y tế, tài khoản và dashboard là chức năng nhạy cảm. Cần kiểm tra người dùng thường hoặc người chưa đăng nhập có thể gọi trực tiếp các API này hay không.

| Test case ID | Mô tả test case | API/module áp dụng | Hướng dẫn thực hiện trên Burp Suite | Dữ liệu test | Đầu ra mong đợi | Ngày test | Kết quả |
|---|---|---|---|---|---|---|---|
| TC_ADMIN_01 | Truy cập danh sách tài khoản khách hàng khi không phải admin | `GET /api/taikhoan` | Không đăng nhập admin -> trong `Repeater`, tạo request `GET /api/taikhoan` hoặc lấy từ `HTTP history` của trang admin -> `Send` | `GET /api/taikhoan` | Người chưa có quyền admin không xem được danh sách tài khoản | 10/07/2026 | Chưa test |
| TC_ADMIN_02 | Thêm bác sĩ khi không có quyền admin | `POST /api/admin/bacsi` | Gửi request thêm bác sĩ sang `Repeater` -> xóa mọi header không cần thiết -> gửi trực tiếp request | `{"hoTenBacSi":"Bac si test","hocVi":"ThS","idKhoa":1}` | Server từ chối nếu không có xác thực admin | 10/07/2026 | Chưa test |
| TC_ADMIN_03 | Cập nhật trạng thái lịch khám bằng tài khoản thường | `PUT /api/admin/lichkham/:id` | Bắt request cập nhật trạng thái lịch trong trang admin hoặc tự tạo trong `Repeater` -> đổi ID lịch khám -> gửi request | `PUT /api/admin/lichkham/1` body `{"trangThai":"đã xác nhận"}` | Chỉ admin hợp lệ mới được xác nhận/hủy lịch | 10/07/2026 | Chưa test |
| TC_ADMIN_04 | Xóa tài khoản khách hàng qua API admin | `DELETE /api/taikhoan/:idKH` | Trong `Repeater`, gửi request xóa tài khoản, thử cả trường hợp có `?force=true` | `DELETE /api/taikhoan/2?force=true` | Không cho xóa tài khoản nếu không có quyền admin và xác nhận hợp lệ | 10/07/2026 | Chưa test |
| TC_ADMIN_05 | Thêm lịch sử khám bệnh trái phép | `POST /api/admin/lichsu` | Bắt request thêm lịch sử khám hoặc tự tạo request JSON trong `Repeater` -> gửi khi không đăng nhập admin | `{"ngayKham":"2026-07-20","ketLuan":"Du lieu test","chiTiet":"Kiem thu phan quyen","idBacSi":1,"idKhoa":1,"idHoSoYTe":1}` | Người không phải admin không tạo được lịch sử khám bệnh | 10/07/2026 | Chưa test |
| TC_ADMIN_06 | Xem dashboard và hoạt động gần đây khi không có quyền admin | `GET /api/dashboard`, `GET /api/hoatdong` | Gửi request trực tiếp trong `Repeater` khi chưa đăng nhập admin -> quan sát dữ liệu thống kê và log hoạt động trả về | `GET /api/dashboard`, `GET /api/hoatdong` | Dashboard và log hoạt động chỉ hiển thị cho admin hợp lệ | 10/07/2026 | Chưa test |

---

## 3. Lỗi Authentication và bảo vệ tài khoản

**Tổng quan:**  
Nhóm này kiểm tra đăng nhập, chống brute force, chất lượng mật khẩu và việc đổi mật khẩu. Project hiện dùng số điện thoại và mật khẩu, không thấy cơ chế session/JWT/cookie ở API nên cần kiểm thử kỹ.

| Test case ID | Mô tả test case | API/module áp dụng | Hướng dẫn thực hiện trên Burp Suite | Dữ liệu test | Đầu ra mong đợi | Ngày test | Kết quả |
|---|---|---|---|---|---|---|---|
| TC_AUTH_01 | Brute force mật khẩu đăng nhập | `POST /login` | Bắt request login -> `Send to Intruder` -> đặt payload tại trường `matkhau` -> thêm danh sách mật khẩu sai -> chạy attack -> quan sát số lần thử và phản hồi | `123456`, `admin123`, `111111`, `password`, `test123` | Sau nhiều lần sai phải có rate limit, khóa tạm, captcha hoặc delay | 10/07/2026 | Chưa test |
| TC_AUTH_02 | Bypass đăng nhập bằng SQL Injection | `POST /login` | Gửi request login sang `Repeater` -> thay `sdt` hoặc `matkhau` bằng payload SQLi -> `Send` | `{"sdt":"' OR '1'='1","matkhau":"' OR '1'='1"}` | Không đăng nhập được, không hiện lỗi SQL/database | 10/07/2026 | Chưa test |
| TC_AUTH_03 | Đăng ký bằng mật khẩu yếu | `POST /register` | Bắt request đăng ký -> gửi sang `Repeater` -> đổi `matkhau` thành mật khẩu quá ngắn/dễ đoán -> `Send` | `{"hoten":"User Test","sdt":"0999999999","matkhau":"123"}` | Server phải từ chối mật khẩu yếu theo chính sách mật khẩu | 10/07/2026 | Chưa test |
| TC_AUTH_04 | Đổi mật khẩu không có phiên đăng nhập hợp lệ | `PUT /api/khachhang/:idKH/changepassword` | Bắt request đổi mật khẩu -> gửi sang `Repeater` -> xóa mọi header xác thực nếu có -> gửi lại request trực tiếp | `PUT /api/khachhang/1/changepassword` body `{"oldPassword":"123456","newPassword":"1234567"}` | Chỉ chủ tài khoản đang đăng nhập mới được đổi mật khẩu | 10/07/2026 | Chưa test |
| TC_AUTH_05 | Truy cập API riêng tư sau khi logout/xóa localStorage | `GET /api/khachhang/:idKH` | Đăng xuất trên UI hoặc xóa `localStorage` trong browser -> dùng `Repeater` gửi lại request lấy thông tin khách hàng | `GET /api/khachhang/1` không có cookie/token | API riêng tư phải yêu cầu xác thực, không chỉ dựa vào localStorage phía client | 10/07/2026 | Chưa test |

---

## 4. Lỗi Injection và XSS

**Tổng quan:**  
Project dùng MySQL và nhiều input được lưu/hiển thị lại như họ tên, địa chỉ, tên khoa, tên bác sĩ, lý do khám, kết luận khám. Cần kiểm tra SQL Injection và XSS ở các điểm nhập liệu này.

| Test case ID | Mô tả test case | API/module áp dụng | Hướng dẫn thực hiện trên Burp Suite | Dữ liệu test | Đầu ra mong đợi | Ngày test | Kết quả |
|---|---|---|---|---|---|---|---|
| TC_INJ_01 | SQL Injection ở chức năng tìm kiếm bác sĩ admin | `GET /api/admin/bacsi?q=` | Bắt request tìm bác sĩ -> gửi sang `Repeater` -> thay query `q` bằng payload SQLi -> `Send` | `/api/admin/bacsi?q=' OR '1'='1--` | Không lỗi SQL, không trả dữ liệu bất thường ngoài quyền cho phép (sử dụng Parameterized Queries) | 10/07/2026 | Chưa test |
| TC_INJ_02 | SQL Injection ở tham số ID trên URL | `GET /api/khachhang/:idKH`, `GET /api/admin/lichsu/:id` | Gửi request có ID sang `Repeater` -> thêm ký tự `'`, `OR 1=1`, hoặc chuỗi không phải số vào ID -> quan sát response | `/api/khachhang/1'`, `/api/admin/lichsu/1 OR 1=1` | Không lộ lỗi database, không trả dữ liệu ngoài phạm vi | 10/07/2026 | Chưa test |
| TC_XSS_01 | Stored XSS trong thông tin cá nhân khách hàng | `PUT /api/khachhang/:idKH` | Bắt request cập nhật hồ sơ -> chèn payload XSS vào `hoTen` hoặc `diachi` -> mở lại trang tài khoản/admin danh sách tài khoản để kiểm tra | `{"hoTen":"<img src=x onerror=alert(1)>","diachi":"<script>alert(1)</script>"}` | Payload phải được encode/làm sạch, không thực thi JavaScript | 10/07/2026 | Chưa test |
| TC_XSS_02 | Stored XSS trong tên khoa hoặc tên bác sĩ | `POST /api/khoa`, `POST /api/admin/bacsi` | Bắt request thêm khoa/bác sĩ -> thay tên bằng payload XSS -> mở lại trang quản trị danh sách khoa/bác sĩ | `{"tenKhoa":"<img src=x onerror=alert(1)>"}`, `{"hoTenBacSi":"<script>alert(1)</script>","hocVi":"BS","idKhoa":1}` | Giao diện admin không thực thi script từ dữ liệu đã lưu | 10/07/2026 | Chưa test |
| TC_XSS_03 | Stored XSS trong lý do khám/kết luận khám | `POST /api/dat-lich`, `POST /api/admin/lichsu` | Gửi request đặt lịch hoặc thêm lịch sử khám sang `Repeater` -> chèn payload vào `lyDo`, `ketLuan`, `chiTiet` -> mở trang admin/khách hàng để xem dữ liệu | `lyDo=<svg onload=alert(1)>`, `ketLuan=<img src=x onerror=alert(1)>` | Payload được hiển thị an toàn, không chạy script | 10/07/2026 | Chưa test |

---

## 5. Lỗi cấu hình CORS sai và Thiếu xác thực API (CSRF / Broken Authentication)

**Tổng quan:**  
Các API thay đổi trạng thái và dữ liệu quan trọng như đặt/hủy lịch khám, cập nhật hồ sơ hoặc xóa tài khoản/khoa cần được bảo vệ bằng cơ chế xác thực mạnh mẽ (Token/Session). Do backend hiện tại để mở CORS toàn bộ và không kiểm tra phiên làm việc phía server, kẻ tấn công có thể giả mạo yêu cầu từ bên thứ ba (Cross-site Request) để sửa đổi hệ thống.

| Test case ID | Mô tả test case | API/module áp dụng | Hướng dẫn thực hiện trên Burp Suite | Dữ liệu test | Đầu ra mong đợi | Ngày test | Kết quả |
|---|---|---|---|---|---|---|---|
| TC_CORS_01 | CORS cấu hình wildcard cho phép tất cả các nguồn | Các API `/api/*` | Bắt một request API nhạy cảm (như `/api/taikhoan`) -> gửi sang `Repeater` -> thêm header `Origin: https://evil.com` -> `Send` -> kiểm tra Response headers | Header `Origin: https://evil.com` | Server không được phản hồi kèm `Access-Control-Allow-Origin: *` hoặc `Access-Control-Allow-Credentials: true` khi có Origin lạ | 10/07/2026 | Chưa test |
| TC_CSRF_01 | Thay đổi thông tin/hủy lịch qua request giả mạo (Cross-site) do thiếu Token | `POST /api/huy-lich`, `PUT /api/khachhang/:idKH` | Tạo trang HTML chạy từ nguồn khác (ví dụ: `http://evil.com` giả lập) gửi request POST/PUT tới API hủy lịch hoặc sửa hồ sơ mà không cần gửi kèm Token xác thực | Request hủy lịch `{"idLichKham": 12}` gửi từ bên ngoài hệ thống | Server phải từ chối xử lý yêu cầu thay đổi trạng thái nếu thiếu Session/JWT hợp lệ và CSRF Token bảo vệ | 10/07/2026 | Chưa test |
| TC_CSRF_02 | Thực hiện thao tác Admin nhạy cảm từ nguồn khác | `DELETE /api/khoa/:id`, `DELETE /api/admin/bacsi/:id` | Tạo request giả mạo tự động gửi lệnh DELETE khoa/bác sĩ từ domain bên ngoài mà không có thông tin xác thực admin hợp lệ của server | `DELETE /api/khoa/1?force=true` | Request bị từ chối; hệ thống yêu cầu thông tin phiên làm việc hợp lệ của Quản trị viên | 10/07/2026 | Chưa test |
| TC_HEAD_01 | Thiếu các Security Headers quan trọng chống clickjacking/sniffing | Các API và tài nguyên tĩnh | Trong `HTTP history`, chọn response bất kỳ -> xem tab `Response headers` | Kiểm tra sự hiện diện của các header an toàn | Phải có các header như `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` | 10/07/2026 | Chưa test |

---

## 6. Lỗi Business Logic và toàn vẹn dữ liệu

**Tổng quan:**  
Nhóm này kiểm tra logic nghiệp vụ đặt lịch khám, quan hệ bác sĩ-khoa và thao tác xóa dây chuyền. Đây là các lỗi thường không phát hiện được nếu chỉ kiểm tra giao diện.

| Test case ID | Mô tả test case | API/module áp dụng | Hướng dẫn thực hiện trên Burp Suite | Dữ liệu test | Đầu ra mong đợi | Ngày test | Kết quả |
|---|---|---|---|---|---|---|---|
| TC_LOGIC_01 | Đặt trùng lịch cùng bác sĩ, ngày, giờ | `POST /api/dat-lich` | Bắt request đặt lịch hợp lệ -> gửi sang `Repeater` -> nhấn `Send` 2 lần với cùng `idBacSi`, `ngayKham`, `gioKham` | Cùng `idBacSi=1`, `ngayKham=20/07/2026`, `gioKham=08:00` | Lần đặt thứ hai phải bị từ chối vì trùng lịch | 10/07/2026 | Chưa test |
| TC_LOGIC_02 | Đặt lịch vào ngày trong quá khứ | `POST /api/dat-lich` | Gửi request đặt lịch sang `Repeater` -> sửa `ngayKham` thành ngày đã qua -> `Send` | `ngayKham=01/01/2020`, `gioKham=08:00` | Server không cho đặt lịch trong quá khứ | 10/07/2026 | Chưa test |
| TC_LOGIC_03 | Đặt lịch với bác sĩ không thuộc khoa đã chọn | `POST /api/dat-lich` | Chọn một bác sĩ thuộc khoa A -> trong `Repeater`, đổi `idKhoa` sang khoa B -> gửi request | `idBacSi=1`, `idKhoa=999` hoặc một khoa khác với khoa của bác sĩ | Server kiểm tra quan hệ bác sĩ-khoa và từ chối dữ liệu không hợp lệ | 10/07/2026 | Chưa test |
| TC_LOGIC_04 | Lạm dụng `force=true` để xóa dây chuyền dữ liệu | `DELETE /api/khoa/:id?force=true`, `DELETE /api/taikhoan/:idKH?force=true`, `DELETE /api/admin/hosoyte/:id?force=true` | Bắt request xóa có xác nhận trong admin -> gửi sang `Repeater` -> thêm/sửa `force=true` trực tiếp -> `Send` | `DELETE /api/taikhoan/2?force=true` | Chỉ admin hợp lệ sau xác nhận rõ ràng mới được xóa dây chuyền; user thường không được gọi trực tiếp | 10/07/2026 | Chưa test |

---

## Bảng tổng hợp số lượng test case

| Nhóm lỗi | Số lượng test case |
|---|---:|
| IDOR / Broken Access Control | 6 |
| Thiếu phân quyền Admin | 6 |
| Authentication và bảo vệ tài khoản | 5 |
| Injection và XSS | 5 |
| CORS, CSRF và Thiếu xác thực API | 4 |
| Business Logic và toàn vẹn dữ liệu | 4 |
| **Tổng cộng** | **30** |

Nếu báo cáo chỉ yêu cầu khoảng 25 test case, nên ưu tiên giữ:

- 6 test case IDOR
- 6 test case thiếu phân quyền Admin
- 5 test case Authentication
- 4 test case Injection/XSS quan trọng nhất
- 2 test case CSRF/CORS (đã cập nhật mô tả thực tế)
- 2 test case Business Logic
