// server.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const crypto = require("crypto");

// Load .env nếu có (không bắt buộc package dotenv)
(() => {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "null",
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 600,
}));
app.use(bodyParser.json({ limit: "100kb" }));

const db = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root",
  database: process.env.DB_NAME || "ttcsn",
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Lỗi kết nối MySQL:", err.message);
    console.error("👉 Kiểm tra MySQL đã chạy và đã import database.sql chưa.");
    return;
  }
  console.log("✅ Đã kết nối MySQL thành công!");
  connection.release();
});

function sameId(a, b) {
  return Number(a) === Number(b);
}

// ================== CẤU HÌNH BẢO MẬT & XÁC THỰC ==================

const JWT_SECRET = process.env.JWT_SECRET || "cosonganh-local-secret-2026";
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 60 * 60 * 8);
const PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256";
const PASSWORD_HASH_ITERATIONS = 100000;

if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET chưa được cấu hình, dùng khóa mặc định ổn định cho môi trường local.");
}

// Tạo token JWT tự thiết lập bằng crypto
function generateToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    const received = Buffer.from(signature, "base64url");
    const expected = Buffer.from(expectedSig, "base64url");
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!["admin", "customer"].includes(payload.role) || !isValidId(payload.id)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(String(password), salt, PASSWORD_HASH_ITERATIONS, 32, "sha256").toString("hex");
  return `${PASSWORD_HASH_ALGORITHM}$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

function isHashedPassword(value) {
  return typeof value === "string" && value.startsWith(`${PASSWORD_HASH_ALGORITHM}$`);
}

function safeCompareString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyPassword(password, storedPassword) {
  if (!isHashedPassword(storedPassword)) {
    return safeCompareString(password, storedPassword);
  }

  const parts = storedPassword.split("$");
  if (parts.length !== 4) return false;
  const [, iterationsRaw, salt, expectedHash] = parts;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const computedHash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return safeCompareString(computedHash, expectedHash);
}

function upgradePasswordIfNeeded(table, passwordColumn, idColumn, id, plainPassword) {
  if (!isValidId(id)) return;
  const sql = `UPDATE ${table} SET ${passwordColumn} = ? WHERE ${idColumn} = ?`;
  db.query(sql, [hashPassword(plainPassword), id], (err) => {
    if (err) console.error("❌ Lỗi nâng cấp hash mật khẩu:", err);
  });
}

// Hàm làm sạch chuỗi chống Stored XSS
function escapeHtml(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// In-memory rate limiter chống brute force login
const loginAttempts = new Map();
function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(time => now - time < 60000);

  if (recentAttempts.length >= 5) {
    return res.status(429).json({ message: "Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 1 phút!" });
  }

  req.recordFailedAttempt = () => {
    recentAttempts.push(Date.now());
    loginAttempts.set(ip, recentAttempts);
  };
  req.clearFailedAttempts = () => {
    loginAttempts.delete(ip);
  };
  next();
}

// Security Headers
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self' http: https: data: 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.tailwindcss.com;");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
});
// Phục vụ frontend tĩnh (không cần Live Server)
const customerDir = path.join(__dirname, "Khách hàng");
const adminDir = path.join(__dirname, "Quản trị viên");
if (fs.existsSync(customerDir)) {
  app.use("/customer", express.static(customerDir));
  app.use("/Picture", express.static(path.join(customerDir, "Picture")));
}
if (fs.existsSync(adminDir)) {
  app.use("/admin-panel", express.static(adminDir));
}
app.get("/", (_req, res) => {
  res.redirect("/customer/trangchupre/trangchu1.html");
});

// Middleware xác thực token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Chưa cung cấp token xác thực!" });
  }
  const user = verifyToken(token);
  if (!user) {
    return res.status(403).json({ message: "Token xác thực không hợp lệ hoặc đã hết hạn!" });
  }
  req.user = user;
  next();
}

// Middleware xác thực quyền Admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Bạn không có quyền truy cập chức năng này!" });
  }
  next();
}

// Helper: Kiểm tra ID là số nguyên hợp lệ
function isValidId(id) {
  return Number.isInteger(Number(id)) && Number(id) > 0;
}

function normalizeDateInput(value, allowShortDate = false) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  let year;
  let month;
  let day;

  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const fullSlashMatch = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const shortSlashMatch = input.match(/^(\d{1,2})\/(\d{1,2})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (fullSlashMatch) {
    day = Number(fullSlashMatch[1]);
    month = Number(fullSlashMatch[2]);
    year = Number(fullSlashMatch[3]);
  } else if (allowShortDate && shortSlashMatch) {
    day = Number(shortSlashMatch[1]);
    month = Number(shortSlashMatch[2]);
    year = new Date().getFullYear();
  } else {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

  if (allowShortDate && shortSlashMatch) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      date.setFullYear(date.getFullYear() + 1);
      year = date.getFullYear();
    }
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function isPastDate(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date < today;
}

function normalizeTimeInput(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^([0-1]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  return `${match[1]}:${match[2]}:00`;
}

function toDisplayTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function hasStrongPassword(password) {
  return typeof password === "string"
    && password.length >= 8
    && /[A-Za-z]/.test(password)
    && /\d/.test(password);
}

function validateMedicalHistoryRefs(idBacSi, idKhoa, idHoSoYTe, callback) {
  if (!isValidId(idBacSi) || !isValidId(idKhoa) || !isValidId(idHoSoYTe)) {
    return callback({ status: 400, message: "ID bác sĩ, khoa hoặc hồ sơ y tế không hợp lệ!" });
  }

  const sql = `
    SELECT
      EXISTS(SELECT 1 FROM BACSI WHERE idBacSi = ? AND idKhoa = ?) AS doctorInDepartment,
      EXISTS(SELECT 1 FROM HOSOYTE WHERE idHoSoYTe = ?) AS medicalRecordExists
  `;
  db.query(sql, [idBacSi, idKhoa, idHoSoYTe], (err, rows) => {
    if (err) return callback({ status: 500, message: "Lỗi kiểm tra dữ liệu liên quan!" });
    const row = rows[0] || {};
    if (!row.doctorInDepartment) {
      return callback({ status: 400, message: "Bác sĩ không thuộc khoa đã chọn!" });
    }
    if (!row.medicalRecordExists) {
      return callback({ status: 400, message: "Hồ sơ y tế không tồn tại!" });
    }
    callback(null);
  });
}

// Helper: Format thời gian
function formatTime(date) {
  if (!date) return "";
  const d = new Date(date);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// Helper: Ghi log hoạt động
function logActivity(loaiHoatDong, moTa, idNguoiThucHien = null) {
  const sql = "INSERT INTO hoatdong (loaiHoatDong, moTa, idNguoiThucHien) VALUES (?, ?, ?)";
  db.query(sql, [loaiHoatDong, moTa, idNguoiThucHien], (err) => {
    if (err) console.error("❌ Lỗi ghi log hoạt động:", err);
  });
}

function runTransaction(queries, onSuccess, onError) {
  db.getConnection((connErr, connection) => {
    if (connErr) return onError(connErr);

    connection.beginTransaction((beginErr) => {
      if (beginErr) {
        connection.release();
        return onError(beginErr);
      }

      const run = (index) => {
        if (index >= queries.length) {
          return connection.commit((commitErr) => {
            if (commitErr) {
              return connection.rollback(() => {
                connection.release();
                onError(commitErr);
              });
            }
            connection.release();
            onSuccess();
          });
        }

        const { sql, params = [] } = queries[index];
        connection.query(sql, params, (queryErr) => {
          if (queryErr) {
            return connection.rollback(() => {
              connection.release();
              onError(queryErr);
            });
          }
          run(index + 1);
        });
      };

      run(0);
    });
  });
}


// ================== API ĐĂNG KÝ (REGISTER) ==================
app.post("/register", (req, res) => {
  const { hoten, sdt, matkhau } = req.body;

  if (!hoten || !sdt || !matkhau) {
    return res.status(400).json({ message: "Vui lòng nhập đầy đủ Họ tên, SĐT, và Mật khẩu!" });
  }

  if (!hasStrongPassword(matkhau)) {
    return res.status(400).json({ message: "Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số!" });
  }

  if (!/^[0-9]{10,11}$/.test(sdt)) {
    return res.status(400).json({ message: "Số điện thoại không hợp lệ! Vui lòng nhập lại." });
  }

  // Escape XSS cho hoten
  const safeHoten = escapeHtml(hoten);

  const checkSql = "SELECT idKH FROM KHACHHANG WHERE sdt = ?";
  db.query(checkSql, [sdt], (err, results) => {
    if (err) {
      console.error("Lỗi khi kiểm tra số điện thoại:", err);
      return res.status(500).json({ message: "Lỗi máy chủ khi kiểm tra số điện thoại!" });
    }

    if (results.length > 0) {
      return res.status(400).json({ message: "Số điện thoại này đã được đăng ký!" });
    }

    db.getConnection((beginErr, connection) => {
      if (beginErr) return res.status(500).json({ message: "Đăng ký thất bại!" });

      connection.beginTransaction((txErr) => {
        if (txErr) {
          connection.release();
          return res.status(500).json({ message: "Đăng ký thất bại!" });
        }

        const insertSql = `
          INSERT INTO KHACHHANG (hoTen, sdt, matKhau, gioiTinh, ngayThangNamSinh, cccd, diaChi)
          VALUES (?, ?, ?, NULL, NULL, NULL, NULL)
        `;
        const values = [safeHoten, sdt, hashPassword(matkhau)];
        connection.query(insertSql, values, (err2, result) => {
          if (err2) {
            console.error("Lỗi khi thêm khách hàng:", err2);
            return connection.rollback(() => {
              connection.release();
              res.status(500).json({ message: "Đăng ký thất bại!" });
            });
          }

          const newCustomerId = result.insertId;
          const insertHoSoSql = "INSERT INTO HOSOYTE (idKH) VALUES (?)";
          connection.query(insertHoSoSql, [newCustomerId], (err3) => {
            if (err3) {
              console.error("Lỗi khi tạo hồ sơ y tế:", err3);
              return connection.rollback(() => {
                connection.release();
                res.status(500).json({ message: "Đăng ký thất bại do không tạo được hồ sơ y tế!" });
              });
            }

            connection.commit((commitErr) => {
              if (commitErr) {
                return connection.rollback(() => {
                  connection.release();
                  res.status(500).json({ message: "Đăng ký thất bại!" });
                });
              }
              connection.release();
              logActivity("ĐĂNG KÝ", `Khách hàng mới: ${safeHoten} (SĐT: ${sdt})`, newCustomerId);
              res.json({ message: "Đăng ký thành công!" });
            });
          });
        });
      });
    });
  });
});


// ================== API ĐĂNG NHẬP ==================
app.post("/login", rateLimitLogin, (req, res) => {
  const { sdt, matkhau } = req.body;

  if (!sdt || !matkhau) {
    return res.status(400).json({ message: "Vui lòng nhập số điện thoại và mật khẩu!" });
  }
  const errorMsg = "Số điện thoại hoặc mật khẩu không đúng!";

  if (!/^[0-9]{10,11}$/.test(sdt)) {
    req.recordFailedAttempt();
    return res.status(401).json({ message: errorMsg });
  }

  // Kiểm tra admin trước
  const sqlAdmin = "SELECT idQTV, sdtQTV, matKhauQTV FROM QUANTRIVIEN WHERE sdtQTV = ? LIMIT 1";
  db.query(sqlAdmin, [sdt], (err, adminResults) => {
    if (err) return res.status(500).json({ message: "Lỗi máy chủ!" });

    if (adminResults.length > 0 && verifyPassword(matkhau, adminResults[0].matKhauQTV)) {
      req.clearFailedAttempts();
      const token = generateToken({ id: adminResults[0].idQTV, sdt: sdt, role: "admin" });
      if (!isHashedPassword(adminResults[0].matKhauQTV)) {
        upgradePasswordIfNeeded("QUANTRIVIEN", "matKhauQTV", "idQTV", adminResults[0].idQTV, matkhau);
      }
      logActivity("ĐĂNG NHẬP ADMIN", `Admin đăng nhập (SĐT: ${sdt})`, adminResults[0].idQTV);

      return res.json({
        message: "Đăng nhập thành công!",
        isAdmin: true,
        token: token,
        admin: {
          idQTV: adminResults[0].idQTV,
          sdt: adminResults[0].sdtQTV,
        },
      });
    }

    // Nếu không phải admin, kiểm tra khách hàng
    const sqlUser = "SELECT idKH, hoTen, sdt, matKhau FROM KHACHHANG WHERE sdt = ? LIMIT 1";
    db.query(sqlUser, [sdt], (err2, userResults) => {
      if (err2) return res.status(500).json({ message: "Lỗi máy chủ!" });

      if (userResults.length === 0 || !verifyPassword(matkhau, userResults[0].matKhau)) {
        req.recordFailedAttempt();
        return res.status(401).json({ message: errorMsg });
      }

      req.clearFailedAttempts();
      const token = generateToken({ id: userResults[0].idKH, sdt: sdt, role: "customer" });
      if (!isHashedPassword(userResults[0].matKhau)) {
        upgradePasswordIfNeeded("KHACHHANG", "matKhau", "idKH", userResults[0].idKH, matkhau);
      }
      logActivity("ĐĂNG NHẬP", `Khách hàng đăng nhập (SĐT: ${sdt})`, userResults[0].idKH);

      res.json({
        message: "Đăng nhập thành công!",
        isAdmin: false,
        token: token,
        user: {
          idKH: userResults[0].idKH,
          hoTen: userResults[0].hoTen,
          sdt: userResults[0].sdt,
        },
      });
    });
  });
});


// ================== API KHOA (PUBLIC GET) ==================

// 📌 Lấy danh sách khoa (public - cho trang đặt lịch)
app.get("/api/khoa", (req, res) => {
  const sql = "SELECT idKhoa, tenKhoa FROM KHOA ORDER BY tenKhoa ASC";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy danh sách khoa:", err);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy khoa" });
    }
    res.json(results);
  });
});

// 📌 Lấy danh sách bác sĩ theo khoa (public)
app.get("/api/bacsi/:idKhoa", (req, res) => {
  const idKhoa = req.params.idKhoa;
  if (!isValidId(idKhoa)) return res.status(400).json({ message: "ID khoa không hợp lệ!" });

  const sql = `SELECT idBacSi, hoTenBacSi, hocVi FROM BACSI WHERE idKhoa = ?`;
  db.query(sql, [idKhoa], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy danh sách bác sĩ:", err);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy bác sĩ" });
    }
    res.json(results);
  });
});

// API lấy tất cả bác sĩ (public)
app.get("/api/bacsi-all", (req, res) => {
  const sql = `SELECT idBacSi, hoTenBacSi, hocVi, idKhoa FROM BACSI`;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy tất cả bác sĩ:", err);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy bác sĩ" });
    }
    res.json(results);
  });
});

// 📋 Lấy danh sách bác sĩ (public - không cần param)
app.get("/api/bacsi", (req, res) => {
  const sql = "SELECT idBacSi, hoTenBacSi FROM BACSI";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy danh sách bác sĩ:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách bác sĩ!" });
    }
    res.json(results);
  });
});

// 📋 Lấy danh sách bác sĩ theo khoa (endpoint phụ)
app.get("/api/bacsi/khoa/:idKhoa", (req, res) => {
  const { idKhoa } = req.params;
  if (!isValidId(idKhoa)) return res.status(400).json({ message: "ID khoa không hợp lệ!" });

  const sql = "SELECT idBacSi, hoTenBacSi FROM BACSI WHERE idKhoa = ?";
  db.query(sql, [idKhoa], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy bác sĩ theo khoa:", err);
      return res.status(500).json({ message: "Lỗi khi lấy bác sĩ theo khoa!" });
    }
    res.json(results);
  });
});

// Lấy các khung giờ đã được đặt của một bác sĩ theo ngày
app.get("/api/lich-da-dat", (req, res) => {
  const { bacsi, ngay } = req.query;
  if (!isValidId(bacsi)) return res.status(400).json({ message: "ID bác sĩ không hợp lệ!" });

  const formattedNgay = normalizeDateInput(String(ngay || ""), true);
  if (!formattedNgay) return res.status(400).json({ message: "Ngày khám không hợp lệ!" });

  const sql = `
    SELECT gioKham
    FROM LICHKHAM
    WHERE idBacSi = ? AND ngayKham = ? AND LOWER(trangThai) <> 'đã hủy'
  `;
  db.query(sql, [bacsi, formattedNgay], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy giờ đã đặt:", err);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy giờ đã đặt!" });
    }
    res.json(results.map(row => toDisplayTime(row.gioKham)));
  });
});


// ================== API ĐẶT LỊCH KHÁM (KHÁCH HÀNG - CẦN XÁC THỰC) ==================

app.post("/api/dat-lich", authenticateToken, (req, res) => {
  let { hoTen, lyDo, idBacSi, idKhoa, ngayKham, gioKham } = req.body;

  if (req.user.role !== "customer") {
    return res.status(403).json({ message: "Chỉ tài khoản khách hàng được đặt lịch qua chức năng này!" });
  }

  if (!hoTen || !idBacSi || !ngayKham || !gioKham) {
    return res.status(400).json({ message: "Thiếu thông tin đặt lịch!" });
  }

  // IDOR FIX: Bắt buộc dùng idKH từ token
  const idKH = req.user.id;

  hoTen = escapeHtml(hoTen);
  lyDo = escapeHtml(lyDo || "");

  if (!isValidId(idBacSi)) return res.status(400).json({ message: "ID bác sĩ không hợp lệ!" });

  const formattedNgay = normalizeDateInput(ngayKham, true);
  if (!formattedNgay) return res.status(400).json({ message: "Ngày không hợp lệ!" });

  if (isPastDate(formattedNgay)) {
    return res.status(400).json({ message: "Không thể đặt lịch khám trong quá khứ!" });
  }

  const formattedGio = normalizeTimeInput(gioKham);
  if (!formattedGio) return res.status(400).json({ message: "Giờ không hợp lệ!" });

  // Nếu client không gửi idKhoa (chọn "Tất cả chuyên khoa"), lấy từ bác sĩ
  const resolveDoctorSql = isValidId(idKhoa)
    ? "SELECT idBacSi, idKhoa FROM BACSI WHERE idBacSi = ? AND idKhoa = ?"
    : "SELECT idBacSi, idKhoa FROM BACSI WHERE idBacSi = ?";
  const resolveParams = isValidId(idKhoa) ? [idBacSi, idKhoa] : [idBacSi];

  db.getConnection((connErr, connection) => {
    if (connErr) return res.status(500).json({ message: "Lỗi kết nối máy chủ!" });

    connection.beginTransaction((txErr) => {
      if (txErr) {
        connection.release();
        return res.status(500).json({ message: "Đặt lịch thất bại!" });
      }

      connection.query(resolveDoctorSql, resolveParams, (errBsKhoa, bsKhoaResult) => {
        if (errBsKhoa) {
          return connection.rollback(() => {
            connection.release();
            res.status(500).json({ message: "Lỗi kiểm tra bác sĩ!" });
          });
        }
        if (bsKhoaResult.length === 0) {
          return connection.rollback(() => {
            connection.release();
            res.status(400).json({ message: "Bác sĩ không thuộc khoa đã chọn hoặc không tồn tại!" });
          });
        }

        const resolvedIdKhoa = bsKhoaResult[0].idKhoa;

        const checkDuplicate = `
          SELECT idLichKham FROM LICHKHAM
          WHERE idBacSi = ? AND ngayKham = ? AND gioKham = ? AND LOWER(trangThai) <> 'đã hủy'
          FOR UPDATE
        `;
        connection.query(checkDuplicate, [idBacSi, formattedNgay, formattedGio], (errDup, dupResult) => {
          if (errDup) {
            return connection.rollback(() => {
              connection.release();
              res.status(500).json({ message: "Lỗi kiểm tra trùng lịch!" });
            });
          }
          if (dupResult.length > 0) {
            return connection.rollback(() => {
              connection.release();
              res.status(400).json({ message: "Bác sĩ đã có lịch khám vào khung giờ này! Vui lòng chọn giờ khác." });
            });
          }

          const insertSql = `
            INSERT INTO LICHKHAM (hoTen, lyDo, ngayKham, gioKham, idKH, idBacSi, idKhoa, trangThai)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'chờ xác nhận')
          `;
          connection.query(
            insertSql,
            [hoTen, lyDo || null, formattedNgay, formattedGio, idKH, idBacSi, resolvedIdKhoa],
            (err, result) => {
              if (err) {
                console.error("❌ Lỗi khi insert LICHKHAM:", err);
                return connection.rollback(() => {
                  connection.release();
                  res.status(500).json({ message: "Đặt lịch thất bại!" });
                });
              }

              connection.commit((commitErr) => {
                if (commitErr) {
                  return connection.rollback(() => {
                    connection.release();
                    res.status(500).json({ message: "Đặt lịch thất bại!" });
                  });
                }
                connection.release();
                logActivity("ĐẶT LỊCH KHÁM", `Bệnh nhân ${hoTen} đặt lịch ngày ${formattedNgay}`, idKH);
                res.json({ success: true, message: "Đặt lịch khám thành công!", idLichKham: result.insertId });
              });
            }
          );
        });
      });
    });
  });
});


// ================== API LẤY & HỦY LỊCH KHÁM (KHÁCH HÀNG) ==================

// 📍 Lấy danh sách lịch của user - CẦN XÁC THỰC + IDOR FIX
app.get("/api/lich-user/:idKH", authenticateToken, (req, res) => {
  const idKH = req.params.idKH;
  if (!isValidId(idKH)) return res.status(400).json({ message: "ID không hợp lệ!" });

  // ✅ IDOR FIX: Chỉ xem được lịch của chính mình
  if (req.user.role !== "admin" && !sameId(req.user.id, idKH)) {
    return res.status(403).json({ message: "Bạn không có quyền xem lịch khám của người khác!" });
  }

  const sql = `
    SELECT l.idLichKham, l.hoTen, l.lyDo, l.ngayKham, l.gioKham,
           l.idBacSi, l.idKhoa,
           b.hoTenBacSi AS tenBacSi,
           k.tenKhoa AS tenKhoa,
           l.trangThai
    FROM LICHKHAM l
    JOIN BACSI b ON l.idBacSi = b.idBacSi
    JOIN KHOA k ON l.idKhoa = k.idKhoa
    WHERE l.idKH = ?
    ORDER BY l.ngayKham DESC
  `;
  db.query(sql, [idKH], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy lịch khám:", err);
      return res.status(500).json({ message: "Lỗi máy chủ!" });
    }
    res.json(results);
  });
});

// ✅ Hủy lịch - CẦN XÁC THỰC + IDOR FIX
app.post("/api/huy-lich", authenticateToken, (req, res) => {
  const { idLichKham } = req.body;
  if (!idLichKham) return res.status(400).json({ success: false, message: "Thiếu idLichKham!" });
  if (!isValidId(idLichKham)) return res.status(400).json({ success: false, message: "ID lịch khám không hợp lệ!" });

  const sqlGetInfo = `
    SELECT lk.idKH, lk.ngayKham, lk.trangThai, kh.hoTen 
    FROM LICHKHAM lk
    JOIN KHACHHANG kh ON lk.idKH = kh.idKH
    WHERE lk.idLichKham = ?
  `;
  db.query(sqlGetInfo, [idLichKham], (err, results) => {
    if (err) {
      console.error("❌ Lỗi truy vấn thông tin hủy lịch:", err);
      return res.status(500).json({ success: false, message: "Lỗi máy chủ khi hủy lịch!" });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy lịch khám!" });
    }

    const { hoTen, idKH, ngayKham, trangThai } = results[0];

    // ✅ IDOR FIX: Chỉ hủy được lịch của chính mình (hoặc admin)
    if (req.user.role !== "admin" && !sameId(req.user.id, idKH)) {
      return res.status(403).json({ success: false, message: "Bạn không có quyền hủy lịch khám của người khác!" });
    }
    if (String(trangThai || "").toLowerCase() === "đã hủy") {
      return res.status(400).json({ success: false, message: "Lịch khám này đã được hủy trước đó!" });
    }
    if (ngayKham && isPastDate(String(ngayKham).slice(0, 10))) {
      return res.status(400).json({ success: false, message: "Không thể hủy lịch khám đã qua ngày!" });
    }

    const sqlUpdate = `UPDATE LICHKHAM SET trangThai = 'đã hủy' WHERE idLichKham = ?`;
    db.query(sqlUpdate, [idLichKham], (errUpdate) => {
      if (errUpdate) {
        console.error("❌ Lỗi cập nhật hủy lịch:", errUpdate);
        return res.status(500).json({ success: false, message: "Hủy lịch thất bại!" });
      }
      logActivity("HỦY LỊCH", `Bệnh nhân ${hoTen} hủy lịch khám #${idLichKham}`, idKH);
      res.json({ success: true, message: "✅ Hủy lịch thành công!" });
    });
  });
});


// ================== API HỒ SƠ Y TẾ (KHÁCH HÀNG) ==================

// ✅ Xem hồ sơ y tế - CẦN XÁC THỰC + IDOR FIX
app.get("/hosoyte/:idKH", authenticateToken, (req, res) => {
  const idKH = req.params.idKH;
  if (!isValidId(idKH)) return res.status(400).json({ message: "ID không hợp lệ!" });

  // ✅ IDOR FIX: Chỉ xem được hồ sơ của chính mình
  if (req.user.role !== "admin" && !sameId(req.user.id, idKH)) {
    return res.status(403).json({ message: "Bạn không có quyền xem hồ sơ y tế của người khác!" });
  }

  const khSql = `
    SELECT idKH, hoTen, sdt, gioiTinh, ngayThangNamSinh,
           cccd, cccd AS CCCD, diaChi, diaChi AS diachi
    FROM KHACHHANG
    WHERE idKH = ?
  `;
  db.query(khSql, [idKH], (err, khResults) => {
    if (err) return res.status(500).json({ message: "Lỗi server!" });
    if (khResults.length === 0) return res.json({ benhnhan: null, lichsu: [] });

    const benhnhan = khResults[0];
    const hsSql = "SELECT idHoSoYTe, idKH FROM HOSOYTE WHERE idKH = ?";
    db.query(hsSql, [idKH], (err2, hsResults) => {
      if (err2) return res.status(500).json({ message: "Lỗi server!" });
      if (hsResults.length === 0) return res.json({ benhnhan, lichsu: [] });

      const hoSoYTe = hsResults[0];
      const lsSql = `
        SELECT l.ngayKham, b.hoTenBacSi AS bacSi, k.tenKhoa AS khoa, l.ketLuan, l.chiTiet
        FROM LICHSUKHAMBENH l
        JOIN BACSI b ON l.idBacSi = b.idBacSi
        JOIN KHOA k ON l.idKhoa = k.idKhoa
        WHERE l.idHoSoYTe = ?
        ORDER BY l.ngayKham DESC
      `;
      db.query(lsSql, [hoSoYTe.idHoSoYTe], (err3, lsResults) => {
        if (err3) return res.status(500).json({ message: "Lỗi server!" });
        res.json({ benhnhan, lichsu: lsResults });
      });
    });
  });
});


// ================== API THÔNG TIN KHÁCH HÀNG (CẦN XÁC THỰC + IDOR FIX) ==================

// ✅ Lấy thông tin khách hàng
app.get("/api/khachhang/:idKH", authenticateToken, (req, res) => {
  const idKH = req.params.idKH;
  if (!isValidId(idKH)) return res.status(400).json({ message: "ID không hợp lệ!" });

  // ✅ IDOR FIX
  if (req.user.role !== "admin" && !sameId(req.user.id, idKH)) {
    return res.status(403).json({ message: "Bạn không có quyền xem thông tin khách hàng khác!" });
  }

  const sql = `
    SELECT idKH, hoTen, sdt, gioiTinh AS gioitinh, ngayThangNamSinh, cccd, diaChi AS diachi
    FROM KHACHHANG WHERE idKH = ?
  `;
  db.query(sql, [idKH], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy thông tin khách hàng:", err);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy thông tin!" });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy khách hàng!" });
    }
    res.json(results[0]);
  });
});

// ✅ Cập nhật thông tin khách hàng
app.put("/api/khachhang/:idKH", authenticateToken, (req, res) => {
  const idKH = req.params.idKH;
  if (!isValidId(idKH)) return res.status(400).json({ message: "ID không hợp lệ!" });

  // ✅ IDOR FIX
  if (req.user.role !== "admin" && !sameId(req.user.id, idKH)) {
    return res.status(403).json({ message: "Bạn không có quyền cập nhật hồ sơ của người khác!" });
  }

  const { hoTen, gioitinh, ngayThangNamSinh, cccd, diachi } = req.body;

  if (!hoTen) {
    return res.status(400).json({ message: "Họ tên không được để trống!" });
  }

  // Escape XSS
  const safeHoTen = escapeHtml(hoTen);
  const safeDiaChi = escapeHtml(diachi || "");

  let formattedNgaySinh = null;
  if (ngayThangNamSinh) {
    formattedNgaySinh = normalizeDateInput(String(ngayThangNamSinh), false);
    if (!formattedNgaySinh) {
      return res.status(400).json({ message: "Ngày sinh không hợp lệ!" });
    }
  }

  if (cccd && !/^\d{9,12}$/.test(String(cccd))) {
    return res.status(400).json({ message: "CCCD/CMND không hợp lệ (9–12 số)!" });
  }

  const sql = `
    UPDATE KHACHHANG
    SET hoTen = ?, gioiTinh = ?, ngayThangNamSinh = ?, cccd = ?, diaChi = ?
    WHERE idKH = ?
  `;
  const values = [safeHoTen, gioitinh || null, formattedNgaySinh, cccd || null, safeDiaChi || null, idKH];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("❌ Lỗi khi cập nhật khách hàng:", err);
      return res.status(500).json({ message: "Cập nhật thông tin thất bại!" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy khách hàng để cập nhật!" });
    }
    logActivity("CẬP NHẬT HỒ SƠ", `Khách hàng ID ${idKH} cập nhật hồ sơ`);
    res.json({ success: true, message: "Cập nhật thông tin thành công!" });
  });
});

// ✅ Đổi mật khẩu
app.put("/api/khachhang/:idKH/changepassword", authenticateToken, (req, res) => {
  const idKH = req.params.idKH;
  if (!isValidId(idKH)) return res.status(400).json({ message: "ID không hợp lệ!" });

  // ✅ IDOR FIX: Chỉ chủ tài khoản mới được đổi mật khẩu
  if (!sameId(req.user.id, idKH) || req.user.role !== "customer") {
    return res.status(403).json({ message: "Bạn không có quyền đổi mật khẩu tài khoản khác!" });
  }

  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: "Thiếu dữ liệu" });
  }

  if (!hasStrongPassword(newPassword)) {
    return res.status(400).json({ message: "Mật khẩu mới phải có ít nhất 8 ký tự, gồm cả chữ và số!" });
  }

  const sqlGet = "SELECT matKhau FROM KHACHHANG WHERE idKH = ?";
  db.query(sqlGet, [idKH], (err, results) => {
    if (err) return res.status(500).json({ message: "Lỗi server" });
    if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy khách hàng" });

    const currentPass = results[0].matKhau;
    if (!verifyPassword(oldPassword, currentPass)) {
      return res.status(400).json({ field: "oldPassword", message: "Mật khẩu cũ không đúng" });
    }
    if (oldPassword === newPassword) {
      return res.status(400).json({ message: "Mật khẩu mới phải khác mật khẩu cũ" });
    }

    const sqlUpdate = "UPDATE KHACHHANG SET matKhau = ? WHERE idKH = ?";
    db.query(sqlUpdate, [hashPassword(newPassword), idKH], (err2) => {
      if (err2) return res.status(500).json({ message: "Cập nhật mật khẩu thất bại" });
      res.json({ success: true, message: "Đổi mật khẩu thành công!" });
    });
  });
});


// ================== API QUẢN LÝ TÀI KHOẢN (ADMIN) ==================

// 📋 Lấy danh sách tài khoản khách hàng
app.get("/api/taikhoan", authenticateToken, requireAdmin, (req, res) => {
  const sql = "SELECT idKH, hoTen, gioiTinh, sdt FROM KHACHHANG ORDER BY idKH DESC";
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy danh sách tài khoản:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách tài khoản!" });
    }
    res.json(results);
  });
});

// 🗑️ Xóa tài khoản khách hàng (có kiểm tra dây chuyền)
app.delete("/api/taikhoan/:idKH", authenticateToken, requireAdmin, (req, res) => {
  const { idKH } = req.params;
  if (!isValidId(idKH)) return res.status(400).json({ message: "ID không hợp lệ!" });
  const { force } = req.query;

  const sqlKH = "SELECT idKH FROM KHACHHANG WHERE idKH = ?";
  db.query(sqlKH, [idKH], (err, khRes) => {
    if (err) return res.status(500).json({ message: "Lỗi khi kiểm tra khách hàng!" });
    if (khRes.length === 0) return res.status(404).json({ message: "Không tìm thấy tài khoản khách hàng!" });

    const sqlCheck = `
      SELECT 
        (SELECT COUNT(*) FROM LICHSUKHAMBENH lsu 
          JOIN HOSOYTE h ON lsu.idHoSoYTe = h.idHoSoYTe 
          WHERE h.idKH = ?) AS lichsuCount,
        (SELECT COUNT(*) FROM LICHKHAM WHERE idKH = ?) AS lichCount,
        (SELECT COUNT(*) FROM HOSOYTE WHERE idKH = ?) AS hosoCount
    `;
    db.query(sqlCheck, [idKH, idKH, idKH], (err2, checkRes) => {
      if (err2) return res.status(500).json({ message: "Lỗi khi kiểm tra dữ liệu liên quan!" });
      const { lichsuCount, lichCount, hosoCount } = checkRes[0];

      if ((lichsuCount > 0 || lichCount > 0 || hosoCount > 0) && force !== "true") {
        let msg = `⚠️ Tài khoản ID ${idKH} có dữ liệu liên kết:\n`;
        if (hosoCount > 0) msg += `- ${hosoCount} hồ sơ y tế\n`;
        if (lichsuCount > 0) msg += `- ${lichsuCount} lịch sử khám bệnh\n`;
        if (lichCount > 0) msg += `- ${lichCount} lịch khám\n`;
        msg += "\nBạn có muốn xóa toàn bộ dữ liệu này không?";
        return res.json({ requireConfirm: true, message: msg, details: { lichsuCount, lichCount, hosoCount } });
      }

      const delLichSu = `DELETE lsu FROM LICHSUKHAMBENH lsu JOIN HOSOYTE h ON lsu.idHoSoYTe = h.idHoSoYTe WHERE h.idKH = ?`;
      const delLichKham = `DELETE FROM LICHKHAM WHERE idKH = ?`;
      const delHoSo = `DELETE FROM HOSOYTE WHERE idKH = ?`;
      const delKH = `DELETE FROM KHACHHANG WHERE idKH = ?`;

      runTransaction([
        { sql: delLichSu, params: [idKH] },
        { sql: delLichKham, params: [idKH] },
        { sql: delHoSo, params: [idKH] },
        { sql: delKH, params: [idKH] },
      ], () => {
        logActivity("Xóa tài khoản", `Admin xóa tài khoản: ${idKH}`);
        res.json({ success: true, message: "🗑️ Đã xóa tài khoản và toàn bộ dữ liệu liên quan!" });
      }, (deleteErr) => {
        console.error("❌ Lỗi khi xóa khách hàng:", deleteErr);
        res.status(500).json({ message: "Lỗi khi xóa khách hàng!" });
      });
    });
  });
});


// ================== API QUẢN LÝ KHOA (ADMIN) ==================

// ➕ Thêm khoa
app.post("/api/khoa", authenticateToken, requireAdmin, (req, res) => {
  const { tenKhoa } = req.body;
  if (!tenKhoa || !tenKhoa.trim()) {
    return res.status(400).json({ message: "Tên khoa không được để trống!" });
  }

  const safeTenKhoa = escapeHtml(tenKhoa.trim());
  const sql = "INSERT INTO KHOA (tenKhoa) VALUES (?)";
  db.query(sql, [safeTenKhoa], (err, result) => {
    if (err) {
      console.error("❌ Lỗi khi thêm khoa:", err);
      return res.status(500).json({ message: "Thêm khoa thất bại!" });
    }
    logActivity("THÊM KHOA", `Admin thêm khoa mới: ${safeTenKhoa}`);
    res.json({ success: true, message: "✅ Thêm khoa thành công!", id: result.insertId });
  });
});

// ✏️ Sửa khoa
app.put("/api/khoa/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID khoa không hợp lệ!" });
  const { tenKhoa } = req.body;
  if (!tenKhoa || !tenKhoa.trim()) {
    return res.status(400).json({ message: "Tên khoa không được để trống!" });
  }

  const safeTenKhoa = escapeHtml(tenKhoa.trim());
  const sql = "UPDATE KHOA SET tenKhoa = ? WHERE idKhoa = ?";
  db.query(sql, [safeTenKhoa, id], (err, result) => {
    if (err) {
      console.error("❌ Lỗi khi cập nhật khoa:", err);
      return res.status(500).json({ message: "Cập nhật khoa thất bại!" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy khoa!" });
    }
    logActivity("CẬP NHẬT KHOA", `Admin cập nhật khoa ID: ${id} thành "${safeTenKhoa}"`);
    res.json({ success: true, message: "✅ Cập nhật khoa thành công!" });
  });
});

// 🗑️ Xóa khoa — có xác nhận & xóa dây chuyền
app.delete("/api/khoa/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID khoa không hợp lệ!" });
  const { force } = req.query;

  const sqlCheck = `
    SELECT b.idBacSi, b.hoTenBacSi,
      (SELECT COUNT(*) FROM LICHKHAM WHERE idBacSi = b.idBacSi) AS lichCount,
      (SELECT COUNT(*) FROM LICHSUKHAMBENH WHERE idBacSi = b.idBacSi) AS lichsuCount
    FROM BACSI b WHERE b.idKhoa = ?
  `;
  db.query(sqlCheck, [id], (err, bacsi) => {
    if (err) {
      console.error("❌ Lỗi khi kiểm tra bác sĩ:", err);
      return res.status(500).json({ message: "Lỗi khi kiểm tra dữ liệu!" });
    }

    if (bacsi.length > 0 && force !== "true") {
      const totalLich = bacsi.reduce((a, b) => a + b.lichCount, 0);
      const totalLS = bacsi.reduce((a, b) => a + b.lichsuCount, 0);
      let msg = `⚠️ Khoa này có ${bacsi.length} bác sĩ.`;
      msg += totalLich > 0 ? `\n- Tổng ${totalLich} lịch khám.` : "";
      msg += totalLS > 0 ? `\n- Tổng ${totalLS} lịch sử khám bệnh.` : "";
      msg += "\n\nBạn có muốn xóa toàn bộ không?";

      return res.json({ requireConfirm: true, message: msg, doctors: bacsi });
    }

    const delLichSu = `DELETE lsu FROM LICHSUKHAMBENH lsu JOIN BACSI b ON lsu.idBacSi = b.idBacSi WHERE b.idKhoa = ?;`;
    const delLich = `DELETE l FROM LICHKHAM l JOIN BACSI b ON l.idBacSi = b.idBacSi WHERE b.idKhoa = ?;`;
    const delBacSi = "DELETE FROM BACSI WHERE idKhoa = ?";
    const delKhoa = "DELETE FROM KHOA WHERE idKhoa = ?";

    runTransaction([
      { sql: delLichSu, params: [id] },
      { sql: delLich, params: [id] },
      { sql: delBacSi, params: [id] },
      { sql: delKhoa, params: [id] },
    ], () => {
      const logMsg = bacsi.length > 0
        ? `Admin xóa khoa ID: ${id} cùng ${bacsi.length} bác sĩ và dữ liệu liên quan`
        : `Admin xóa khoa ID: ${id}`;
      logActivity("XÓA KHOA", logMsg);
      res.json({ success: true, message: "🗑️ Đã xóa khoa và toàn bộ bác sĩ, lịch khám, lịch sử khám liên quan!" });
    }, (deleteErr) => {
      console.error("❌ Lỗi khi xóa khoa:", deleteErr);
      res.status(500).json({ message: "Xóa khoa thất bại!" });
    });
  });
});


// ================== API QUẢN LÝ BÁC SĨ (ADMIN) ==================

// 🔍 Lấy danh sách bác sĩ (có tìm kiếm)
app.get("/api/admin/bacsi", authenticateToken, requireAdmin, (req, res) => {
  const keyword = req.query.q ? `%${req.query.q}%` : "%";
  const sql = `
    SELECT b.idBacSi, b.hoTenBacSi, b.hocVi, b.idKhoa, k.tenKhoa
    FROM BACSI b JOIN KHOA k ON b.idKhoa = k.idKhoa
    WHERE b.hoTenBacSi LIKE ? OR b.hocVi LIKE ? OR k.tenKhoa LIKE ?
    ORDER BY b.idBacSi DESC
  `;
  db.query(sql, [keyword, keyword, keyword], (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy danh sách bác sĩ:", err);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách bác sĩ!" });
    }
    res.json(results);
  });
});

// ➕ Thêm bác sĩ
app.post("/api/admin/bacsi", authenticateToken, requireAdmin, (req, res) => {
  const { hoTenBacSi, hocVi, idKhoa } = req.body;

  if (!hoTenBacSi || !idKhoa) {
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
  }
  if (!isValidId(idKhoa)) return res.status(400).json({ message: "ID khoa không hợp lệ!" });

  const safeHoTen = escapeHtml(String(hoTenBacSi).trim());
  const safeHocVi = escapeHtml(String(hocVi || "").trim());
  const sql = `INSERT INTO BACSI (hoTenBacSi, hocVi, idKhoa) VALUES (?, ?, ?)`;
  db.query("SELECT idKhoa FROM KHOA WHERE idKhoa = ?", [idKhoa], (errKhoa, khoaRows) => {
    if (errKhoa) return res.status(500).json({ message: "Lỗi kiểm tra khoa!" });
    if (khoaRows.length === 0) return res.status(400).json({ message: "Khoa không tồn tại!" });

    db.query(sql, [safeHoTen, safeHocVi, idKhoa], (err, result) => {
      if (err) {
        console.error("❌ Lỗi khi thêm bác sĩ:", err);
        return res.status(500).json({ message: "Thêm bác sĩ thất bại!" });
      }
      logActivity("THÊM BÁC SĨ", `Admin thêm: ${safeHoTen}`);
      res.json({ success: true, message: "Thêm bác sĩ thành công!", id: result.insertId });
    });
  });
});

// ✏️ Cập nhật bác sĩ
app.put("/api/admin/bacsi/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });
  const { hoTenBacSi, hocVi, idKhoa } = req.body;

  if (!hoTenBacSi || !String(hoTenBacSi).trim() || !idKhoa) {
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
  }
  if (!isValidId(idKhoa)) return res.status(400).json({ message: "ID khoa không hợp lệ!" });

  const safeHoTen = escapeHtml(String(hoTenBacSi).trim());
  const safeHocVi = escapeHtml(String(hocVi || "").trim());
  const sql = `UPDATE BACSI SET hoTenBacSi = ?, hocVi = ?, idKhoa = ? WHERE idBacSi = ?`;
  db.query("SELECT idKhoa FROM KHOA WHERE idKhoa = ?", [idKhoa], (errKhoa, khoaRows) => {
    if (errKhoa) return res.status(500).json({ message: "Lỗi kiểm tra khoa!" });
    if (khoaRows.length === 0) return res.status(400).json({ message: "Khoa không tồn tại!" });

    db.query(sql, [safeHoTen, safeHocVi, idKhoa, id], (err, result) => {
      if (err) {
        console.error("❌ Lỗi khi cập nhật bác sĩ:", err);
        return res.status(500).json({ message: "Cập nhật bác sĩ thất bại!" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Không tìm thấy bác sĩ!" });
      }
      logActivity("CẬP NHẬT BÁC SĨ", `Admin cập nhật bác sĩ ID ${id}: ${safeHoTen}`);
      res.json({ success: true, message: "Cập nhật bác sĩ thành công!" });
    });
  });
});
// 🗑️ Xóa bác sĩ
app.delete("/api/admin/bacsi/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });
  const { force } = req.query;

  const checkBacSi = "SELECT idBacSi FROM BACSI WHERE idBacSi = ?";
  db.query(checkBacSi, [id], (err, bsResult) => {
    if (err) return res.status(500).json({ message: "Lỗi kiểm tra bác sĩ!" });
    if (bsResult.length === 0) return res.status(404).json({ message: "Không tìm thấy bác sĩ!" });

    const sqlCheck = `
      SELECT 
        (SELECT COUNT(*) FROM LICHSUKHAMBENH WHERE idBacSi = ?) AS lichsuCount,
        (SELECT COUNT(*) FROM LICHKHAM WHERE idBacSi = ?) AS lichCount
    `;
    db.query(sqlCheck, [id, id], (err2, countResult) => {
      if (err2) {
        console.error("❌ Lỗi kiểm tra ràng buộc bác sĩ:", err2);
        return res.status(500).json({ message: "Lỗi khi kiểm tra dữ liệu liên quan!" });
      }

      const { lichsuCount, lichCount } = countResult[0];

      if ((lichsuCount > 0 || lichCount > 0) && force !== "true") {
        return res.json({
          requireConfirm: true,
          message: `⚠️ Bác sĩ này có ${lichCount} lịch khám và ${lichsuCount} lịch sử khám. Bạn có muốn xóa toàn bộ không?`
        });
      }

      const delLich = "DELETE FROM LICHKHAM WHERE idBacSi = ?";
      const delLichSu = "DELETE FROM LICHSUKHAMBENH WHERE idBacSi = ?";
      const delBacSi = "DELETE FROM BACSI WHERE idBacSi = ?";
      runTransaction([
        { sql: delLich, params: [id] },
        { sql: delLichSu, params: [id] },
        { sql: delBacSi, params: [id] },
      ], () => {
        logActivity("XÓA BÁC SĨ", `Admin xóa bác sĩ ID: ${id}` + (lichsuCount > 0 || lichCount > 0 ? ` (cùng ${lichCount} lịch khám và ${lichsuCount} lịch sử khám)` : ''));
        res.json({
          success: true,
          message: lichsuCount > 0 || lichCount > 0
            ? "🗑️ Đã xóa bác sĩ và toàn bộ lịch khám, lịch sử khám liên quan!"
            : "🗑️ Đã xóa bác sĩ thành công!"
        });
      }, (deleteErr) => {
        console.error("❌ Lỗi khi xóa bác sĩ:", deleteErr);
        res.status(500).json({ message: "Xóa bác sĩ thất bại!" });
      });
    });
  });
});


// ================== API QUẢN LÝ LỊCH KHÁM (ADMIN) ==================

// ✅ Kiểm tra khách hàng tồn tại
app.get("/api/admin/khachhang/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ exists: false, message: "ID không hợp lệ!" });
  const sql = "SELECT idKH FROM KHACHHANG WHERE idKH = ?";
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).json({ exists: false, message: "Lỗi khi kiểm tra khách hàng!" });
    res.json({ exists: result.length > 0 });
  });
});

// 📋 Lấy tất cả lịch khám
app.get("/api/admin/lichkham", authenticateToken, requireAdmin, (req, res) => {
  const sql = `
    SELECT l.idLichKham, l.idKH, l.hoTen, l.lyDo, l.ngayKham, l.gioKham, l.trangThai,
           b.hoTenBacSi AS tenBacSi, k.tenKhoa AS tenKhoa
    FROM LICHKHAM l
    JOIN BACSI b ON l.idBacSi = b.idBacSi
    JOIN KHOA k ON l.idKhoa = k.idKhoa
    ORDER BY l.ngayKham DESC, l.gioKham ASC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy danh sách lịch khám:", err);
      return res.status(500).json({ message: "Lỗi máy chủ khi lấy lịch khám!" });
    }
    res.json(results);
  });
});

// ➕ Thêm lịch khám (Admin thêm trực tiếp)
app.post("/api/admin/lichkham", authenticateToken, requireAdmin, (req, res) => {
  const { idKH, hoTen, lyDo, ngayKham, gioKham, idBacSi, idKhoa } = req.body;

  if (!idKH || !hoTen || !String(hoTen).trim() || !ngayKham || !gioKham || !idBacSi || !idKhoa) {
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc!" });
  }
  if (!isValidId(idKH) || !isValidId(idBacSi) || !isValidId(idKhoa)) {
    return res.status(400).json({ message: "ID không hợp lệ!" });
  }

  const formattedNgay = normalizeDateInput(ngayKham, false);
  if (!formattedNgay) return res.status(400).json({ message: "Ngày khám không hợp lệ!" });
  if (isPastDate(formattedNgay)) {
    return res.status(400).json({ message: "Không thể thêm lịch khám trong quá khứ!" });
  }
  const formattedGio = normalizeTimeInput(gioKham);
  if (!formattedGio) return res.status(400).json({ message: "Giờ khám không hợp lệ!" });

  const safeHoTen = escapeHtml(String(hoTen).trim());
  const safeLyDo = escapeHtml(lyDo || "");

  const checkKH = "SELECT idKH FROM KHACHHANG WHERE idKH = ?";
  db.query(checkKH, [idKH], (err, result) => {
    if (err) return res.status(500).json({ message: "Lỗi kiểm tra khách hàng!" });
    if (result.length === 0) {
      return res.status(400).json({ message: "❌ ID khách hàng không tồn tại!" });
    }

    const checkBacSiKhoa = "SELECT idBacSi FROM BACSI WHERE idBacSi = ? AND idKhoa = ?";
    db.query(checkBacSiKhoa, [idBacSi, idKhoa], (err2, bsRows) => {
      if (err2) return res.status(500).json({ message: "Lỗi kiểm tra bác sĩ!" });
      if (bsRows.length === 0) {
        return res.status(400).json({ message: "Bác sĩ không thuộc khoa đã chọn!" });
      }

      const checkDuplicate = "SELECT idLichKham FROM LICHKHAM WHERE idBacSi = ? AND ngayKham = ? AND gioKham = ? AND LOWER(trangThai) <> 'đã hủy'";
      db.query(checkDuplicate, [idBacSi, formattedNgay, formattedGio], (err3, dupRows) => {
        if (err3) return res.status(500).json({ message: "Lỗi kiểm tra trùng lịch!" });
        if (dupRows.length > 0) {
          return res.status(400).json({ message: "Bác sĩ đã có lịch khám vào khung giờ này!" });
        }

        const sql = `
          INSERT INTO LICHKHAM (hoTen, lyDo, ngayKham, gioKham, idKH, idBacSi, idKhoa, trangThai)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'chờ xác nhận')
        `;
        db.query(sql, [safeHoTen, safeLyDo || null, formattedNgay, formattedGio, idKH, idBacSi, idKhoa], (err4) => {
          if (err4) {
            console.error("❌ Lỗi khi thêm lịch khám:", err4);
            return res.status(500).json({ message: "Thêm lịch khám thất bại!" });
          }
          logActivity("THÊM LỊCH (ADMIN)", `Admin đặt lịch khám cho: ${safeHoTen} (ID KH: ${idKH})`);
          res.json({ success: true, message: "✅ Thêm lịch khám thành công!" });
        });
      });
    });
  });
});

// ✏️ Cập nhật trạng thái lịch khám
app.put("/api/admin/lichkham/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });
  const trangThai = typeof req.body.trangThai === "string" ? req.body.trangThai.trim().toLowerCase() : "";
  if (!["chờ xác nhận", "đã xác nhận", "đã hủy"].includes(trangThai)) {
    return res.status(400).json({ message: "Trạng thái không hợp lệ!" });
  }

  const sql = "UPDATE LICHKHAM SET trangThai = ? WHERE idLichKham = ?";
  db.query(sql, [trangThai, id], (err, result) => {
    if (err) {
      console.error("❌ Lỗi khi cập nhật lịch khám:", err);
      return res.status(500).json({ message: "Cập nhật thất bại!" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy lịch khám!" });
    }

    const sqlHoTen = `
      SELECT KH.hoTen FROM LICHKHAM LK
      JOIN KHACHHANG KH ON LK.idKH = KH.idKH
      WHERE LK.idLichKham = ?
    `;
    db.query(sqlHoTen, [id], (err2, rows) => {
      let hoTen = "Không rõ";
      if (!err2 && rows.length > 0) hoTen = rows[0].hoTen;
      logActivity("CẬP NHẬT LỊCH", `Admin cập nhật lịch khám ${hoTen} → ${trangThai}`);
      res.json({ success: true, message: "✅ Cập nhật trạng thái thành công!" });
    });
  });
});

// 🗑️ Xóa lịch khám
app.delete("/api/admin/lichkham/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });

  const sqlHoTen = `
    SELECT KH.hoTen FROM LICHKHAM LK
    JOIN KHACHHANG KH ON LK.idKH = KH.idKH
    WHERE LK.idLichKham = ?
  `;
  db.query(sqlHoTen, [id], (err1, rows) => {
    let hoTen = "Không rõ";
    if (!err1 && rows.length > 0) hoTen = rows[0].hoTen;

    const sql = "DELETE FROM LICHKHAM WHERE idLichKham = ?";
    db.query(sql, [id], (err, result) => {
      if (err) {
        console.error("❌ Lỗi khi xóa lịch khám:", err);
        return res.status(500).json({ message: "Xóa lịch khám thất bại!" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Không tìm thấy lịch khám!" });
      }
      logActivity("XÓA LỊCH KHÁM", `Admin xóa lịch khám của: ${hoTen}`);
      res.json({ success: true, message: "🗑️ Xóa lịch khám thành công!" });
    });
  });
});


// ================== API QUẢN LÝ HỒ SƠ Y TẾ (ADMIN) ==================

// 📋 Lấy danh sách hồ sơ y tế
app.get("/api/admin/hosoyte", authenticateToken, requireAdmin, (req, res) => {
  const sql = `
    SELECT h.idHoSoYTe, k.idKH
    FROM HOSOYTE h
    JOIN KHACHHANG k ON h.idKH = k.idKH
    ORDER BY h.idHoSoYTe DESC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy danh sách hồ sơ:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách hồ sơ y tế!" });
    }
    res.json(results);
  });
});

// ➕ Thêm hồ sơ y tế mới
app.post("/api/admin/hosoyte", authenticateToken, requireAdmin, (req, res) => {
  const { idKH } = req.body;
  if (!idKH) return res.status(400).json({ message: "Vui lòng nhập ID khách hàng!" });
  if (!isValidId(idKH)) return res.status(400).json({ message: "ID không hợp lệ!" });

  const checkKH = "SELECT idKH FROM KHACHHANG WHERE idKH = ?";
  db.query(checkKH, [idKH], (err, khResults) => {
    if (err) return res.status(500).json({ message: "Lỗi máy chủ!" });
    if (khResults.length === 0) return res.status(400).json({ message: "❌ Khách hàng không tồn tại!" });

    const checkHS = "SELECT idHoSoYTe FROM HOSOYTE WHERE idKH = ?";
    db.query(checkHS, [idKH], (err2, hsResults) => {
      if (err2) return res.status(500).json({ message: "Lỗi kiểm tra hồ sơ!" });
      if (hsResults.length > 0) return res.status(400).json({ message: "⚠️ Khách hàng này đã có hồ sơ y tế!" });

      const insertSql = "INSERT INTO HOSOYTE (idKH) VALUES (?)";
      db.query(insertSql, [idKH], (err3) => {
        if (err3) {
          console.error("❌ Lỗi khi thêm hồ sơ:", err3);
          return res.status(500).json({ message: "Thêm hồ sơ thất bại!" });
        }
        logActivity("THÊM HỒ SƠ", `Admin tạo hồ sơ y tế cho: ID: ${idKH}`);
        res.json({ success: true, message: "✅ Thêm hồ sơ y tế thành công!" });
      });
    });
  });
});

// 👁️ Xem chi tiết hồ sơ
app.get("/api/admin/hosoyte/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });

  const sql = `
    SELECT h.idHoSoYTe, k.idKH, k.hoTen, k.gioiTinh, k.sdt, k.ngayThangNamSinh, k.diaChi
    FROM HOSOYTE h
    JOIN KHACHHANG k ON h.idKH = k.idKH
    WHERE h.idHoSoYTe = ?
  `;
  db.query(sql, [id], (err, results) => {
    if (err) return res.status(500).json({ message: "Lỗi khi xem hồ sơ!" });
    if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy hồ sơ!" });
    res.json(results[0]);
  });
});

// 🗑️ Xóa hồ sơ y tế
app.delete("/api/admin/hosoyte/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });
  const { force } = req.query;

  const getHoSo = "SELECT idHoSoYTe FROM HOSOYTE WHERE idHoSoYTe = ?";
  db.query(getHoSo, [id], (err, hsResults) => {
    if (err) return res.status(500).json({ message: "Lỗi kiểm tra hồ sơ!" });
    if (hsResults.length === 0) return res.status(404).json({ message: "Không tìm thấy hồ sơ y tế!" });

    const checkLichSu = "SELECT COUNT(*) AS count FROM LICHSUKHAMBENH WHERE idHoSoYTe = ?";
    db.query(checkLichSu, [id], (err2, lsResults) => {
      if (err2) return res.status(500).json({ message: "Lỗi kiểm tra lịch sử khám!" });

      const count = lsResults[0].count;
      if (count > 0 && force !== "true") {
        return res.json({
          requireConfirm: true,
          message: `⚠️ Hồ sơ này có ${count} bản ghi lịch sử khám. Bạn có muốn xóa tất cả không?`,
        });
      }

      const delLichSu = "DELETE FROM LICHSUKHAMBENH WHERE idHoSoYTe = ?";
      const delHS = "DELETE FROM HOSOYTE WHERE idHoSoYTe = ?";
      runTransaction([
        { sql: delLichSu, params: [id] },
        { sql: delHS, params: [id] },
      ], () => {
        const logMsg = count > 0
          ? `Admin xóa hồ sơ y tế #${id} cùng ${count} lịch sử khám bệnh`
          : `Admin xóa hồ sơ y tế #${id}`;
        logActivity("XÓA HỒ SƠ", logMsg);
        res.json({
          success: true,
          message: count > 0
            ? "🗑️ Đã xóa hồ sơ y tế và toàn bộ lịch sử khám liên quan!"
            : "🗑️ Đã xóa hồ sơ y tế thành công!",
        });
      }, (deleteErr) => {
        console.error("❌ Lỗi khi xóa hồ sơ y tế:", deleteErr);
        res.status(500).json({ message: "Lỗi khi xóa hồ sơ y tế!" });
      });
    });
  });
});


// ================== API QUẢN LÝ LỊCH SỬ KHÁM BỆNH (ADMIN) ==================

// 📋 Lấy tất cả lịch sử khám bệnh
app.get("/api/admin/lichsu", authenticateToken, requireAdmin, (req, res) => {
  const sql = `
    SELECT ls.idLS, ls.ngayKham, ls.ketLuan, ls.chiTiet,
           b.hoTenBacSi AS tenBacSi, k.tenKhoa AS tenKhoa, h.idHoSoYTe
    FROM LICHSUKHAMBENH ls
    JOIN BACSI b ON ls.idBacSi = b.idBacSi
    JOIN KHOA k ON ls.idKhoa = k.idKhoa
    JOIN HOSOYTE h ON ls.idHoSoYTe = h.idHoSoYTe
    ORDER BY ls.ngayKham DESC;
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi khi lấy lịch sử khám:", err);
      return res.status(500).json({ message: "Lỗi khi lấy danh sách lịch sử khám!" });
    }
    res.json(results);
  });
});

// 📋 Lấy 1 lịch sử khám bệnh theo ID
app.get("/api/admin/lichsu/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });

  const sql = `
    SELECT ls.idLS, ls.ngayKham, ls.ketLuan, ls.chiTiet,
           ls.idBacSi, ls.idKhoa, ls.idHoSoYTe,
           b.hoTenBacSi AS tenBacSi, k.tenKhoa AS tenKhoa
    FROM LICHSUKHAMBENH ls
    JOIN BACSI b ON ls.idBacSi = b.idBacSi
    JOIN KHOA k ON ls.idKhoa = k.idKhoa
    JOIN HOSOYTE h ON ls.idHoSoYTe = h.idHoSoYTe
    WHERE ls.idLS = ? LIMIT 1
  `;
  db.query(sql, [id], (err, results) => {
    if (err) return res.status(500).json({ message: "Lỗi khi lấy chi tiết lịch sử khám!" });
    if (results.length === 0) return res.status(404).json({ message: "Không tìm thấy bản ghi!" });
    res.json(results[0]);
  });
});

// ➕ Thêm lịch sử khám bệnh
app.post("/api/admin/lichsu", authenticateToken, requireAdmin, (req, res) => {
  const { ngayKham, ketLuan, chiTiet, idBacSi, idKhoa, idHoSoYTe } = req.body;
  if (!ngayKham || !ketLuan || !String(ketLuan).trim() || !idBacSi || !idKhoa || !idHoSoYTe)
    return res.status(400).json({ message: "⚠️ Thiếu thông tin bắt buộc!" });

  const formattedNgay = normalizeDateInput(ngayKham, false);
  if (!formattedNgay) return res.status(400).json({ message: "Ngày khám không hợp lệ!" });

  const safeKetLuan = escapeHtml(String(ketLuan).trim());
  const safeChiTiet = escapeHtml(chiTiet || "");

  validateMedicalHistoryRefs(idBacSi, idKhoa, idHoSoYTe, (refErr) => {
    if (refErr) return res.status(refErr.status).json({ message: refErr.message });

    const sql = `INSERT INTO LICHSUKHAMBENH (ngayKham, ketLuan, chiTiet, idBacSi, idKhoa, idHoSoYTe) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(sql, [formattedNgay, safeKetLuan, safeChiTiet, idBacSi, idKhoa, idHoSoYTe], (err) => {
      if (err) {
        console.error("❌ Lỗi khi thêm lịch sử khám:", err);
        return res.status(500).json({ message: "Không thể thêm lịch sử khám!" });
      }
      logActivity("THÊM LỊCH SỬ KHÁM", `Admin thêm lịch sử khám bệnh (Hồ sơ #${idHoSoYTe}): ${safeKetLuan}`);
      res.json({ success: true, message: "✅ Thêm lịch sử khám thành công!" });
    });
  });
});

// ✏️ Sửa lịch sử khám bệnh
app.put("/api/admin/lichsu/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });
  const { ngayKham, ketLuan, chiTiet, idBacSi, idKhoa, idHoSoYTe } = req.body;
  if (!ngayKham || !ketLuan || !String(ketLuan).trim() || !idBacSi || !idKhoa || !idHoSoYTe)
    return res.status(400).json({ message: "⚠️ Thiếu thông tin cập nhật!" });

  const formattedNgay = normalizeDateInput(ngayKham, false);
  if (!formattedNgay) return res.status(400).json({ message: "Ngày khám không hợp lệ!" });

  const safeKetLuan = escapeHtml(String(ketLuan).trim());
  const safeChiTiet = escapeHtml(chiTiet || "");

  validateMedicalHistoryRefs(idBacSi, idKhoa, idHoSoYTe, (refErr) => {
    if (refErr) return res.status(refErr.status).json({ message: refErr.message });

    const sql = `UPDATE LICHSUKHAMBENH SET ngayKham=?, ketLuan=?, chiTiet=?, idBacSi=?, idKhoa=?, idHoSoYTe=? WHERE idLS=?`;
    db.query(sql, [formattedNgay, safeKetLuan, safeChiTiet, idBacSi, idKhoa, idHoSoYTe, id], (err, result) => {
      if (err) return res.status(500).json({ message: "Không thể cập nhật lịch sử khám!" });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Không tìm thấy bản ghi!" });
      logActivity("CẬP NHẬT LỊCH SỬ", `Admin cập nhật lịch sử khám #${idHoSoYTe}`);
      res.json({ success: true, message: "✅ Cập nhật lịch sử khám thành công!" });
    });
  });
});

// 🗑️ Xóa lịch sử khám bệnh
app.delete("/api/admin/lichsu/:id", authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) return res.status(400).json({ message: "ID không hợp lệ!" });

  const hsql = `SELECT ls.idHoSoYTe FROM LICHSUKHAMBENH ls WHERE ls.idLS=?`;
  db.query(hsql, [id], (err1, rows) => {
    let idHoSoYTe = "Không rõ";
    if (!err1 && rows.length > 0) idHoSoYTe = rows[0].idHoSoYTe;

    const sql = "DELETE FROM LICHSUKHAMBENH WHERE idLS = ?";
    db.query(sql, [id], (err, result) => {
      if (err) return res.status(500).json({ message: "Không thể xóa lịch sử khám!" });
      if (result.affectedRows === 0) return res.status(404).json({ message: "Không tìm thấy bản ghi cần xóa!" });
      logActivity("XÓA LỊCH SỬ KHÁM", `Admin xóa lịch sử khám #${idHoSoYTe}`);
      res.json({ success: true, message: "🗑️ Xóa lịch sử khám thành công!" });
    });
  });
});


// ================== API DASHBOARD THỐNG KÊ (ADMIN) ==================
app.get("/api/dashboard", authenticateToken, requireAdmin, (req, res) => {
  const countHoSo = "SELECT COUNT(*) AS total FROM HOSOYTE";
  const countBacSi = "SELECT COUNT(*) AS total FROM BACSI";
  const countLichToday = `SELECT COUNT(*) AS total FROM LICHKHAM WHERE DATE(ngayKham) = CURDATE()`;
  const countLichMoi = `SELECT COUNT(*) AS total FROM LICHKHAM WHERE LOWER(trangThai) = 'chờ xác nhận'`;

  db.query(countHoSo, (err1, hosoResult) => {
    if (err1) return res.status(500).json({ error: "Lỗi khi đếm hồ sơ" });
    db.query(countBacSi, (err2, bacsiResult) => {
      if (err2) return res.status(500).json({ error: "Lỗi khi đếm bác sĩ" });
      db.query(countLichToday, (err3, todayResult) => {
        if (err3) return res.status(500).json({ error: "Lỗi khi đếm lịch hôm nay" });
        db.query(countLichMoi, (err4, moiResult) => {
          if (err4) return res.status(500).json({ error: "Lỗi khi đếm lịch mới" });
          res.json({
            totalRecords: hosoResult[0].total || 0,
            totalDoctors: bacsiResult[0].total || 0,
            todayAppointments: todayResult[0].total || 0,
            newContacts: moiResult[0].total || 0
          });
        });
      });
    });
  });
});

// 📈 Lấy số lịch khám mỗi ngày (30 ngày gần nhất)
app.get("/api/dashboard/daily-appointments", authenticateToken, requireAdmin, (req, res) => {
  const sql = `
    SELECT DATE(ngayKham) AS date, COUNT(*) AS count
    FROM LICHKHAM
    WHERE ngayKham >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
    GROUP BY DATE(ngayKham) ORDER BY DATE(ngayKham) ASC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Lỗi máy chủ khi lấy dữ liệu biểu đồ!" });

    const dataMap = new Map();
    results.forEach(row => {
      const dateStr = String(row.date).slice(0, 10);
      dataMap.set(dateStr, row.count);
    });

    const allDays = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
      ].join("-");
      allDays.push({ date: dateStr, count: dataMap.get(dateStr) || 0 });
    }
    res.json(allDays);
  });
});


// ================== API HOẠT ĐỘNG GẦN ĐÂY (ADMIN) ==================
app.get("/api/hoatdong", authenticateToken, requireAdmin, (req, res) => {
  const sql = `
    SELECT loaiHoatDong, moTa, thoiGian 
    FROM hoatdong 
    ORDER BY thoiGian DESC LIMIT 10
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Lỗi lấy hoạt động:", err);
      return res.status(500).json({ message: "Lỗi khi lấy hoạt động gần đây!" });
    }
    const activities = results.map(item => ({
      loaiHoatDong: item.loaiHoatDong,
      moTa: item.moTa,
      thoiGian: formatTime(item.thoiGian)
    }));
    res.json(activities);
  });
});


// ================== START SERVER ==================
app.listen(PORT, () => {
  console.log(`🌐 Server chạy tại http://localhost:${PORT}`);
});
