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
  const API = "http://localhost:3000/api/khoa";
  const tableBody = document.querySelector("#deptTable tbody");
  if (!tableBody) return;

  const openAddBtn = document.getElementById("openAddDept");
  const refreshBtn = document.getElementById("refreshDept");

  const modal = document.getElementById("deptModal");
  const form = document.getElementById("deptForm");
  const idInput = document.getElementById("deptIdKhoa");
  const nameInput = document.getElementById("tenKhoa");
  const title = document.getElementById("deptModalTitle");
  const closeBtn = document.getElementById("closeDeptModal");
  const cancelBtn = document.getElementById("cancelDept");

  function escapeHtml(str) {
    return str ? str.replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])) : "";
  }

  // 📋 Load danh sách khoa
  async function loadData() {
    tableBody.innerHTML = `<tr><td colspan="3" class="p-2 text-gray-500">Đang tải...</td></tr>`;
    try {
      const res = await fetch(API);
      const data = await res.json();
      tableBody.innerHTML = "";
      if (!Array.isArray(data) || !data.length) {
        tableBody.innerHTML = `<tr><td colspan="3" class="p-2 text-gray-500">Chưa có khoa nào</td></tr>`;
        return;
      }
      data.forEach((khoa) => {
        const tr = document.createElement("tr");
        tr.classList.add("border-t");
        tr.innerHTML = `
          <td class="p-2">${escapeHtml(String(khoa.idKhoa))}</td>
          <td class="p-2">${escapeHtml(khoa.tenKhoa)}</td>
          <td class="p-2 text-center">
            <button class="editBtn text-blue-600 mr-2" data-id="${khoa.idKhoa}" data-name="${encodeURIComponent(khoa.tenKhoa)}">✏️</button>
            <button class="delBtn text-red-600" data-id="${khoa.idKhoa}">🗑️</button>
          </td>`;
        tableBody.appendChild(tr);
      });
    } catch (err) {
      console.error("❌ Lỗi tải danh sách khoa:", err);
      tableBody.innerHTML = `<tr><td colspan="3" class="text-red-600 p-2">Lỗi tải dữ liệu</td></tr>`;
    }
  }

  // ➕ Mở modal thêm
  if (openAddBtn && form && modal && idInput && title) {
    openAddBtn.addEventListener("click", () => {
      form.reset();
      idInput.value = "";
      title.textContent = "Thêm khoa";
      modal.classList.remove("hidden");
    });
  }

  // 🧩 Đóng modal
  [closeBtn, cancelBtn].forEach((btn) => {
    if (btn && modal) btn.addEventListener("click", () => modal.classList.add("hidden"));
  });

  // 💾 Thêm / Sửa
  if (!form || !idInput || !nameInput || !modal) return;
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const id = idInput.value;
    const tenKhoa = nameInput.value.trim();
    if (!tenKhoa) return alert("Tên khoa không được để trống!");

    try {
      const method = id ? "PUT" : "POST";
      const url = id ? `${API}/${id}` : API;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenKhoa })
      });
      const data = await res.json();
      alert(data.message || (id ? "Cập nhật thành công" : "Thêm thành công"));
      modal.classList.add("hidden");
      loadData();
    } catch (err) {
      console.error("❌ Lỗi lưu khoa:", err);
      alert("Lỗi khi lưu khoa");
    }
  });

  // ✏️ Sửa
  tableBody.addEventListener("click", e => {
    const editBtn = e.target.closest(".editBtn");
    if (!editBtn) return;
    idInput.value = editBtn.dataset.id;
    nameInput.value = decodeURIComponent(editBtn.dataset.name);
    title.textContent = "Sửa khoa";
    modal.classList.remove("hidden");
  });

  // 🗑️ Xóa
  tableBody.addEventListener("click", async e => {
    const delBtn = e.target.closest(".delBtn");
    if (!delBtn) return;
    const id = delBtn.dataset.id;
    if (!confirm("Bạn có chắc muốn xóa khoa này không?")) return;

    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE" });
      const result = await res.json();

      // Nếu cần xác nhận xóa dây chuyền
      if (result.requireConfirm && Array.isArray(result.doctors)) {
        let msg = `${result.message}\n\nChi tiết:\n`;
        result.doctors.forEach(b => {
          msg += `- ${b.hoTenBacSi} (Lịch khám: ${b.lichCount}, Lịch sử: ${b.lichsuCount})\n`;
        });
        msg += "\nChọn OK để xóa toàn bộ, Cancel để hủy.";
        if (confirm(msg)) {
          const forceRes = await fetch(`${API}/${id}?force=true`, { method: "DELETE" });
          const j2 = await forceRes.json();
          alert(j2.message || "Đã xóa khoa và toàn bộ dữ liệu liên quan!");
        } else {
          alert("❎ Đã hủy thao tác xóa.");
        }
      } else {
        alert(result.message || "🗑️ Đã xóa khoa thành công!");
      }

      loadData();
    } catch (err) {
      console.error("❌ Lỗi xóa khoa:", err);
      alert("Lỗi khi xóa khoa");
    }
  });

  if (refreshBtn) refreshBtn.addEventListener("click", loadData);
  loadData();
});
