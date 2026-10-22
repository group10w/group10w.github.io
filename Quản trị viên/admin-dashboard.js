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
    console.log("✅ Dashboard JS loaded");
    
    // Load dashboard khi click vào menu Dashboard
    const dashboardBtn = document.querySelector('button[data-page="dashboard"]');
    if (dashboardBtn) {
        dashboardBtn.addEventListener('click', () => {
            loadDashboardData();
            loadRecentActivities();
        });
    }
    
    // Load ngay khi trang load (nếu dashboard là trang mặc định)
    const dashboardSection = document.querySelector('section[data-page="dashboard"]');
    if (dashboardSection && !dashboardSection.classList.contains('hidden')) {
        loadDashboardData();
        loadRecentActivities();
    }
    
    // Auto refresh hoạt động mỗi 30 giây
    setInterval(loadRecentActivities, 30000);
});

// ==============================
// 1. Lấy dữ liệu thống kê dashboard
// ==============================
async function loadDashboardData() {
    console.log("📊 Đang tải dữ liệu dashboard...");
    
    try {
        const res = await fetch("http://localhost:3000/api/dashboard");
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                throw new Error("UNAUTHORIZED");
            }
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        console.log("✅ Dữ liệu nhận được:", data);

        const totalRecords = document.getElementById("totalRecords");
        const totalDoctors = document.getElementById("totalDoctors");
        const todayAppointments = document.getElementById("todayAppointments");
        const newContacts = document.getElementById("newContacts");

        if (totalRecords) totalRecords.innerText = data.totalRecords || 0;
        if (totalDoctors) totalDoctors.innerText = data.totalDoctors || 0;
        if (todayAppointments) todayAppointments.innerText = data.todayAppointments || 0;
        if (newContacts) newContacts.innerText = data.newContacts || 0;

        // 📈 GỌI HÀM VẼ BIỂU ĐỒ
        loadDailyAppointmentsChart();

    } catch (error) {
        console.error("❌ Lỗi load dashboard:", error);
        if (String(error.message).includes("UNAUTHORIZED")) {
            window.location.href = (/:(3000)$/.test(location.host) || location.pathname.startsWith("/admin-panel"))
                ? "/customer/trangchupre/trangchu1.html"
                : "../Khách hàng/trangchupre/trangchu1.html";
            return;
        }
        alert("Không thể tải dữ liệu thống kê. Vui lòng kiểm tra console.");
    }
}

// ==============================
// 2. Lấy danh sách hoạt động gần đây
// ==============================
async function loadRecentActivities() {
    console.log("🕒 Đang tải hoạt động gần đây...");
    
    try {
        const res = await fetch("http://localhost:3000/api/hoatdong");
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                throw new Error("UNAUTHORIZED");
            }
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        console.log("✅ Hoạt động nhận được:", data);

        const container = document.getElementById("recentActivities");
        if (!container) return;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div class="text-slate-400 text-center py-4">Chưa có hoạt động nào</div>';
            return;
        }

        // Render danh sách hoạt động
        container.innerHTML = data.map(item => {
            const iconMap = {
                "THÊM BÁC SĨ": "👨‍⚕️",
                "XÓA BÁC SĨ": "🗑️",
                "THÊM LỊCH KHÁM": "📅",
                "CẬP NHẬT LỊCH": "✏️",
                "THÊM KHOA": "🏥",
                "XÓA KHOA": "🗑️",
                "THÊM HỒ SƠ": "📋",
                "XÓA HỒ SƠ": "🗑️"
            };
            
            const icon = iconMap[item.loaiHoatDong] || "📌";
            
            return `
                <div class="flex gap-2 items-start py-2 border-b border-slate-100 last:border-0">
                    <span class="text-lg">${icon}</span>
                    <div class="flex-1">
                        <div class="text-slate-700 text-xs">${escapeHtml(item.moTa)}</div>
                        <div class="text-slate-400 text-xs mt-1">${item.thoiGian}</div>
                    </div>
                </div>
            `;
        }).join("");

    } catch (error) {
        console.error("❌ Lỗi load hoạt động:", error);
        if (String(error.message).includes("UNAUTHORIZED")) {
            window.location.href = (/:(3000)$/.test(location.host) || location.pathname.startsWith("/admin-panel"))
                ? "/customer/trangchupre/trangchu1.html"
                : "../Khách hàng/trangchupre/trangchu1.html";
            return;
        }
        const container = document.getElementById("recentActivities");
        if (container) {
            container.innerHTML = '<div class="text-red-500 text-center py-4">Lỗi tải hoạt động</div>';
        }
    }
}

// Helper: Escape HTML để tránh XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// ==============================
// 3. LOGIC BIỂU ĐỒ (CHART.JS)
// ==============================
async function loadDailyAppointmentsChart() {
    // Yêu cầu: Đảm bảo đã nhúng Chart.js CDN vào admin.html
    console.log("📈 Đang tải dữ liệu biểu đồ...");
    
    try {
        const res = await fetch("http://localhost:3000/api/dashboard/daily-appointments");
        
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) {
                throw new Error("UNAUTHORIZED");
            }
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        
        const labels = data.map(item => {
            // Format date to DD/MM for display
            const [year, month, day] = item.date.split('-');
            return `${day}/${month}`;
        });
        const counts = data.map(item => item.count);
        
        // Render Chart
        renderChart(labels, counts);

    } catch (error) {
        console.error("❌ Lỗi load biểu đồ:", error);
        if (String(error.message).includes("UNAUTHORIZED")) {
            window.location.href = (/:(3000)$/.test(location.host) || location.pathname.startsWith("/admin-panel"))
                ? "/customer/trangchupre/trangchu1.html"
                : "../Khách hàng/trangchupre/trangchu1.html";
            return;
        }
        const chartContainer = document.getElementById("chartPlaceholder");
        if (chartContainer) {
            chartContainer.innerHTML = '<div class="text-red-500 text-center py-4">Không thể tải biểu đồ lịch khám. (Kiểm tra Chart.js đã được nhúng chưa)</div>';
        }
    }
}

function renderChart(labels, data) {
    const chartArea = document.getElementById('chartCanvas');
    if (!chartArea) return; 

    // Dùng biến toàn cục để lưu instance, tránh vẽ lại
    if (window.appointmentChart instanceof Chart) {
        window.appointmentChart.destroy();
    }
    
    window.appointmentChart = new Chart(chartArea, {
        type: 'bar', // Biểu đồ cột
        data: {
            labels: labels,
            datasets: [{
                label: 'Số Lịch Khám',
                data: data,
                backgroundColor: 'rgba(56, 189, 248, 0.7)', // Màu xanh nhạt (Tailwind sky-400)
                borderColor: 'rgba(56, 189, 248, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Số Lượt'
                    },
                    ticks: {
                        stepSize: 1,
                        precision: 0 // Đảm bảo hiển thị số nguyên
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Ngày'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: 'Lịch Khám 30 Ngày Gần Nhất'
                }
            }
        }
    });
}
