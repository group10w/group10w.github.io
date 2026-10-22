
const { createRegisterService } = require("../registerService");

describe("White-box Testing - Register", () => {
    let register;
    let deps;
    let res;
    let connection;

    const inputHopLe = {
        hoten: "Nguyen Van A",
        sdt: "0912345678",
        matkhau: "User1234"
    };

    beforeEach(() => {
        connection = {
            beginTransaction: jest.fn((callback) => callback(null)),
            query: jest.fn((sql, values, callback) => {
                if (sql.includes("HOSOYTE")) {
                    callback(null, {});
                } else {
                    callback(null, { insertId: 123 });
                }
            }),
            commit: jest.fn((callback) => callback(null)),
            rollback: jest.fn((callback) => callback()),
            release: jest.fn()
        };

        deps = {
            hasStrongPassword: jest.fn(() => true),
            escapeHtml: jest.fn((name) => name),
            hashPassword: jest.fn(() => "hashed-password"),
            logActivity: jest.fn(),

            db: {
                query: jest.fn((sql, values, callback) => {
                    callback(null, []);
                }),
                getConnection: jest.fn((callback) => {
                    callback(null, connection);
                })
            }
        };

        res = {
            status: jest.fn(function (code) {
                this.statusCode = code;
                return this;
            }),
            json: jest.fn(function (body) {
                this.body = body;
                return this;
            })
        };

        register = createRegisterService(deps);
    });

    // WB-REG-01: Thiếu họ tên
    test("WB-REG-01 - Thiếu họ tên", () => {
        register({ ...inputHopLe, hoten: "" }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(deps.db.query).not.toHaveBeenCalled();
    });

    // WB-REG-02: Thiếu số điện thoại
    test("WB-REG-02 - Thiếu số điện thoại", () => {
        register({ ...inputHopLe, sdt: "" }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(deps.db.query).not.toHaveBeenCalled();
    });

    // WB-REG-03: Thiếu mật khẩu
    test("WB-REG-03 - Thiếu mật khẩu", () => {
        register({ ...inputHopLe, matkhau: "" }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(deps.db.query).not.toHaveBeenCalled();
    });

    // WB-REG-04: Mật khẩu yếu
    test("WB-REG-04 - Mật khẩu yếu", () => {
        deps.hasStrongPassword.mockReturnValue(false);

        register({ ...inputHopLe, matkhau: "123" }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(deps.db.query).not.toHaveBeenCalled();
    });

    // WB-REG-05: Số điện thoại sai định dạng
    test("WB-REG-05 - Số điện thoại sai định dạng", () => {
        register({ ...inputHopLe, sdt: "09123abc" }, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(deps.db.query).not.toHaveBeenCalled();
    });

    // WB-REG-06: Không có dữ liệu đầu vào
    test("WB-REG-06 - Không có body", () => {
        register({}, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(deps.db.query).not.toHaveBeenCalled();
    });

    // WB-REG-07: Lỗi khi kiểm tra số điện thoại
    test("WB-REG-07 - Lỗi truy vấn kiểm tra số điện thoại", () => {
        deps.db.query.mockImplementationOnce((sql, values, callback) => {
            callback(new Error("Database error"));
        });

        register(inputHopLe, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            message: "Lỗi máy chủ khi kiểm tra số điện thoại!"
        });
        expect(deps.db.getConnection).not.toHaveBeenCalled();
    });

    // WB-REG-08: Số điện thoại đã tồn tại
    test("WB-REG-08 - Số điện thoại đã đăng ký", () => {
        deps.db.query.mockImplementationOnce((sql, values, callback) => {
            callback(null, [{ idKH: 5 }]);
        });

        register(inputHopLe, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            message: "Số điện thoại này đã được đăng ký!"
        });
        expect(deps.db.getConnection).not.toHaveBeenCalled();
    });

    // WB-REG-09: Không lấy được connection
    test("WB-REG-09 - Lỗi lấy database connection", () => {
        deps.db.getConnection.mockImplementationOnce((callback) => {
            callback(new Error("Connection error"));
        });

        register(inputHopLe, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            message: "Đăng ký thất bại!"
        });
    });

    // WB-REG-10: Bắt đầu transaction thất bại
    test("WB-REG-10 - Lỗi beginTransaction", () => {
        connection.beginTransaction.mockImplementationOnce((callback) => {
            callback(new Error("Transaction error"));
        });

        register(inputHopLe, res);

        expect(connection.release).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(connection.query).not.toHaveBeenCalled();
    });

    // WB-REG-11: Thêm khách hàng thất bại
    test("WB-REG-11 - Lỗi thêm khách hàng", () => {
        connection.query.mockImplementationOnce((sql, values, callback) => {
            callback(new Error("Insert customer error"));
        });

        register(inputHopLe, res);

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    // WB-REG-12: Tạo hồ sơ y tế thất bại
    test("WB-REG-12 - Lỗi tạo hồ sơ y tế", () => {
        connection.query.mockImplementationOnce((sql, values, callback) => {
            callback(null, { insertId: 123 });
        });

        connection.query.mockImplementationOnce((sql, values, callback) => {
            callback(new Error("Insert medical record error"));
        });

        register(inputHopLe, res);

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            message: "Đăng ký thất bại do không tạo được hồ sơ y tế!"
        });
    });

    // WB-REG-13: Commit thất bại
    test("WB-REG-13 - Lỗi commit transaction", () => {
        connection.commit.mockImplementationOnce((callback) => {
            callback(new Error("Commit error"));
        });

        register(inputHopLe, res);

        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.release).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    // WB-REG-14: Đăng ký thành công
    test("WB-REG-14 - Đăng ký thành công", () => {
        register(inputHopLe, res);

        expect(deps.db.query).toHaveBeenCalledTimes(1);
        expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(connection.query).toHaveBeenCalledTimes(2);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);

        expect(deps.hashPassword).toHaveBeenCalledWith("User1234");
        expect(deps.logActivity).toHaveBeenCalledWith(
            "ĐĂNG KÝ",
            "Khách hàng mới: Nguyen Van A (SĐT: 0912345678)",
            123
        );

        expect(res.json).toHaveBeenCalledWith({
            message: "Đăng ký thành công!"
        });
        expect(res.status).not.toHaveBeenCalled();
    });

    // WB-REG-15: Escape họ tên trước khi lưu
    test("WB-REG-15 - Escape họ tên trước khi lưu", () => {
        deps.escapeHtml.mockReturnValue("Nguyen &amp; Van A");

        register(inputHopLe, res);

        expect(deps.escapeHtml).toHaveBeenCalledWith("Nguyen Van A");
        expect(connection.query).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining("INSERT INTO KHACHHANG"),
            ["Nguyen &amp; Van A", "0912345678", "hashed-password"],
            expect.any(Function)
        );
    });
    
    test("WB-REG-16 - Không truyền input", () => {
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
    };

    register(undefined, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
        message: "Vui lòng nhập đầy đủ Họ tên, SĐT, và Mật khẩu!"
    });
});
});
