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
  const tableBody = document.querySelector("#lichTable tbody");
  if (!tableBody) return;

  const apiUrl = "http://localhost:3000/api/admin/lichkham";

  const modal = document.getElementById("lichModal");
  const openBtn = document.getElementById("openAddLich");
  const closeBtn = document.getElementById("closeLichModal");
  const cancelBtn = document.getElementById("cancelLich");
  const form = document.getElementById("lichForm");

  const idKHInput = document.getElementById("idKH");
  const hoTen = document.getElementById("hoTen");
  const lyDo = document.getElementById("lyDo");
  const ngayKham = document.getElementById("ngayKham");
  const gioKham = document.getElementById("gioKham");
  const idKhoa = document.getElementById("idKhoa");
  const idBacSi = document.getElementById("idBacSi");

  function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/[&<>"']/g, m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  // 🧾 Load danh sách lịch khám
  async function loadAppointments() {
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="10" class="p-2 text-gray-500">Đang tải...</td></tr>';

    try {
      const res = await fetch(apiUrl);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("UNAUTHORIZED");
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const payload = await res.json();
      const data = Array.isArray(payload) ? payload : (payload?.data || []);

      tableBody.innerHTML = "";
      if (!Array.isArray(data) || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" class="p-2 text-gray-500">Không có lịch khám nào</td></tr>';
        return;
      }

      data.forEach((row) => {
        const tr = document.createElement("tr");
        tr.classList.add("border-t");
        const status = String(row.trangThai || "").toLowerCase();
        tr.innerHTML = `
          <td class="p-2">${escapeHtml(row.idLichKham)}</td>
          <td class="p-2">${escapeHtml(row.idKH || "-")}</td>
          <td class="p-2">${escapeHtml(row.hoTen)}</td>
          <td class="p-2">${escapeHtml(row.lyDo || "")}</td>
          <td class="p-2">${escapeHtml(row.ngayKham)}</td>
          <td class="p-2">${escapeHtml(String(row.gioKham || "").slice(0, 5))}</td>
          <td class="p-2">${escapeHtml(row.tenBacSi)}</td>
          <td class="p-2">${escapeHtml(row.tenKhoa)}</td>
          <td class="p-2">
            <select data-id="${escapeHtml(row.idLichKham)}" class="border rounded px-2 py-1 text-sm">
              <option value="chờ xác nhận" ${status === "chờ xác nhận" ? "selected" : ""}>chờ xác nhận</option>
              <option value="đã xác nhận" ${status === "đã xác nhận" ? "selected" : ""}>đã xác nhận</option>
              <option value="đã hủy" ${status === "đã hủy" ? "selected" : ""}>đã hủy</option>
            </select>
          </td>
          <td class="p-2 text-center">
            <button data-id="${escapeHtml(row.idLichKham)}" class="delBtn text-red-600">🗑️</button>
          </td>
        `;
        tableBody.appendChild(tr);
      });
    } catch (err) {
      console.error("❌ Lỗi tải lịch khám:", err);
      if (String(err.message).includes("UNAUTHORIZED")) {
        window.location.href = "../Khách hàng/trangchupre/trangchu1.html";
        return;
      }
      tableBody.innerHTML = '<tr><td colspan="10" class="p-2 text-red-600">Không thể tải dữ liệu lịch khám. Vui lòng kiểm tra kết nối hoặc đăng nhập admin.</td></tr>';
    }
  }

  // 📘 Load danh sách khoa + bác sĩ
  async function loadOptions() {
    try {
      const khoaRes = await fetch("http://localhost:3000/api/khoa");
      if (!khoaRes.ok) throw new Error(`HTTP ${khoaRes.status}`);
      const khoaData = await khoaRes.json();
      idKhoa.innerHTML = '<option value="">-- Chọn khoa --</option>';
      (Array.isArray(khoaData) ? khoaData : []).forEach((k) =>
        idKhoa.innerHTML += `<option value="${escapeHtml(k.idKhoa)}">${escapeHtml(k.tenKhoa)}</option>`
      );

      idKhoa.addEventListener("change", async () => {
        const id = idKhoa.value;
        if (!id) return;
        try {
          const res = await fetch(`http://localhost:3000/api/bacsi/${id}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          idBacSi.innerHTML = '<option value="">-- Chọn bác sĩ --</option>';
          (Array.isArray(data) ? data : []).forEach((b) =>
            idBacSi.innerHTML += `<option value="${escapeHtml(b.idBacSi)}">${escapeHtml(b.hoTenBacSi)} (${escapeHtml(b.hocVi)})</option>`
          );
        } catch (err) {
          console.error("❌ Lỗi tải bác sĩ:", err);
          idBacSi.innerHTML = '<option value="">-- Không tải được bác sĩ --</option>';
        }
      });
    } catch (err) {
      console.error("❌ Lỗi tải khoa:", err);
      idKhoa.innerHTML = '<option value="">-- Không tải được khoa --</option>';
    }
  }

  // ✏️ Cập nhật trạng thái lịch khám
  tableBody.addEventListener("change", async (e) => {
    if (e.target.tagName === "SELECT") {
      const id = e.target.dataset.id;
      const trangThai = e.target.value;
      await fetch(`${apiUrl}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trangThai }),
      });
    }
  });

  // 🗑️ Xóa lịch khám
  tableBody.addEventListener("click", async (e) => {
    if (e.target.classList.contains("delBtn")) {
      const id = e.target.dataset.id;
      if (confirm("Bạn có chắc muốn xóa lịch khám này không?")) {
        await fetch(`${apiUrl}/${id}`, { method: "DELETE" });
        loadAppointments();
      }
    }
  });

  // ➕ Mở modal thêm lịch
  if (openBtn && modal && form) {
    openBtn.addEventListener("click", () => {
      modal.classList.remove("hidden");
      form.reset();
    });
  }
  if (closeBtn && modal) closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  if (cancelBtn && modal) cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  // 🧩 Thêm lịch khám — kiểm tra idKH tồn tại
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const idKH = idKHInput.value.trim();
    const hoTenVal = hoTen.value.trim();
    const lyDoVal = lyDo.value.trim();
    const ngayKhamVal = ngayKham.value;
    const gioKhamVal = gioKham.value;
    const idBacSiVal = idBacSi.value;
    const idKhoaVal = idKhoa.value;

    if (!idKH || !hoTenVal || !ngayKhamVal || !gioKhamVal || !idBacSiVal || !idKhoaVal) {
      return alert("⚠️ Vui lòng nhập đầy đủ thông tin!");
    }

    try {
      const checkKH = await fetch(`http://localhost:3000/api/admin/khachhang/${idKH}`);
      if (!checkKH.ok) throw new Error(`HTTP ${checkKH.status}`);
      const khData = await checkKH.json();

      if (!khData.exists) {
        return alert("❌ ID khách hàng không tồn tại trong hệ thống!");
      }

      const res = await fetch("http://localhost:3000/api/admin/lichkham", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idKH,
          hoTen: hoTenVal,
          lyDo: lyDoVal,
          ngayKham: ngayKhamVal,
          gioKham: gioKhamVal,
          idBacSi: idBacSiVal,
          idKhoa: idKhoaVal,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const result = await res.json();
      alert(result.message || "Thêm lịch khám thành công");
      modal.classList.add("hidden");
      loadAppointments();
    } catch (err) {
      console.error("❌ Lỗi thêm lịch khám:", err);
      alert("Không thể thêm lịch khám. Vui lòng kiểm tra server hoặc quyền admin.");
    }
  });

  // ✅ Khởi động
  loadAppointments();
  loadOptions();
});
