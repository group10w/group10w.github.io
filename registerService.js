
function createRegisterService(deps) {
    return function register(input = {}, res) {
        const { hoten, sdt, matkhau } = input;

        if (!hoten || !sdt || !matkhau) {
            return res.status(400).json({
                message: "Vui lòng nhập đầy đủ Họ tên, SĐT, và Mật khẩu!"
            });
        }

        if (!deps.hasStrongPassword(matkhau)) {
            return res.status(400).json({
                message: "Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số!"
            });
        }

        if (!/^[0-9]{10,11}$/.test(sdt)) {
            return res.status(400).json({
                message: "Số điện thoại không hợp lệ! Vui lòng nhập lại."
            });
        }

        const safeHoten = deps.escapeHtml(hoten);

        deps.db.query(
            "SELECT idKH FROM KHACHHANG WHERE sdt = ?",
            [sdt],
            (err, results) => {
                if (err) {
                    return res.status(500).json({
                        message: "Lỗi máy chủ khi kiểm tra số điện thoại!"
                    });
                }

                if (results.length > 0) {
                    return res.status(400).json({
                        message: "Số điện thoại này đã được đăng ký!"
                    });
                }

                deps.db.getConnection((connErr, connection) => {
                    if (connErr) {
                        return res.status(500).json({
                            message: "Đăng ký thất bại!"
                        });
                    }

                    connection.beginTransaction((txErr) => {
                        if (txErr) {
                            connection.release();
                            return res.status(500).json({
                                message: "Đăng ký thất bại!"
                            });
                        }

                        const insertCustomerSql = `
                            INSERT INTO KHACHHANG
                            (hoTen, sdt, matKhau, gioiTinh, ngayThangNamSinh, cccd, diaChi)
                            VALUES (?, ?, ?, NULL, NULL, NULL, NULL)
                        `;

                        connection.query(
                            insertCustomerSql,
                            [safeHoten, sdt, deps.hashPassword(matkhau)],
                            (insertErr, result) => {
                                if (insertErr) {
                                    return connection.rollback(() => {
                                        connection.release();
                                        res.status(500).json({
                                            message: "Đăng ký thất bại!"
                                        });
                                    });
                                }

                                connection.query(
                                    "INSERT INTO HOSOYTE (idKH) VALUES (?)",
                                    [result.insertId],
                                    (recordErr) => {
                                        if (recordErr) {
                                            return connection.rollback(() => {
                                                connection.release();
                                                res.status(500).json({
                                                    message: "Đăng ký thất bại do không tạo được hồ sơ y tế!"
                                                });
                                            });
                                        }

                                        connection.commit((commitErr) => {
                                            if (commitErr) {
                                                return connection.rollback(() => {
                                                    connection.release();
                                                    res.status(500).json({
                                                        message: "Đăng ký thất bại!"
                                                    });
                                                });
                                            }

                                            connection.release();

                                            deps.logActivity(
                                                "ĐĂNG KÝ",
                                                `Khách hàng mới: ${safeHoten} (SĐT: ${sdt})`,
                                                result.insertId
                                            );

                                            return res.json({
                                                message: "Đăng ký thành công!"
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    });
                });
            }
        );
    };
}

module.exports = { createRegisterService };
