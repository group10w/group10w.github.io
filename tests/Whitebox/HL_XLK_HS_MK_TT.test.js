/**
 * KIỂM THỬ HỘP TRẮNG - NHÓM CHỨC NĂNG KHÁCH HÀNG
 * Hủy lịch | Xem lịch | Hồ sơ y tế | Đổi mật khẩu | Cập nhật thông tin
 *
 * Cách làm:
 *  - Mock mysql2 (không cần MySQL thật) để ép từng callback đi vào nhánh lỗi.
 *  - Mock express.listen để nạp server.js mà không mở cổng; lấy app qua global.__app.
 *  - Mỗi test gắn nhãn [R1] (đợt 1: luồng chính + lỗi nghiệp vụ hay gặp)
 *    hoặc [R2] (đợt 2: bổ sung sau khi đo coverage lần đầu) hoặc [BUG] (test
 *    viết theo hành vi ĐÚNG mong đợi, thất bại nghĩa là đã phát hiện lỗi).
 */
const crypto = require("crypto");
const request = require("supertest");

process.env.JWT_SECRET = "whitebox-test-secret";
process.env.TOKEN_TTL_SECONDS = "3600";

const mockPool = { query: jest.fn(), getConnection: jest.fn() };
jest.mock("mysql2", () => ({ createPool: () => mockPool }));
jest.mock("express", () => {
  const real = jest.requireActual("express");
  const wrapped = (...args) => {
    const app = real(...args);
    app.listen = jest.fn();
    global.__app = app;
    return app;
  };
  Object.assign(wrapped, real);
  return wrapped;
});

require("../server.js");
const app = global.__app;

// ---------- tiện ích ----------
function makeToken(payload, secret = process.env.JWT_SECRET) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const b = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + 3600 })).toString("base64url");
  const s = crypto.createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  return `${h}.${b}.${s}`;
}
const customer = (id = 7) => `Bearer ${makeToken({ id, role: "customer" })}`;
const admin = (id = 1) => `Bearer ${makeToken({ id, role: "admin" })}`;

function ymd(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function hashed(pw, iterations = 1000) {
  const salt = "abcd1234";
  const hash = crypto.pbkdf2Sync(pw, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

/** Xếp hàng kết quả cho các lần db.query liên tiếp: [{err, rows}] */
function queueDb(...responses) {
  const q = [...responses];
  mockPool.query.mockImplementation((sql, params, cb) => {
    const callback = typeof params === "function" ? params : cb;
    const r = q.shift() || { rows: [] };
    callback(r.err || null, r.rows);
  });
}
const sqlCalls = () => mockPool.query.mock.calls.map((c) => ({ sql: String(c[0]), params: c[1] }));
const updateCall = (kw) => sqlCalls().find((c) => c.sql.includes(kw));
const insertLog = () => sqlCalls().find((c) => c.sql.includes("INSERT INTO hoatdong"));

beforeEach(() => {
  mockPool.query.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

// =====================================================================
// 1. HỦY LỊCH  POST /api/huy-lich
// =====================================================================
describe("Hủy lịch - POST /api/huy-lich", () => {
  const lich = (o = {}) => ({ rows: [{ idKH: 7, ngayKham: ymd(5), trangThai: "chờ xác nhận", hoTen: "Nguyễn Văn A", ...o }] });
  const post = (body, auth = customer()) => request(app).post("/api/huy-lich").set("Authorization", auth).send(body);

  test("[R1] HL01 luồng đúng: hủy lịch của chính mình", async () => {
    queueDb(lich(), { rows: { affectedRows: 1 } }, { rows: {} });
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateCall("UPDATE LICHKHAM").params).toEqual([10]);
    expect(insertLog().params[0]).toBe("HỦY LỊCH");
  });
  test("[R1] HL02 D1 đúng: thiếu idLichKham", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Thiếu/);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R1] HL03 D2 đúng: idLichKham không phải số", async () => {
    const res = await post({ idLichKham: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/không hợp lệ/);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R2] HL04 D3 đúng: truy vấn thông tin lịch báo lỗi", async () => {
    queueDb({ err: new Error("db down") });
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(500);
  });
  test("[R1] HL05 D4 đúng: không tìm thấy lịch", async () => {
    queueDb({ rows: [] });
    const res = await post({ idLichKham: 999 });
    expect(res.status).toBe(404);
  });
  test("[R1] HL06 D5 đúng: khách hủy lịch của người khác (IDOR)", async () => {
    queueDb(lich({ idKH: 8 }));
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(403);
    expect(updateCall("UPDATE LICHKHAM")).toBeUndefined();
  });
  test("[R2] HL07 D5 sai do admin: admin hủy lịch của khách", async () => {
    queueDb(lich({ idKH: 8 }), { rows: { affectedRows: 1 } }, { rows: {} });
    const res = await post({ idLichKham: 10 }, admin());
    expect(res.status).toBe(200);
  });
  test("[R1] HL08 D6 đúng: lịch đã hủy (không phân biệt hoa/thường)", async () => {
    queueDb(lich({ trangThai: "Đã Hủy" }));
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/đã được hủy/);
  });
  test("[R2] HL09 D6 vế || : trangThai = null vẫn được hủy", async () => {
    queueDb(lich({ trangThai: null }), { rows: { affectedRows: 1 } }, { rows: {} });
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(200);
  });
  test("[R1] HL10 D7 đúng: lịch đã qua ngày", async () => {
    queueDb(lich({ ngayKham: ymd(-1) }));
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/đã qua ngày/);
  });
  test("[R2] HL11 D7 vế && : ngayKham = null thì bỏ qua kiểm tra ngày", async () => {
    queueDb(lich({ ngayKham: null }), { rows: { affectedRows: 1 } }, { rows: {} });
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(200);
  });
  test("[R2] HL12 D8 đúng: UPDATE báo lỗi, không ghi log", async () => {
    queueDb(lich(), { err: new Error("update fail") });
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(insertLog()).toBeUndefined();
  });
  test("[R2] HL13 biên: lịch đúng ngày hôm nay vẫn được hủy", async () => {
    queueDb(lich({ ngayKham: `${ymd(0)} 00:00:00` }), { rows: { affectedRows: 1 } }, { rows: {} });
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(200);
  });
  test("[R2] HL14 không gửi token", async () => {
    const res = await request(app).post("/api/huy-lich").send({ idLichKham: 10 });
    expect(res.status).toBe(401);
  });
  test("[R2] HL17 logActivity báo lỗi ghi log: lịch vẫn được hủy thành công", async () => {
    queueDb(lich(), { rows: { affectedRows: 1 } }, { err: new Error("log fail") });
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });
  test("[BUG] HL15 server nên chặn hủy lịch đã xác nhận (frontend chỉ cho hủy 'chờ xác nhận')", async () => {
    queueDb(lich({ trangThai: "đã xác nhận" }), { rows: { affectedRows: 1 } }, { rows: {} });
    const res = await post({ idLichKham: 10 });
    expect(res.status).toBe(400);
  });
  test("[BUG] HL16 idLichKham = true (boolean) phải bị từ chối", async () => {
    queueDb(lich(), { rows: { affectedRows: 1 } }, { rows: {} });
    const res = await post({ idLichKham: true });
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// 2. XEM LỊCH  GET /api/lich-user/:idKH
// =====================================================================
describe("Xem lịch - GET /api/lich-user/:idKH", () => {
  const get = (id, auth = customer()) => request(app).get(`/api/lich-user/${id}`).set("Authorization", auth);
  const rows = [{ idLichKham: 1, ngayKham: ymd(3) }, { idLichKham: 2, ngayKham: ymd(1) }];

  test("[R1] XL01 luồng đúng: xem lịch của chính mình", async () => {
    queueDb({ rows });
    const res = await get(7);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(sqlCalls()[0].params).toEqual(["7"]);
  });
  test("[R1] XL02 D1 đúng: idKH không phải số", async () => {
    const res = await get("abc");
    expect(res.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R2] XL03 biên: idKH = 0 và -1", async () => {
    expect((await get(0)).status).toBe(400);
    expect((await get(-1)).status).toBe(400);
  });
  test("[R1] XL04 D2 đúng: khách xem lịch người khác (IDOR)", async () => {
    const res = await get(8);
    expect(res.status).toBe(403);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R2] XL05 D2 sai do admin: admin xem lịch bất kỳ khách", async () => {
    queueDb({ rows });
    const res = await get(8, admin());
    expect(res.status).toBe(200);
    expect(sqlCalls()[0].params).toEqual(["8"]);
  });
  test("[R2] XL06 D3 đúng: truy vấn báo lỗi", async () => {
    queueDb({ err: new Error("db down") });
    const res = await get(7);
    expect(res.status).toBe(500);
  });
  test("[R2] XL07 khách chưa có lịch: trả mảng rỗng", async () => {
    queueDb({ rows: [] });
    const res = await get(7);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
  test("[R2] XL08 token sai chữ ký bị từ chối", async () => {
    const bad = `Bearer ${makeToken({ id: 7, role: "customer" }, "khoa-gia")}`;
    expect((await get(7, bad)).status).toBe(403);
  });
  test.each([["1e2"], ["0x10"]])("[BUG] XL09 idKH dạng '%s' phải bị từ chối", async (id) => {
    queueDb({ rows: [] });
    expect((await get(id, admin())).status).toBe(400);
  });
});

// =====================================================================
// 3. HỒ SƠ Y TẾ  GET /hosoyte/:idKH
// =====================================================================
describe("Hồ sơ y tế - GET /hosoyte/:idKH", () => {
  const get = (id, auth = customer()) => request(app).get(`/hosoyte/${id}`).set("Authorization", auth);
  const kh = { rows: [{ idKH: 7, hoTen: "Nguyễn Văn A", sdt: "0900000001" }] };
  const hs = { rows: [{ idHoSoYTe: 55, idKH: 7 }] };
  const ls = { rows: [{ ngayKham: "2026-01-05", bacSi: "BS B", khoa: "Nội", ketLuan: "Ổn", chiTiet: "..." }] };

  test("[R1] HS01 luồng đúng: có thông tin, hồ sơ và lịch sử khám", async () => {
    queueDb(kh, hs, ls);
    const res = await get(7);
    expect(res.status).toBe(200);
    expect(res.body.benhnhan.hoTen).toBe("Nguyễn Văn A");
    expect(res.body.lichsu).toHaveLength(1);
    expect(mockPool.query).toHaveBeenCalledTimes(3);
  });
  test("[R2] HS02 luồng dữ liệu: idHoSoYTe của truy vấn 2 được dùng cho truy vấn 3", async () => {
    queueDb(kh, hs, ls);
    await get(7);
    expect(sqlCalls()[2].params).toEqual([55]);
  });
  test("[R1] HS03 D1 đúng: idKH không hợp lệ", async () => {
    const res = await get("abc");
    expect(res.status).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R1] HS04 D2 đúng: khách xem hồ sơ người khác (IDOR)", async () => {
    const res = await get(8);
    expect(res.status).toBe(403);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R2] HS05 D2 sai do admin: admin xem hồ sơ bất kỳ khách", async () => {
    queueDb(kh, hs, ls);
    const res = await get(7, admin());
    expect(res.status).toBe(200);
  });
  test("[R2] HS06 D3 đúng: truy vấn KHACHHANG báo lỗi", async () => {
    queueDb({ err: new Error("e1") });
    const res = await get(7);
    expect(res.status).toBe(500);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });
  test("[R1] HS07 D4 đúng: không có khách hàng", async () => {
    queueDb({ rows: [] });
    const res = await get(7);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ benhnhan: null, lichsu: [] });
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });
  test("[R2] HS08 D5 đúng: truy vấn HOSOYTE báo lỗi", async () => {
    queueDb(kh, { err: new Error("e2") });
    const res = await get(7);
    expect(res.status).toBe(500);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });
  test("[R1] HS09 D6 đúng: có khách nhưng chưa có hồ sơ y tế", async () => {
    queueDb(kh, { rows: [] });
    const res = await get(7);
    expect(res.status).toBe(200);
    expect(res.body.lichsu).toEqual([]);
    expect(res.body.benhnhan.idKH).toBe(7);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });
  test("[R2] HS10 D7 đúng: truy vấn lịch sử khám báo lỗi", async () => {
    queueDb(kh, hs, { err: new Error("e3") });
    const res = await get(7);
    expect(res.status).toBe(500);
  });
  test("[R2] HS11 có hồ sơ nhưng lịch sử khám rỗng", async () => {
    queueDb(kh, hs, { rows: [] });
    const res = await get(7);
    expect(res.status).toBe(200);
    expect(res.body.lichsu).toEqual([]);
  });
});

// =====================================================================
// 4. ĐỔI MẬT KHẨU  PUT /api/khachhang/:idKH/changepassword
// =====================================================================
describe("Đổi mật khẩu - PUT /api/khachhang/:idKH/changepassword", () => {
  const put = (id, body, auth = customer()) => request(app).put(`/api/khachhang/${id}/changepassword`).set("Authorization", auth).send(body);
  const OLD = "Matkhau123";
  const NEW = "Matkhau456";
  const stored = (v) => ({ rows: [{ matKhau: v }] });

  test("[R1] MK01 luồng đúng: đổi mật khẩu, lưu dạng băm", async () => {
    queueDb(stored(hashed(OLD)), { rows: { affectedRows: 1 } });
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(200);
    const upd = updateCall("UPDATE KHACHHANG");
    expect(upd.params[0]).toMatch(/^pbkdf2_sha256\$100000\$/);
    expect(upd.params[0]).not.toContain(NEW);
    expect(upd.params[1]).toBe("7");
  });
  test("[R1] MK02 D1 đúng: idKH không hợp lệ", async () => {
    const res = await put("abc", { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(400);
  });
  test("[R1] MK03 D2 vế trái: đổi mật khẩu tài khoản khác", async () => {
    const res = await put(8, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(403);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R2] MK04 D2 vế phải: token admin trùng id vẫn bị từ chối", async () => {
    const res = await put(1, { oldPassword: OLD, newPassword: NEW }, admin(1));
    expect(res.status).toBe(403);
  });
  test("[R1] MK05 D3 vế trái: thiếu oldPassword", async () => {
    const res = await put(7, { newPassword: NEW });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Thiếu dữ liệu");
  });
  test("[R2] MK06 D3 vế phải: thiếu newPassword", async () => {
    const res = await put(7, { oldPassword: OLD });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Thiếu dữ liệu");
  });
  test.each([
    ["[R1] MK07a mật khẩu mới ngắn (7 ký tự)", "Abcde12"],
    ["[R2] MK07b mật khẩu mới thiếu chữ số", "Abcdefgh"],
    ["[R2] MK07c mật khẩu mới thiếu chữ cái", "12345678"],
    ["[R2] MK07d mật khẩu mới không phải chuỗi (số)", 12345678],
  ])("%s", async (_n, pw) => {
    const res = await put(7, { oldPassword: OLD, newPassword: pw });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ít nhất 8 ký tự/);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R2] MK08 biên: mật khẩu mới đúng 8 ký tự được chấp nhận", async () => {
    queueDb(stored(hashed(OLD)), { rows: { affectedRows: 1 } });
    const res = await put(7, { oldPassword: OLD, newPassword: "Abcdef12" });
    expect(res.status).toBe(200);
  });
  test("[R2] MK09 D5 đúng: truy vấn lấy mật khẩu báo lỗi", async () => {
    queueDb({ err: new Error("e") });
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(500);
  });
  test("[R1] MK10 D6 đúng: không tìm thấy khách hàng", async () => {
    queueDb({ rows: [] });
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(404);
  });
  test("[R1] MK11 D7 đúng: mật khẩu cũ sai (dữ liệu đã băm)", async () => {
    queueDb(stored(hashed(OLD)));
    const res = await put(7, { oldPassword: "Saimatkhau1", newPassword: NEW });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("oldPassword");
    expect(updateCall("UPDATE KHACHHANG")).toBeUndefined();
  });
  test("[R1] MK12 D8 đúng: mật khẩu mới trùng mật khẩu cũ", async () => {
    queueDb(stored(hashed(OLD)));
    const res = await put(7, { oldPassword: OLD, newPassword: OLD });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/khác mật khẩu cũ/);
  });
  test("[R2] MK13 D9 đúng: UPDATE báo lỗi", async () => {
    queueDb(stored(hashed(OLD)), { err: new Error("u") });
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(500);
  });
  test("[R2] MK14 verifyPassword: mật khẩu lưu dạng thô (tài khoản cũ), nhập đúng", async () => {
    queueDb(stored(OLD), { rows: { affectedRows: 1 } });
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(200);
    expect(updateCall("UPDATE KHACHHANG").params[0]).toMatch(/^pbkdf2_sha256\$/);
  });
  test("[R2] MK15 safeCompareString: mật khẩu thô sai, cùng độ dài", async () => {
    queueDb(stored("Matkhau999"));
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(400);
  });
  test("[R2] MK16 safeCompareString: mật khẩu thô sai, khác độ dài", async () => {
    queueDb(stored("ngan"));
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(400);
  });
  test("[R2] MK17 safeCompareString: cột matKhau = NULL", async () => {
    queueDb(stored(null));
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(400);
  });
  test("[R2] MK18 verifyPassword: chuỗi băm sai định dạng (thiếu phần)", async () => {
    queueDb(stored("pbkdf2_sha256$1000$chiBaPhan"));
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(400);
  });
  test("[R2] MK19 verifyPassword: số vòng lặp không phải số nguyên", async () => {
    queueDb(stored("pbkdf2_sha256$abc$salt$hash"));
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(400);
  });
  test("[R2] MK20 verifyPassword: số vòng lặp <= 0", async () => {
    queueDb(stored("pbkdf2_sha256$-5$salt$hash"));
    const res = await put(7, { oldPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// 5. CẬP NHẬT THÔNG TIN  PUT /api/khachhang/:idKH
// =====================================================================
describe("Cập nhật thông tin - PUT /api/khachhang/:idKH", () => {
  const put = (id, body, auth = customer()) => request(app).put(`/api/khachhang/${id}`).set("Authorization", auth).send(body);
  const full = { hoTen: "Nguyễn Văn A", gioitinh: "Nam", ngayThangNamSinh: "1990-05-20", cccd: "012345678901", diachi: "Hà Nội" };
  const ok = { rows: { affectedRows: 1 } };

  test("[R1] TT01 luồng đúng: đủ thông tin hợp lệ", async () => {
    queueDb(ok, { rows: {} });
    const res = await put(7, full);
    expect(res.status).toBe(200);
    expect(updateCall("UPDATE KHACHHANG").params).toEqual(["Nguyễn Văn A", "Nam", "1990-05-20", "012345678901", "Hà Nội", "7"]);
    expect(insertLog().params[0]).toBe("CẬP NHẬT HỒ SƠ");
  });
  test("[R1] TT02 D1 đúng: idKH không hợp lệ", async () => {
    const res = await put("abc", full);
    expect(res.status).toBe(400);
  });
  test("[R1] TT03 D2 đúng: sửa hồ sơ người khác (IDOR)", async () => {
    const res = await put(8, full);
    expect(res.status).toBe(403);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R2] TT04 D2 sai do admin: admin sửa hồ sơ khách", async () => {
    queueDb(ok, { rows: {} });
    const res = await put(7, full, admin());
    expect(res.status).toBe(200);
  });
  test("[R1] TT05 D3 đúng: thiếu họ tên", async () => {
    const res = await put(7, { ...full, hoTen: "" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Họ tên/);
  });
  test("[R2] TT06 các vế || : chỉ có họ tên, các trường còn lại lưu NULL", async () => {
    queueDb(ok, { rows: {} });
    const res = await put(7, { hoTen: "Trần Thị B" });
    expect(res.status).toBe(200);
    expect(updateCall("UPDATE KHACHHANG").params).toEqual(["Trần Thị B", null, null, null, null, "7"]);
  });
  test.each([
    ["[R1] TT07a ngày sinh không tồn tại (31/02/2000)", "31/02/2000"],
    ["[R2] TT07b ngày sinh sai định dạng", "abc"],
    ["[R2] TT07c ngày ISO không tồn tại (2000-02-30)", "2000-02-30"],
    ["[R2] TT07d ngày ngắn dd/mm không được phép (allowShortDate = false)", "5/5"],
  ])("%s", async (_n, d) => {
    const res = await put(7, { ...full, ngayThangNamSinh: d });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Ngày sinh/);
    expect(mockPool.query).not.toHaveBeenCalled();
  });
  test("[R2] TT08 ngày sinh dạng dd/mm/yyyy được chuẩn hoá về yyyy-mm-dd", async () => {
    queueDb(ok, { rows: {} });
    const res = await put(7, { ...full, ngayThangNamSinh: "5/6/1990" });
    expect(res.status).toBe(200);
    expect(updateCall("UPDATE KHACHHANG").params[2]).toBe("1990-06-05");
  });
  test.each([
    ["[R1] TT09a CCCD chứa chữ", "12ab34567"],
    ["[R2] TT09b CCCD 8 chữ số (dưới biên 9)", "12345678"],
    ["[R2] TT09c CCCD 13 chữ số (trên biên 12)", "1234567890123"],
  ])("%s", async (_n, cccd) => {
    const res = await put(7, { ...full, cccd });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/CCCD/);
  });
  test("[R2] TT10 biên CCCD: 9 và 12 chữ số được chấp nhận", async () => {
    queueDb(ok, { rows: {} }, ok, { rows: {} });
    expect((await put(7, { ...full, cccd: "123456789" })).status).toBe(200);
    expect((await put(7, { ...full, cccd: "123456789012" })).status).toBe(200);
  });
  test("[R1] TT11 luồng dữ liệu escapeHtml: chống XSS ở họ tên và địa chỉ", async () => {
    queueDb(ok, { rows: {} });
    await put(7, { ...full, hoTen: "<script>alert(1)</script>", diachi: "a\"b'c&d" });
    const p = updateCall("UPDATE KHACHHANG").params;
    expect(p[0]).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(p[4]).toBe("a&quot;b&#039;c&amp;d");
  });
  test("[R2] TT12 D9 đúng: UPDATE báo lỗi", async () => {
    queueDb({ err: new Error("u") });
    const res = await put(7, full);
    expect(res.status).toBe(500);
    expect(insertLog()).toBeUndefined();
  });
  test("[R2] TT13 D10 đúng: affectedRows = 0 (không có khách hàng)", async () => {
    queueDb({ rows: { affectedRows: 0 } });
    const res = await put(7, full);
    expect(res.status).toBe(404);
    expect(insertLog()).toBeUndefined();
  });
  test("[BUG] TT14 họ tên không phải chuỗi (object) phải bị từ chối", async () => {
    queueDb(ok, { rows: {} });
    const res = await put(7, { ...full, hoTen: { a: 1 } });
    expect(res.status).toBe(400);
  });
  test("[BUG] TT15 ngày sinh ở tương lai phải bị từ chối", async () => {
    queueDb(ok, { rows: {} });
    const res = await put(7, { ...full, ngayThangNamSinh: "2999-01-01" });
    expect(res.status).toBe(400);
  });
  test("[BUG] TT16 họ tên chỉ gồm khoảng trắng phải bị từ chối", async () => {
    queueDb(ok, { rows: {} });
    const res = await put(7, { ...full, hoTen: "    " });
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// Middleware dùng chung
// =====================================================================
describe("authenticateToken (dùng chung)", () => {
  test("[R1] AT01 không có header Authorization -> 401", async () => {
    expect((await request(app).get("/api/lich-user/7")).status).toBe(401);
  });
  test("[R2] AT02 header 'Bearer' không kèm token -> 401", async () => {
    expect((await request(app).get("/api/lich-user/7").set("Authorization", "Bearer")).status).toBe(401);
  });
  test("[R1] AT03 token rác -> 403", async () => {
    expect((await request(app).get("/api/lich-user/7").set("Authorization", "Bearer abc.def")).status).toBe(403);
  });
});
