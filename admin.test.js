// admin.test.js
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Bạn không có quyền truy cập!' });
  }
  next();
};

const isValidId = (id) => !isNaN(id) && parseInt(id) > 0;

const updateLichKhamStatus = (req, res, db) => {
  const { id } = req.params;
  const { trangThai } = req.body;

  if (!isValidId(id)) return res.status(400).json({ message: 'Mã lịch không hợp lệ!' });

  const validStatus = ['da_kham', 'da_huy', 'xac_nhan'];
  if (!trangThai || !validStatus.includes(trangThai)) {
    return res.status(400).json({ message: 'Trạng thái không hợp lệ!' });
  }

  db.query('SELECT * FROM LICHKHAM WHERE idLichKham = ?', [id], (dbErr, results) => {
    if (dbErr) return res.status(500).json({ message: 'Lỗi máy chủ!' });
    if (!results || results.length === 0) return res.status(404).json({ message: 'Không tìm thấy!' });

    db.query('UPDATE LICHKHAM SET trangThai = ? WHERE idLichKham = ?', [trangThai, id], (updateErr, updateResult) => {
      if (updateErr) return res.status(500).json({ message: 'Lỗi cập nhật!' });
      if (updateResult.affectedRows === 0) return res.status(400).json({ message: 'Thất bại!' });
      return res.status(200).json({ message: 'Thành công!' });
    });
  });
};

describe('White-box Testing: Quản trị lịch khám', () => {
  let mockReq, mockRes, mockNext, mockDb;

  beforeEach(() => {
    mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockNext = jest.fn();
    mockDb = { query: jest.fn() };
  });

  test('UT_AD01: Role customer -> 403', () => {
    mockReq = { user: { role: 'customer' } };
    requireAdmin(mockReq, mockRes, mockNext);
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  test('UT_AD02: ID sai định dạng -> 400', () => {
    mockReq = { params: { id: 'abc' }, body: { trangThai: 'xac_nhan' } };
    updateLichKhamStatus(mockReq, mockRes, mockDb);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('UT_AD03: Trạng thái sai -> 400', () => {
    mockReq = { params: { id: '1' }, body: { trangThai: 'sai' } };
    updateLichKhamStatus(mockReq, mockRes, mockDb);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('UT_AD04: Lỗi DB SELECT -> 500', () => {
    mockReq = { params: { id: '1' }, body: { trangThai: 'xac_nhan' } };
    mockDb.query.mockImplementationOnce((sql, params, cb) => cb(new Error('Err'), null));
    updateLichKhamStatus(mockReq, mockRes, mockDb);
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });

  test('UT_AD05: Không tìm thấy lịch -> 404', () => {
    mockReq = { params: { id: '1' }, body: { trangThai: 'xac_nhan' } };
    mockDb.query.mockImplementationOnce((sql, params, cb) => cb(null, []));
    updateLichKhamStatus(mockReq, mockRes, mockDb);
    expect(mockRes.status).toHaveBeenCalledWith(404);
  });

  test('UT_AD06: Lỗi DB UPDATE -> 500', () => {
    mockReq = { params: { id: '1' }, body: { trangThai: 'xac_nhan' } };
    mockDb.query.mockImplementationOnce((sql, params, cb) => cb(null, [{ id: 1 }]))
                .mockImplementationOnce((sql, params, cb) => cb(new Error('Err'), null));
    updateLichKhamStatus(mockReq, mockRes, mockDb);
    expect(mockRes.status).toHaveBeenCalledWith(500);
  });

  test('UT_AD07: affectedRows = 0 -> 400', () => {
    mockReq = { params: { id: '1' }, body: { trangThai: 'xac_nhan' } };
    mockDb.query.mockImplementationOnce((sql, params, cb) => cb(null, [{ id: 1 }]))
                .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 0 }));
    updateLichKhamStatus(mockReq, mockRes, mockDb);
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  test('UT_AD08: Thành công -> 200', () => {
    mockReq = { params: { id: '1' }, body: { trangThai: 'xac_nhan' } };
    mockDb.query.mockImplementationOnce((sql, params, cb) => cb(null, [{ id: 1 }]))
                .mockImplementationOnce((sql, params, cb) => cb(null, { affectedRows: 1 }));
    updateLichKhamStatus(mockReq, mockRes, mockDb);
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });
});