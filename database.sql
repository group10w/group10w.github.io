-- Schema hệ thống đặt lịch khám bệnh (ttcsn)
-- Chạy: mysql -u root -p < database.sql
-- Hoặc import bằng MySQL Workbench

CREATE DATABASE IF NOT EXISTS ttcsn
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ttcsn;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS LICHSUKHAMBENH;
DROP TABLE IF EXISTS LICHKHAM;
DROP TABLE IF EXISTS HOSOYTE;
DROP TABLE IF EXISTS BACSI;
DROP TABLE IF EXISTS KHOA;
DROP TABLE IF EXISTS hoatdong;
DROP TABLE IF EXISTS KHACHHANG;
DROP TABLE IF EXISTS QUANTRIVIEN;

SET FOREIGN_KEY_CHECKS = 1;

-- ================== QUẢN TRỊ VIÊN ==================
CREATE TABLE QUANTRIVIEN (
  idQTV INT AUTO_INCREMENT PRIMARY KEY,
  sdtQTV VARCHAR(11) NOT NULL UNIQUE,
  matKhauQTV VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================== KHÁCH HÀNG ==================
CREATE TABLE KHACHHANG (
  idKH INT AUTO_INCREMENT PRIMARY KEY,
  hoTen VARCHAR(100) NOT NULL,
  sdt VARCHAR(11) NOT NULL UNIQUE,
  matKhau VARCHAR(255) NOT NULL,
  gioiTinh VARCHAR(10) DEFAULT NULL,
  ngayThangNamSinh DATE DEFAULT NULL,
  cccd VARCHAR(20) DEFAULT NULL,
  diaChi VARCHAR(255) DEFAULT NULL,
  INDEX idx_kh_sdt (sdt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================== KHOA / BÁC SĨ ==================
CREATE TABLE KHOA (
  idKhoa INT AUTO_INCREMENT PRIMARY KEY,
  tenKhoa VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE BACSI (
  idBacSi INT AUTO_INCREMENT PRIMARY KEY,
  hoTenBacSi VARCHAR(100) NOT NULL,
  hocVi VARCHAR(100) DEFAULT NULL,
  idKhoa INT NOT NULL,
  CONSTRAINT fk_bacsi_khoa FOREIGN KEY (idKhoa) REFERENCES KHOA(idKhoa)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_bacsi_khoa (idKhoa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================== HỒ SƠ & LỊCH KHÁM ==================
CREATE TABLE HOSOYTE (
  idHoSoYTe INT AUTO_INCREMENT PRIMARY KEY,
  idKH INT NOT NULL UNIQUE,
  CONSTRAINT fk_hoso_kh FOREIGN KEY (idKH) REFERENCES KHACHHANG(idKH)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE LICHKHAM (
  idLichKham INT AUTO_INCREMENT PRIMARY KEY,
  hoTen VARCHAR(100) NOT NULL,
  lyDo TEXT,
  ngayKham DATE NOT NULL,
  gioKham TIME NOT NULL,
  idKH INT NOT NULL,
  idBacSi INT NOT NULL,
  idKhoa INT NOT NULL,
  trangThai VARCHAR(50) NOT NULL DEFAULT 'chờ xác nhận',
  CONSTRAINT fk_lich_kh FOREIGN KEY (idKH) REFERENCES KHACHHANG(idKH)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_lich_bs FOREIGN KEY (idBacSi) REFERENCES BACSI(idBacSi)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_lich_khoa FOREIGN KEY (idKhoa) REFERENCES KHOA(idKhoa)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_lich_bs_ngay_gio (idBacSi, ngayKham, gioKham),
  INDEX idx_lich_kh (idKH),
  INDEX idx_lich_status (trangThai)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE LICHSUKHAMBENH (
  idLS INT AUTO_INCREMENT PRIMARY KEY,
  ngayKham DATE NOT NULL,
  ketLuan VARCHAR(255) NOT NULL,
  chiTiet TEXT,
  idBacSi INT NOT NULL,
  idKhoa INT NOT NULL,
  idHoSoYTe INT NOT NULL,
  CONSTRAINT fk_ls_bs FOREIGN KEY (idBacSi) REFERENCES BACSI(idBacSi)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_ls_khoa FOREIGN KEY (idKhoa) REFERENCES KHOA(idKhoa)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_ls_hoso FOREIGN KEY (idHoSoYTe) REFERENCES HOSOYTE(idHoSoYTe)
    ON UPDATE CASCADE ON DELETE CASCADE,
  INDEX idx_ls_hoso (idHoSoYTe)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================== LOG HOẠT ĐỘNG ==================
CREATE TABLE hoatdong (
  id INT AUTO_INCREMENT PRIMARY KEY,
  loaiHoatDong VARCHAR(100) NOT NULL,
  moTa VARCHAR(500) NOT NULL,
  idNguoiThucHien INT DEFAULT NULL,
  thoiGian DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hd_time (thoiGian)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ================== DỮ LIỆU MẪU ==================
-- Mật khẩu plaintext sẽ được hệ thống tự nâng cấp sang PBKDF2 khi đăng nhập lần đầu.
-- Admin: 0900000000 / Admin@123
-- Khách: 0912345678 / User@1234

INSERT INTO QUANTRIVIEN (sdtQTV, matKhauQTV) VALUES
('0900000000', 'Admin@123');

INSERT INTO KHACHHANG (hoTen, sdt, matKhau, gioiTinh, ngayThangNamSinh, cccd, diaChi) VALUES
('Nguyễn Văn A', '0912345678', 'User@1234', 'Nam', '1998-05-12', '001098012345', 'Hà Nội'),
('Trần Thị B', '0987654321', 'User@1234', 'Nữ', '2000-08-20', '001200098765', 'Đà Nẵng');

INSERT INTO HOSOYTE (idKH) VALUES (1), (2);

INSERT INTO KHOA (tenKhoa) VALUES
('Nội tổng quát'),
('Ngoại tổng quát'),
('Nhi'),
('Da liễu'),
('Tai mũi họng');

INSERT INTO BACSI (hoTenBacSi, hocVi, idKhoa) VALUES
('BS. Nguyễn Minh Đức', 'Thạc sĩ', 1),
('BS. Lê Thị Hồng', 'Bác sĩ CKII', 1),
('BS. Phạm Văn Hùng', 'Tiến sĩ', 2),
('BS. Trần Mai Anh', 'Bác sĩ CKI', 3),
('BS. Hoàng Quốc Bảo', 'Thạc sĩ', 4),
('BS. Đỗ Thị Lan', 'Bác sĩ CKI', 5);

INSERT INTO LICHSUKHAMBENH (ngayKham, ketLuan, chiTiet, idBacSi, idKhoa, idHoSoYTe) VALUES
('2026-06-01', 'Sức khỏe ổn định', 'Huyết áp bình thường, khuyến nghị tái khám sau 6 tháng.', 1, 1, 1);

INSERT INTO LICHKHAM (hoTen, lyDo, ngayKham, gioKham, idKH, idBacSi, idKhoa, trangThai) VALUES
('Nguyễn Văn A', 'Đau đầu nhẹ', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '08:00:00', 1, 1, 1, 'chờ xác nhận');
