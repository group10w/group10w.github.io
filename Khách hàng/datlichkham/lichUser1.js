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

// Hàm format ngày DD/MM/YYYY
function formatNgay(datetime) {
    const d = new Date(datetime);
    const day = String(d.getDate()).padStart(2,'0');
    const month = String(d.getMonth() + 1).padStart(2,'0'); // Tháng từ 0-11
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}
const lichList = document.getElementById("lichList");
const userId = parseInt(localStorage.getItem("userId"), 10);

(function requireAuth() {
    if (!localStorage.getItem("token") || !userId || localStorage.getItem("loggedIn") !== "true") {
        const onApiHost = /:(3000)$/.test(location.host) || location.pathname.startsWith("/customer");
        window.location.href = onApiHost
            ? "/customer/trangchupre/trangchu1.html"
            : "../trangchupre/trangchu1.html";
    }
})();

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

async function loadLichCuaToi() {
    if (!userId) {
        lichList.innerHTML = '<tr><td colspan="6">Bạn chưa đăng nhập!</td></tr>';
        return;
    }

    try {
        const res = await fetch(`http://localhost:3000/api/lich-user/${userId}`);
        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            lichList.innerHTML = '<tr><td colspan="6">Bạn chưa có lịch khám nào.</td></tr>';
            return;
        }

        lichList.innerHTML = data.map(l => {
            const status = String(l.trangThai || "").toLowerCase();
            return `
            <tr>
                <td>${escapeHtml(l.tenBacSi)}</td>
                <td>${escapeHtml(l.tenKhoa)}</td>
                <td>${escapeHtml(formatNgay(l.ngayKham))}</td>
                <td>${escapeHtml(String(l.gioKham || "").slice(0, 5))}</td>
                <td>${escapeHtml(l.trangThai)}</td>
                <td>${status === 'chờ xác nhận' ? `<button class="huy" onclick="huyLich(${Number(l.idLichKham)})">Hủy</button>` : ''}</td>
            </tr>
        `;
        }).join("");

    } catch (err) {
        console.error(err);
        lichList.innerHTML = '<tr><td colspan="6">Lỗi khi tải lịch khám!</td></tr>';
    }
}

async function huyLich(idLichKham) {
    if (!confirm("Bạn có chắc chắn muốn hủy lịch này?")) return;

    try {
        const res = await fetch("http://localhost:3000/api/huy-lich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idLichKham })
        });
        const data = await res.json();
        alert(data.message);
        if (data.success) loadLichCuaToi();
    } catch(err) {
        console.error(err);
        alert("Hủy lịch thất bại!");
    }
}

loadLichCuaToi();
