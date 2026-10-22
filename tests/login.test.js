const { createLoginService } = require("../loginService");

describe("White-Box - Đăng nhập", () => {
    let login;
    let deps;

    beforeEach(() => {
        deps = {
            findAdminByPhone: jest.fn()
                .mockResolvedValue(null),

            findCustomerByPhone: jest.fn()
                .mockResolvedValue({
                    idKH: 1,
                    hoTen: "Nguyen Van A",
                    sdt: "0912345678",
                    matKhau: "fake-hash"
                }),

            verifyPassword: jest.fn(
                (password, storedPassword) => {
                    return (
                        password === "User@1234" &&
                        storedPassword === "fake-hash"
                    );
                }
            ),

            generateToken: jest.fn()
                .mockReturnValue("test-jwt-token"),

            isHashedPassword: jest.fn()
                .mockReturnValue(true),

            upgradePasswordIfNeeded: jest.fn(),

            logActivity: jest.fn()
        };

        login = createLoginService(deps);
    });

    // WB-LOG-01: Đăng nhập hợp lệ
    test("WB-LOG-01 - Đăng nhập với thông tin hợp lệ", async () => {
        const result = await login({
            sdt: "0912345678",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(200);
        expect(result.body.token).toBe("test-jwt-token");
        expect(result.body.isAdmin).toBe(false);
        expect(result.body.user.idKH).toBe(1);

        expect(deps.findCustomerByPhone)
            .toHaveBeenCalledWith("0912345678");
    });

    // WB-LOG-02: Thiếu số điện thoại
    test("WB-LOG-02 - Thiếu số điện thoại", async () => {
        const result = await login({
            sdt: "",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(400);

        expect(deps.findAdminByPhone)
            .not.toHaveBeenCalled();

        expect(deps.findCustomerByPhone)
            .not.toHaveBeenCalled();
    });

    // WB-LOG-03: Thiếu mật khẩu
    test("WB-LOG-03 - Thiếu mật khẩu", async () => {
        const result = await login({
            sdt: "0912345678",
            matkhau: ""
        });

        expect(result.status).toBe(400);

        expect(deps.findAdminByPhone)
            .not.toHaveBeenCalled();

        expect(deps.findCustomerByPhone)
            .not.toHaveBeenCalled();
    });

    // WB-LOG-04: Tài khoản không tồn tại
    test("WB-LOG-04 - Tài khoản không tồn tại", async () => {
        deps.findCustomerByPhone
            .mockResolvedValue(null);

        const result = await login({
            sdt: "0911111111",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(401);

        expect(result.body.message).toBe(
            "Số điện thoại hoặc mật khẩu không đúng!"
        );

        expect(deps.generateToken)
            .not.toHaveBeenCalled();
    });

    // WB-LOG-05: Mật khẩu không chính xác
    test("WB-LOG-05 - Mật khẩu không chính xác", async () => {
        const result = await login({
            sdt: "0912345678",
            matkhau: "WrongPassword123"
        });

        expect(result.status).toBe(401);

        expect(result.body.message).toBe(
            "Số điện thoại hoặc mật khẩu không đúng!"
        );

        expect(deps.generateToken)
            .not.toHaveBeenCalled();
    });

    // WB-LOG-06: Quản trị viên đăng nhập thành công
    test("WB-LOG-06 - Quản trị viên đăng nhập thành công", async () => {
        deps.findAdminByPhone.mockResolvedValue({
            idQTV: 10,
            sdtQTV: "0900000000",
            matKhauQTV: "fake-hash"
        });

        const result = await login({
            sdt: "0900000000",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(200);
        expect(result.body.isAdmin).toBe(true);
        expect(result.body.token).toBe("test-jwt-token");
        expect(result.body.admin.idQTV).toBe(10);

        expect(deps.generateToken).toHaveBeenCalledWith({
            id: 10,
            sdt: "0900000000",
            role: "admin"
        });
    });

    // WB-LOG-07: Số điện thoại sai định dạng
    test("WB-LOG-07 - Số điện thoại chứa ký tự không hợp lệ", async () => {
        const result = await login({
            sdt: "09123abc78",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(401);

        expect(deps.findAdminByPhone)
            .not.toHaveBeenCalled();

        expect(deps.findCustomerByPhone)
            .not.toHaveBeenCalled();

        expect(deps.generateToken)
            .not.toHaveBeenCalled();
    });

    // WB-LOG-08: Lỗi khi truy vấn tài khoản quản trị viên
    test("WB-LOG-08 - Lỗi khi truy vấn dữ liệu đăng nhập", async () => {
        deps.findAdminByPhone.mockRejectedValue(
            new Error("Database error")
        );

        const result = await login({
            sdt: "0912345678",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(500);
        expect(result.body.message).toBe("Lỗi máy chủ!");

        expect(deps.generateToken)
            .not.toHaveBeenCalled();
    });

    // WB-LOG-09: Không trả mật khẩu trong thông tin khách hàng
    test("WB-LOG-09 - Không trả mật khẩu trong dữ liệu khách hàng", async () => {
        const result = await login({
            sdt: "0912345678",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(200);
        expect(result.body.user).toBeDefined();

        expect(result.body.user)
            .not.toHaveProperty("matKhau");

        expect(result.body.user.idKH).toBe(1);
    });

    // WB-LOG-10: Admin sai mật khẩu, tiếp tục kiểm tra khách hàng
    test("WB-LOG-10 - Admin sai mật khẩu, kiểm tra khách hàng", async () => {
        deps.findAdminByPhone.mockResolvedValue({
            idQTV: 10,
            sdtQTV: "0900000000",
            matKhauQTV: "admin-hash"
        });

        deps.verifyPassword.mockImplementation(
            (password, storedPassword) =>
                password === "User@1234" &&
                storedPassword === "fake-hash"
        );

        const result = await login({
            sdt: "0900000000",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(200);
        expect(result.body.isAdmin).toBe(false);

        expect(deps.findCustomerByPhone)
            .toHaveBeenCalledWith("0900000000");
    });

    // WB-LOG-11: Nâng cấp mật khẩu cũ của Admin
    test("WB-LOG-11 - Nâng cấp mật khẩu admin chưa được hash", async () => {
        deps.findAdminByPhone.mockResolvedValue({
            idQTV: 10,
            sdtQTV: "0900000000",
            matKhauQTV: "old-password"
        });

        deps.verifyPassword.mockReturnValue(true);
        deps.isHashedPassword.mockReturnValue(false);

        const result = await login({
            sdt: "0900000000",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(200);

        expect(deps.upgradePasswordIfNeeded)
            .toHaveBeenCalledWith(
                "QUANTRIVIEN",
                "matKhauQTV",
                "idQTV",
                10,
                "User@1234"
            );
    });

    // WB-LOG-12: Nâng cấp mật khẩu cũ của khách hàng
    test("WB-LOG-12 - Nâng cấp mật khẩu khách hàng chưa được hash", async () => {
        deps.isHashedPassword.mockReturnValue(false);

        const result = await login({
            sdt: "0912345678",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(200);

        expect(deps.upgradePasswordIfNeeded)
            .toHaveBeenCalledWith(
                "KHACHHANG",
                "matKhau",
                "idKH",
                1,
                "User@1234"
            );
    });

    // WB-LOG-13: Lỗi truy vấn khách hàng
    test("WB-LOG-13 - Lỗi khi truy vấn khách hàng", async () => {
        deps.findCustomerByPhone.mockRejectedValue(
            new Error("Database error")
        );

        const result = await login({
            sdt: "0912345678",
            matkhau: "User@1234"
        });

        expect(result.status).toBe(500);
        expect(result.body.message).toBe("Lỗi máy chủ!");
    });

    // WB-LOG-14: Ghi nhận đăng nhập thất bại
    test("WB-LOG-14 - Gọi hook khi mật khẩu không đúng", async () => {
        const hooks = {
            recordFailedAttempt: jest.fn(),
            clearFailedAttempts: jest.fn()
        };

        const result = await login(
            {
                sdt: "0912345678",
                matkhau: "WrongPassword123"
            },
            hooks
        );

        expect(result.status).toBe(401);

        expect(hooks.recordFailedAttempt)
            .toHaveBeenCalledTimes(1);

        expect(hooks.clearFailedAttempts)
            .not.toHaveBeenCalled();
    });

    // WB-LOG-15: Không truyền input
    test("WB-LOG-15 - Không truyền input", async () => {
        const result = await login();

        expect(result.status).toBe(400);

        expect(result.body.message).toBe(
            "Vui lòng nhập số điện thoại và mật khẩu!"
        );
    });
});
