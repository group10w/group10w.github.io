// --- QUẢN LÝ TÀI KHOẢN (XEM + XÓA) ---
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

const API_BASE = "http://localhost:3000"; // ← dùng URL tuyệt đối cho chắc chắn
const API_TAIKHOAN = API_BASE + "/api/taikhoan";

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

async function loadAccounts() {
	try {
		console.log("[accounts] gọi API", API_TAIKHOAN);
		const res = await fetch(API_TAIKHOAN);
		if (!res.ok) {
			const text = await res.text();
			if (res.status === 401 || res.status === 403) {
				throw new Error("UNAUTHORIZED");
			}
			throw new Error("API trả về lỗi: " + res.status + " - " + text);
		}
		const data = await res.json();
		console.log("[accounts] dữ liệu nhận:", data);

		const tbody = document.getElementById("accountList");
		if (!tbody) {
			console.error("Không tìm thấy #accountList trong DOM");
			return;
		}
		tbody.innerHTML = "";

		if (!Array.isArray(data) || data.length === 0) {
			tbody.innerHTML = `<tr><td colspan="5" class="text-center p-2 text-gray-500">Không có tài khoản nào</td></tr>`;
			return;
		}

		data.forEach((acc) => {
			const tr = document.createElement("tr");
			tr.classList.add("border-t");
			tr.innerHTML = `
          <td class="p-2">${escapeHtml(acc.idKH ?? "")}</td>
          <td class="p-2">${escapeHtml(acc.hoTen ?? "")}</td>
          <td class="p-2">${escapeHtml(acc.gioiTinh ?? "")}</td>
          <td class="p-2">${escapeHtml(acc.sdt ?? "")}</td>
          <td class="p-2">
            <button onclick="deleteAccount(${Number(acc.idKH)})" class="text-red-500 hover:underline">Xóa</button>
          </td>
        `;
			tbody.appendChild(tr);
		});
	} catch (err) {
		console.error("Lỗi khi tải danh sách tài khoản:", err);
		if (String(err.message).includes("UNAUTHORIZED")) {
			window.location.href = "../Khách hàng/trangchupre/trangchu1.html";
			return;
		}
		const tbody = document.getElementById("accountList");
		if (tbody) {
			tbody.innerHTML = `<tr><td colspan="5" class="text-center p-2 text-red-500">Lỗi khi tải dữ liệu. Kiểm tra console.</td></tr>`;
		}
	}
}

async function deleteAccount(idKH) {
  if (!confirm("Bạn có chắc muốn xóa tài khoản này không?")) return;
  try {
    const url = `${API_TAIKHOAN}/${idKH}`;
    const res = await fetch(url, { method: "DELETE" });
    const result = await res.json();

    // Nếu có liên kết => hỏi lại người dùng
    if (result.requireConfirm) {
      const msg = `${result.message}\n\nChọn OK để xóa toàn bộ, Cancel để hủy.`;
      if (confirm(msg)) {
        const forceRes = await fetch(`${url}?force=true`, { method: "DELETE" });
        const forceJson = await forceRes.json();
        alert(forceJson.message || "Đã xóa tài khoản và dữ liệu liên quan!");
      } else {
        alert("❎ Đã hủy thao tác xóa.");
      }
    } else {
      alert(result.message || "🗑️ Xóa tài khoản thành công!");
    }

    loadAccounts();
  } catch (err) {
    console.error("Lỗi khi xóa tài khoản:", err);
    alert("Xảy ra lỗi khi xóa. Kiểm tra console.");
  }
}

// Gọi loadAccounts khi admin click menu "Quản lý Tài khoản"
const accBtn = document.querySelector('button[data-page="accounts"]');
if (accBtn) {
	accBtn.addEventListener("click", () => {
		// showPage sẽ hiển thị section; gọi load ngay sau để dữ liệu hiển thị
		loadAccounts();
	});
} else {
	// fallback: nếu không tìm thấy button, tải khi DOM sẵn sàng (giúp debug)
	window.addEventListener("DOMContentLoaded", loadAccounts);
}
