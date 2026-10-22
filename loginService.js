function createLoginService(deps) {
    return async function login(input = {}, hooks = {}) {
        const { sdt, matkhau } = input;

        // UT02, UT03: Thiếu dữ liệu bắt buộc
        if (!sdt || !matkhau) {
            return {
                status: 400,
                body: {
                    message:
                        "Vui lòng nhập số điện thoại và mật khẩu!"
                }
            };
        }

        const errorMsg =
            "Số điện thoại hoặc mật khẩu không đúng!";

        // Kiểm tra định dạng số điện thoại
        if (!/^[0-9]{10,11}$/.test(sdt)) {
            hooks.recordFailedAttempt?.();

            return {
                status: 401,
                body: { message: errorMsg }
            };
        }

        try {
            // 1. Kiểm tra tài khoản Admin
            const admin =
                await deps.findAdminByPhone(sdt);

            if (
                admin &&
                deps.verifyPassword(
                    matkhau,
                    admin.matKhauQTV
                )
            ) {
                hooks.clearFailedAttempts?.();

                const token = deps.generateToken({
                    id: admin.idQTV,
                    sdt,
                    role: "admin"
                });

                if (
                    !deps.isHashedPassword(
                        admin.matKhauQTV
                    )
                ) {
                    deps.upgradePasswordIfNeeded(
                        "QUANTRIVIEN",
                        "matKhauQTV",
                        "idQTV",
                        admin.idQTV,
                        matkhau
                    );
                }

                deps.logActivity(
                    "ĐĂNG NHẬP ADMIN",
                    `Admin đăng nhập (SĐT: ${sdt})`,
                    admin.idQTV
                );

                return {
                    status: 200,
                    body: {
                        message: "Đăng nhập thành công!",
                        isAdmin: true,
                        token,
                        admin: {
                            idQTV: admin.idQTV,
                            sdt: admin.sdtQTV
                        }
                    }
                };
            }

            // 2. Kiểm tra tài khoản Customer
            const user =
                await deps.findCustomerByPhone(sdt);

            if (
                !user ||
                !deps.verifyPassword(
                    matkhau,
                    user.matKhau
                )
            ) {
                hooks.recordFailedAttempt?.();

                return {
                    status: 401,
                    body: { message: errorMsg }
                };
            }

            hooks.clearFailedAttempts?.();

            const token = deps.generateToken({
                id: user.idKH,
                sdt,
                role: "customer"
            });

            // Nâng cấp mật khẩu cũ sang dạng hash nếu cần
            if (!deps.isHashedPassword(user.matKhau)) {
                deps.upgradePasswordIfNeeded(
                    "KHACHHANG",
                    "matKhau",
                    "idKH",
                    user.idKH,
                    matkhau
                );
            }

            deps.logActivity(
                "ĐĂNG NHẬP",
                `Khách hàng đăng nhập (SĐT: ${sdt})`,
                user.idKH
            );

            return {
                status: 200,
                body: {
                    message: "Đăng nhập thành công!",
                    isAdmin: false,
                    token,
                    user: {
                        idKH: user.idKH,
                        hoTen: user.hoTen,
                        sdt: user.sdt
                    }
                }
            };
        } catch (error) {
            return {
                status: 500,
                body: {
                    message: "Lỗi máy chủ!"
                }
            };
        }
    };
}

module.exports = { createLoginService };