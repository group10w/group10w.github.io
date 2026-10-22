# Hệ thống đặt lịch khám bệnh (MedAdmin / ICare)

Web app quản lý đặt lịch khám: khách hàng đăng ký/đăng nhập, đặt lịch, xem hồ sơ; admin quản lý khoa, bác sĩ, lịch khám, hồ sơ y tế.

## Yêu cầu

- Node.js 18+
- MySQL 8
- (Tùy chọn) Python 3.10+ nếu dùng chatbot ICare

## Cài đặt nhanh

### 1. Import database

Trong MySQL Workbench hoặc CLI:

```bash
mysql -u root -p < database.sql
```

Mặc định schema tạo DB `ttcsn` kèm dữ liệu mẫu.

### 2. Cấu hình môi trường

Sao chép `.env.example` thành `.env` và sửa mật khẩu MySQL cho đúng máy bạn:

```env
DB_PASSWORD=mat_khau_mysql_cua_ban
JWT_SECRET=chuoi-bi-mat-cua-ban
GEMINI_API_KEY=  # chỉ cần nếu chạy chatbot
```

### 3. Chạy backend + giao diện

```bash
npm install
npm start
```

Mở trình duyệt: [http://localhost:3000](http://localhost:3000)

Frontend được Express phục vụ tại:

| Vai trò | URL |
|--------|-----|
| Khách (chưa login) | `/customer/trangchupre/trangchu1.html` |
| Khách (đã login) | `/customer/trangchu/trangchu1.html` |
| Admin | `/admin-panel/admin.html` |

### 4. Chatbot (tùy chọn)

```bash
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

## Tài khoản mẫu (sau khi import `database.sql`)

| Vai trò | SĐT | Mật khẩu |
|--------|-----|----------|
| Admin | `0900000000` | `Admin@123` |
| Khách | `0912345678` | `User@1234` |
| Khách 2 | `0987654321` | `User@1234` |

Mật khẩu plaintext sẽ được tự động nâng cấp sang PBKDF2 khi đăng nhập lần đầu.

## Bảo mật đã có

- JWT (HMAC-SHA256) + phân quyền admin/customer
- Chống IDOR trên API hồ sơ / lịch / đổi mật khẩu
- Rate limit đăng nhập (5 lần/phút/IP)
- Hash mật khẩu PBKDF2
- Escape XSS phía server trước khi lưu
- CORS whitelist (không dùng `*`)
- Input validation (ngày, giờ, ID, mật khẩu mạnh)

## Cấu trúc chính

```
server.js          # API Express (:3000)
database.sql       # Schema + seed
Khách hàng/        # UI khách
Quản trị viên/     # UI admin
server.py          # Chatbot FastAPI (:8000)
yte/               # Knowledge base chatbot
```
