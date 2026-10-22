// admin-lskhambenh.js
// Tự động gửi token xác thực cho các API quản trị.
(function() {
  if (window.__authFetchInstalled) return;
  window.__authFetchInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(url, options = {}) {
    const token = localStorage.getItem("token");
    if (token) {
      const headers = new Headers(options.headers || {});
      headers.set("Authorization", "Bearer " + token);
      options.headers = headers;
    }
    return originalFetch(url, options);
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ admin-lskhambenh.js loaded");

  const tableBody = document.querySelector("#lichsuTable tbody");
  if (!tableBody) return;

  const modal = document.getElementById("lichsuModal");
  const openBtn = document.getElementById("openAddLS");
  const closeBtn = document.getElementById("closeLSModal");
  const cancelBtn = document.getElementById("cancelLS");
  const form = document.getElementById("lichsuForm");
  const apiUrl = "http://localhost:3000/api/admin/lichsu";

  const idBacSiEl = document.getElementById("idBacSiLS");
  const idKhoaEl = document.getElementById("idKhoaLS");
  const idHSEl = document.getElementById("idHoSoYTeLS");

  // ---------------- helper ----------------
  function safeText(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  // ---------------- load danh sách bác sĩ theo khoa ----------------
  async function loadBacSiTheoKhoa(idKhoaValue, selectValue = null) {
    try {
      if (!idKhoaValue) {
        idBacSiEl.innerHTML = `<option value="">-- Chọn bác sĩ --</option>`;
        return;
      }
      const res = await fetch(`http://localhost:3000/api/bacsi/khoa/${idKhoaValue}`);
      if (!res.ok) throw new Error("Không lấy được danh sách bác sĩ");
      const bacsi = await res.json();
      if (!Array.isArray(bacsi) || bacsi.length === 0) {
        idBacSiEl.innerHTML = `<option value="">(Không có bác sĩ)</option>`;
        return;
      }
      idBacSiEl.innerHTML = bacsi
        .map(b => `<option value="${b.idBacSi}">${safeText(b.hoTenBacSi)}</option>`)
        .join("");
      if (selectValue) idBacSiEl.value = selectValue;
    } catch (err) {
      console.error("❌ loadBacSiTheoKhoa:", err);
      idBacSiEl.innerHTML = `<option value="">(Lỗi tải bác sĩ)</option>`;
    }
  }

  // ---------------- load options (khoa + hồ sơ y tế) ----------------
  async function loadOptions(defaultKhoaId = null, selectedBacSi = null, selectedHS = null) {
    try {
      const [khoaRes, hsRes] = await Promise.all([
        fetch("http://localhost:3000/api/khoa"),
        fetch("http://localhost:3000/api/admin/hosoyte")
      ]);

      if (!khoaRes.ok) throw new Error("Lỗi tải khoa");
      if (!hsRes.ok) throw new Error("Lỗi tải hồ sơ y tế");

      const [khoa, hs] = await Promise.all([khoaRes.json(), hsRes.json()]);

      // khoa
      if (Array.isArray(khoa) && khoa.length) {
        idKhoaEl.innerHTML = `<option value="">-- Chọn khoa --</option>` +
          khoa.map(k => `<option value="${k.idKhoa}">${safeText(k.tenKhoa)}</option>`).join("");
        // set default khoa if provided
        if (defaultKhoaId) idKhoaEl.value = defaultKhoaId;
      } else {
        idKhoaEl.innerHTML = `<option value="">(Không có khoa)</option>`;
      }

      // hồ sơ y tế
      if (Array.isArray(hs) && hs.length) {
        idHSEl.innerHTML = `<option value="">-- Chọn mã hồ sơ --</option>` +
          hs.map(h => `<option value="${h.idHoSoYTe}">HS#${h.idHoSoYTe} (KH#${h.idKH || ""})</option>`).join("");
        if (selectedHS) idHSEl.value = selectedHS;
      } else {
        idHSEl.innerHTML = `<option value="">(Không có hồ sơ y tế)</option>`;
      }

      // nếu có default khoa thì load bác sĩ theo khoa đó, còn không lấy khoa đầu
      const targetKhoa = defaultKhoaId || (Array.isArray(khoa) && khoa.length ? khoa[0].idKhoa : null);
      await loadBacSiTheoKhoa(targetKhoa, selectedBacSi);
    } catch (err) {
      console.error("❌ loadOptions:", err);
      idKhoaEl.innerHTML = `<option value="">(Lỗi tải khoa)</option>`;
      idHSEl.innerHTML = `<option value="">(Lỗi tải hồ sơ)</option>`;
      idBacSiEl.innerHTML = `<option value="">(Lỗi tải bác sĩ)</option>`;
    }
  }

  // ---------------- load bảng lịch sử ----------------
  async function loadData() {
    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("UNAUTHORIZED");
        }
        throw new Error("Lỗi lấy dữ liệu lịch sử");
      }
      const data = await res.json();
      tableBody.innerHTML = "";
      (data || []).forEach(row => {
        const tr = document.createElement("tr");
        tr.classList.add("border-t");
        // nếu ngày chứa 'T' xử lý; nếu không, in thẳng
        const ngay = safeText(row.ngayKham).includes("T") ? row.ngayKham.split("T")[0] : safeText(row.ngayKham);
        tr.innerHTML = `
          <td class="p-2">${row.idLS}</td>
          <td class="p-2">${ngay}</td>
          <td class="p-2">${safeText(row.ketLuan)}</td>
          <td class="p-2">${safeText(row.chiTiet)}</td>
          <td class="p-2">${safeText(row.tenBacSi || "")}</td>
          <td class="p-2">${safeText(row.tenKhoa || "")}</td>
          <td class="p-2">${safeText(row.idHoSoYTe || "")}</td>
          <td class="p-2 text-center">
            <button class="editBtn text-blue-600" data-id="${row.idLS}">✏️</button>
            <button class="delBtn text-red-600" data-id="${row.idLS}">🗑️</button>
          </td>
        `;
        tableBody.appendChild(tr);
      });
    } catch (err) {
      console.error("❌ loadData:", err);
      if (String(err.message).includes("UNAUTHORIZED")) {
        window.location.href = "../Khách hàng/trangchupre/trangchu1.html";
        return;
      }
      tableBody.innerHTML = `<tr><td colspan="8" class="p-4 text-red-600">Lỗi tải dữ liệu lịch sử khám</td></tr>`;
    }
  }

  // ---------------- sự kiện XÓA ----------------
  tableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest(".delBtn");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!confirm("Bạn có chắc muốn xóa bản ghi này?")) return;
    try {
      const res = await fetch(`${apiUrl}/${id}`, { method: "DELETE" });
      const result = await res.json();
      alert(result.message || "Đã xóa");
      await loadData();
    } catch (err) {
      console.error("❌ Xóa lỗi:", err);
      alert("Xảy ra lỗi khi xóa");
    }
  });

  // ---------------- sự kiện SỬA (mở modal với dữ liệu) ----------------
  tableBody.addEventListener("click", async (e) => {
    const btn = e.target.closest(".editBtn");
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      // cố gắng lấy một endpoint riêng (nếu server có):
      let record = null;
      try {
        const oneRes = await fetch(`${apiUrl}/${id}`); // server có thể hỗ trợ
        if (oneRes.ok) record = await oneRes.json();
      } catch (_) {
        // fallback: lấy toàn bộ rồi tìm
        const allRes = await fetch(apiUrl);
        const all = await allRes.json();
        record = all.find(r => String(r.idLS) === String(id));
      }
      if (!record) return alert("Không tìm thấy bản ghi để sửa");

      // hiển thị modal, set giá trị
      document.getElementById("lichsuTitle").innerText = "Sửa lịch sử khám";
      document.getElementById("idLS").value = record.idLS;
      // ngày có thể ở dạng 'YYYY-MM-DD' hoặc 'YYYY-MM-DDTHH:MM:SS'
      const ngayVal = safeText(record.ngayKham).includes("T") ? record.ngayKham.split("T")[0] : record.ngayKham;
      document.getElementById("ngayKhamLS").value = ngayVal || "";
      document.getElementById("ketLuanLS").value = record.ketLuan || "";
      document.getElementById("chiTietLS").value = record.chiTiet || "";

      // load options: truyền idKhoa/idBacSi/idHoSoYTe nếu server trả về (khuyến nghị server trả idBacSi,idKhoa)
      const defaultKhoaId = record.idKhoa || null;
      const defaultBacSiId = record.idBacSi || null;
      const defaultHS = record.idHoSoYTe || null;

      await loadOptions(defaultKhoaId, defaultBacSiId, defaultHS);

      // nếu server ko trả idBacSi/idKhoa mà chỉ trả tên -> cố gắng chọn bằng text
      if (!defaultBacSiId && record.tenBacSi) {
        const opt = Array.from(idBacSiEl.options).find(o => o.textContent.trim() === record.tenBacSi.trim());
        if (opt) idBacSiEl.value = opt.value;
      }
      if (!defaultKhoaId && record.tenKhoa) {
        const opt2 = Array.from(idKhoaEl.options).find(o => o.textContent.trim() === record.tenKhoa.trim());
        if (opt2) {
          idKhoaEl.value = opt2.value;
          // reload bác sĩ theo khoa mới
          await loadBacSiTheoKhoa(idKhoaEl.value, defaultBacSiId);
        }
      }

      modal.classList.remove("hidden");
    } catch (err) {
      console.error("❌ Sửa lỗi:", err);
      alert("Lỗi khi mở form sửa");
    }
  });

  // ---------------- mở modal thêm ----------------
  if (openBtn && modal && form) {
    openBtn.addEventListener("click", async () => {
      form.reset();
      document.getElementById("lichsuTitle").innerText = "Thêm lịch sử khám";
      document.getElementById("idLS").value = "";
      await loadOptions(); // load default options
      modal.classList.remove("hidden");
    });
  }

  // đóng modal
  if (closeBtn && modal) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  if (cancelBtn && modal) cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  // ---------------- submit form (thêm / sửa) ----------------
  if (form && modal) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("idLS").value;
    const payload = {
      ngayKham: document.getElementById("ngayKhamLS").value,
      ketLuan: document.getElementById("ketLuanLS").value.trim(),
      chiTiet: document.getElementById("chiTietLS").value.trim(),
      idBacSi: document.getElementById("idBacSiLS").value,
      idKhoa: document.getElementById("idKhoaLS").value,
      idHoSoYTe: document.getElementById("idHoSoYTeLS").value
    };

    // basic validation
    if (!payload.ngayKham || !payload.ketLuan || !payload.idBacSi || !payload.idKhoa || !payload.idHoSoYTe) {
      return alert("Vui lòng nhập đầy đủ thông tin bắt buộc (ngày, kết luận, bác sĩ, khoa, mã hồ sơ).");
    }

    try {
      const method = id ? "PUT" : "POST";
      const url = id ? `${apiUrl}/${id}` : apiUrl;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      alert(result.message || (id ? "Đã cập nhật" : "Đã thêm"));
      modal.classList.add("hidden");
      await loadData();
    } catch (err) {
      console.error("❌ Lưu lỗi:", err);
      alert("Lỗi khi lưu dữ liệu");
    }
  });
  }

  // khi thay đổi khoa trong modal -> cập nhật bác sĩ
  if (idKhoaEl) {
    idKhoaEl.addEventListener("change", (e) => {
      const v = e.target.value;
      loadBacSiTheoKhoa(v);
    });
  }

  // khởi tạo load
  loadData();
});
