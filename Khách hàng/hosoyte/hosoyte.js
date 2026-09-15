// Tự động gửi token xác thực cho các API cần đăng nhập.
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
  const idKH = localStorage.getItem("userId");
  const token = localStorage.getItem("token");

  if (!idKH || !token || localStorage.getItem("loggedIn") !== "true") {
    alert("Vui lòng đăng nhập trước khi xem hồ sơ!");
    const onApiHost = /:(3000)$/.test(location.host) || location.pathname.startsWith("/customer");
    window.location.href = onApiHost
      ? "/customer/trangchupre/trangchu1.html"
      : "../trangchupre/trangchu1.html";
    return;
  }

  // Lấy thông tin hồ sơ y tế từ server
  fetch(`http://localhost:3000/hosoyte/${idKH}`)
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Lỗi tải hồ sơ");
      return data;
    })
    .then(data => {
      if (!data.benhnhan) {
        alert("Không tìm thấy hồ sơ!");
        return;
      }

      const b = data.benhnhan;

      // Hiển thị thông tin khách hàng
      document.getElementById("name").textContent = b.hoTen || "Chưa có";
      document.getElementById("gender").textContent = b.gioiTinh || "Chưa có";
      document.getElementById("dob").textContent = b.ngayThangNamSinh
        ? new Date(b.ngayThangNamSinh).toLocaleDateString('vi-VN')
        : "Chưa có";
      document.getElementById("recordId").textContent = "HS" + b.idKH;
      document.getElementById("cccd").textContent = b.CCCD || b.cccd || "Chưa có";
      document.getElementById("diaChi").textContent = b.diaChi || b.diachi || "Chưa có";

      // Hiển thị lịch sử khám từ LICHSUKHAMBENH
      const table = document.getElementById("recordTable");
      table.innerHTML = "";

      if (!data.lichsu || data.lichsu.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="4" style="text-align:center;">Chưa có lịch sử khám</td>`;
        table.appendChild(tr);
      } else {
        data.lichsu.forEach(item => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${item.ngayKham ? new Date(item.ngayKham).toLocaleDateString('vi-VN') : 'Chưa có'}</td>
            <td>${escapeHtml(item.bacSi || 'Chưa có')}</td>
            <td>${escapeHtml(item.khoa || 'Chưa có')}</td>
            <td>${escapeHtml(item.ketLuan || 'Chưa có')}</td>
          `;
          tr.onclick = () => showDetail(item.chiTiet || "Chưa có chi tiết");
          table.appendChild(tr);
        });
      }
    })
    .catch(err => {
      console.error(err);
      alert(err.message || "Lỗi khi tải hồ sơ y tế!");
    });
});

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

// Hiển thị chi tiết khi click vào dòng
function showDetail(text) {
  document.getElementById("detailText").textContent = text;
}
