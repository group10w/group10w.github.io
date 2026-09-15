// account.js
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

(function requireAuth() {
    if (!localStorage.getItem("token") || !localStorage.getItem("userId") || localStorage.getItem("loggedIn") !== "true") {
        const onApiHost = /:(3000)$/.test(location.host) || location.pathname.startsWith("/customer");
        window.location.href = onApiHost
            ? "/customer/trangchupre/trangchu1.html"
            : "../trangchupre/trangchu1.html";
        throw new Error("AUTH_REQUIRED");
    }
})();

// ===============================================================
// 1. NAVIGATION
// ===============================================================

const navItems = document.querySelectorAll('.side-nav .nav-item');
const contentSections = document.querySelectorAll('.content-section');

// Khai báo biến toàn cục để lưu trữ lịch sử khám bệnh
let medicalHistoryData = [];
const medicalHistoryTableBody = document.querySelector('.medical-history-table tbody');
const medicalDetailPlaceholder = document.querySelector('.medical-record-detail .detail-placeholder');


navItems.forEach(item => {
    item.addEventListener('click', function (e) {
        e.preventDefault();

        navItems.forEach(n => n.classList.remove('active'));
        contentSections.forEach(sec => sec.classList.remove('active'));

        this.classList.add('active');
        const targetId = this.getAttribute('href').substring(1);
        const target = document.getElementById(targetId + "-section");
        if (target) target.classList.add('active');

        // GỌI HÀM TẢI DỮ LIỆU KHI CHUYỂN SANG TAB LỊCH SỬ KHÁM BỆNH
        if (targetId === 'medical-history') {
            loadMedicalHistory();
        }
        // GỌI HÀM TẢI DỮ LIỆU KHI CHUYỂN SANG TAB LỊCH KHÁM
        if (targetId === 'appointments') {
             // Reset về tab "Tất cả" khi vào lại
             document.querySelector('.appointment-filter-nav .filter-btn[data-status="all"]').click();
        }
    });
});

document.addEventListener("DOMContentLoaded", () => {
    if (window.location.hash) {
        const hash = window.location.hash.replace("#", "");
        const nav = document.querySelector(`a[href="#${hash}"]`);
        if (nav) nav.click();
    }
    loadUserData();
    // Load mặc định danh sách lịch khám khi DOMContentLoaded
    loadAppointments(); 
});

// ===============================================================
// 2. PROFILE LOGIC
// ===============================================================

const API_BASE_URL = "http://localhost:3000/api";
let currentUserId = localStorage.getItem("userId");
let initialUserData = {};

const profileForm = document.getElementById("profileForm");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");


// ================================
// TOAST
// ================================
function showToast(message) {
    const toast = document.getElementById("customToast");
    const body = toast.querySelector(".toast-body");

    body.textContent = message;

    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

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

// ================================
// LOAD DATA
// ================================
async function loadUserData() {
    if (!currentUserId) return;

    try {
        const res = await fetch(`${API_BASE_URL}/khachhang/${currentUserId}`);
        const data = await res.json();

        if (!res.ok) return showToast("Lỗi tải dữ liệu: " + data.message);

        initialUserData = data;
        populateData(data);

    } catch (e) {
        console.error("Network error:", e);
        showToast("Không thể kết nối máy chủ!");
    }
}
function maskPhoneNumber(phone) {
    if (!phone || phone.length < 2) return phone;
    const lastTwo = phone.slice(-2);
    return "*".repeat(phone.length - 2) + lastTwo;
}
// ================================
// FILL UI
// ================================
function populateData(user) {
    const { hoTen, gioitinh, ngayThangNamSinh, cccd, diachi, sdt } = user;
    // --- Cập nhật tên hiển thị trên avatar ---
    const userNameBtn = document.getElementById('userNameDisplay');
    if (userNameBtn) {
        userNameBtn.textContent = hoTen || "[Tên khách hàng]";
    }
    // ---- Điền các trường ----
    fillField("hoten", hoTen);
    fillField("cccd", cccd);
    fillField("diachi", diachi);

    // ---- Ngày sinh ----
    if (ngayThangNamSinh) {
        const d = new Date(ngayThangNamSinh);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();

        document.getElementById("display_ngaysinh").textContent = `${day}/${month}/${year}`;
        document.getElementById("input_ngaysinh").value = `${year}-${month}-${day}`;
    } else {
        fillField("ngaysinh", "");
        document.getElementById("display_ngaysinh").classList.add("not-available");
    }

    // ---- Giới tính ----
    document.querySelectorAll('input[name="gioitinh"]').forEach(r => {
        r.checked = (r.value === gioitinh);
    });

    // === MASK SĐT ===
    const sdtDisplay = document.getElementById("display_sdt");
    if (sdtDisplay) sdtDisplay.textContent = sdt ? maskPhoneNumber(sdt) : "N/A";

    disableSaveButton();
}

function fillField(field, value) {
    const disp = document.getElementById(`display_${field}`);
    const input = document.getElementById(`input_${field}`);

    if (!disp || !input) return;

    disp.textContent = value || "Chưa có";
    input.value = value || "";
    
    // Thêm/xóa class not-available cho trường hiển thị
    if (value && value.trim() !== "") {
        disp.classList.remove("not-available");
    } else {
        disp.classList.add("not-available");
    }
}

// ===============================================================
// ENABLE / DISABLE SAVE
// ===============================================================
function enableSaveButton() {
    saveProfileBtn.disabled = false;
    saveProfileBtn.classList.add('active');
    saveProfileBtn.classList.remove('disabled'); // xóa class cũ màu xám
    cancelEditBtn.classList.add('active');
    cancelEditBtn.classList.remove('hidden'); // hiển thị nút Hủy
}

function disableSaveButton() {
    saveProfileBtn.disabled = true;
    saveProfileBtn.classList.remove('active');
    saveProfileBtn.classList.add('disabled'); // đưa về màu xám
    cancelEditBtn.classList.remove('active');
    cancelEditBtn.classList.add('hidden'); // ẩn nút Hủy
}

// ===============================================================
// DETECT FORM CHANGES
// ===============================================================

function checkFormState() {
    const newData = {
        hoTen: document.getElementById("input_hoten").value.trim(),
        ngayThangNamSinh: document.getElementById("input_ngaysinh").value,
        cccd: document.getElementById("input_cccd").value.trim(),
        diachi: document.getElementById("input_diachi").value.trim(),
        gioitinh: document.querySelector('input[name="gioitinh"]:checked')?.value || null
    };

    // Format ngày để so sánh
    const initialDate = initialUserData.ngayThangNamSinh
        ? new Date(initialUserData.ngayThangNamSinh).toISOString().substring(0, 10)
        : "";

    // Phải đảm bảo giá trị ban đầu là chuỗi rỗng nếu là null để so sánh đúng
    const compareData = {
        hoTen: initialUserData.hoTen || "",
        ngayThangNamSinh: initialDate || "",
        cccd: initialUserData.cccd || "",
        diachi: initialUserData.diachi || "",
        gioitinh: initialUserData.gioitinh || ""
    };

    return Object.keys(newData).some(field => newData[field] !== compareData[field]);
}

profileForm.addEventListener("input", () => {
    if (checkFormState()) enableSaveButton();
    else disableSaveButton();
});

document.querySelectorAll('input[name="gioitinh"]').forEach(radio => {
    radio.addEventListener("change", () => {
        if (checkFormState()) enableSaveButton();
        else disableSaveButton();
    });
});

// ===============================================================
// EDIT BUTTONS (THAY ĐỔI)
// ===============================================================

document.querySelectorAll("#profileForm .info-row").forEach(row => {
    const btn = row.querySelector(".btn-change");
    const display = row.querySelector(".info-display");
    const input = row.querySelector(".info-input");

    if (!btn || !input) return;

    btn.addEventListener("click", () => {
        const isEditing = row.classList.toggle("editing");

        if (isEditing) {
            display.style.display = "none";
            input.classList.remove("hidden");
            input.style.display = "block";
            btn.textContent = "Hủy"; // đổi chữ khi đang edit
        } else {
            // Khi hủy chỉnh sửa, khôi phục giá trị input về giá trị ban đầu
            const fieldName = input.id.replace('input_', '');
            let initialValue = initialUserData[fieldName] || "";

            if (fieldName === 'ngaysinh' && initialUserData.ngayThangNamSinh) {
                 initialValue = new Date(initialUserData.ngayThangNamSinh).toISOString().substring(0, 10);
            }

            input.value = initialValue;

            display.style.display = "block";
            input.style.display = "none";
            btn.textContent = "Thay đổi"; // đổi lại chữ khi hủy
        }
        
        // Kiểm tra lại trạng thái form sau khi Hủy/Thay đổi
        if (checkFormState()) enableSaveButton();
        else disableSaveButton();
    });
});

// ===============================================================
// CANCEL EDIT
// ===============================================================

cancelEditBtn.addEventListener("click", () => {
    // 1. Khôi phục dữ liệu hiển thị và input về giá trị ban đầu
    populateData(initialUserData);

    // 2. Ẩn tất cả các input đang chỉnh sửa
    document.querySelectorAll("#profileForm .info-row").forEach(row => {
        row.classList.remove("editing");
        const input = row.querySelector(".info-input");
        const disp = row.querySelector(".info-display");
        const btn = row.querySelector(".btn-change");

        // Bỏ hiển thị input và hiện display
        if (input) input.style.display = "none";
        if (disp) disp.style.display = "block";
        
        // Reset nút "Hủy" thành "Thay đổi"
        if (btn && btn.textContent === "Hủy") btn.textContent = "Thay đổi";
    });
    
    // 3. Vô hiệu hóa nút Lưu
    disableSaveButton();
});

// ===============================================================
// SAVE PROFILE
// ===============================================================

profileForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (saveProfileBtn.disabled) return;

    const data = {
        hoTen: document.getElementById("input_hoten").value.trim(),
        ngayThangNamSinh: document.getElementById("input_ngaysinh").value,
        cccd: document.getElementById("input_cccd").value.trim(),
        diachi: document.getElementById("input_diachi").value.trim(),
        gioitinh: document.querySelector('input[name="gioitinh"]:checked')?.value || null
    };

    if (!data.hoTen) return showToast("❌ Họ tên không được để trống!");

    try {
        const res = await fetch(`${API_BASE_URL}/khachhang/${currentUserId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        const result = await res.json();
        if (!res.ok) return showToast("❌ " + result.message);

        showToast("Cập nhật thành công!");
        await loadUserData(); // Tải lại dữ liệu mới nhất vào initialUserData

        // 2️⃣ Reset giao diện: ẩn input, hiện display, reset nút Thay đổi/Hủy
        document.querySelectorAll("#profileForm .info-row").forEach(row => {
            row.classList.remove("editing");

            const input = row.querySelector(".info-input");
            const disp = row.querySelector(".info-display");
            const btn = row.querySelector(".btn-change");

            if (input) input.style.display = "none";
            if (disp) disp.style.display = "block";
            if (btn && btn.textContent === "Hủy") btn.textContent = "Thay đổi";
        });

        disableSaveButton();

    } catch (err) {
        console.error(err);
        showToast("❌ Lỗi kết nối server");
    }
});
// ===============================================================
// PASSWORD CHANGE LOGIC
// ===============================================================
const passOld = document.getElementById("passOld");
const passNew = document.getElementById("passNew");
const passConfirm = document.getElementById("passConfirm");

const passOldErr = document.getElementById("passOldErr");
const passNewErr = document.getElementById("passNewErr");
const passConfirmErr = document.getElementById("passConfirmErr");

const savePassBtn = document.getElementById("savePasswordBtn");
const cancelPassBtn = document.getElementById("cancelPasswordBtn");


// ===== Hàm kiểm tra trạng thái form =====
function updatePassButtons() {
    const oldVal = passOld.value.trim();
    const newVal = passNew.value.trim();
    const confirmVal = passConfirm.value.trim();

    // Nút Hủy hiện nếu ít nhất 1 ô có dữ liệu
    if (oldVal || newVal || confirmVal) {
        cancelPassBtn.classList.remove("hidden");
        cancelPassBtn.classList.add("active");
    } else {
        cancelPassBtn.classList.add("hidden");
        cancelPassBtn.classList.remove("active");
    }

    // Nút Lưu chỉ active nếu cả 3 ô đều không trống và không có lỗi
    const hasEmpty = !oldVal || !newVal || !confirmVal;
    // Kiểm tra textContent có phải là chuỗi rỗng không (!!hasError)
    const hasError = passOldErr.textContent || passNewErr.textContent || passConfirmErr.textContent;

    savePassBtn.disabled = hasEmpty || !!hasError;
    savePassBtn.classList.toggle("disabled", savePassBtn.disabled);
}

// ===== Reset lỗi khi input thay đổi =====
[passOld, passNew, passConfirm].forEach(input => {
    input.addEventListener("input", () => {
        // Xóa thông báo lỗi khi người dùng bắt đầu nhập lại
        if (input.id === 'passOld') passOldErr.textContent = "";
        if (input.id === 'passNew') passNewErr.textContent = "";
        if (input.id === 'passConfirm') passConfirmErr.textContent = "";
        
        updatePassButtons();
    });
});

// ===== Cancel =====
cancelPassBtn.addEventListener("click", () => {
    [passOld, passNew, passConfirm].forEach(i => i.value = "");
    [passOldErr, passNewErr, passConfirmErr].forEach(e => e.textContent = "");
    updatePassButtons();
});

// ===== Submit form =====
document.getElementById("passForm").addEventListener("submit", async e => {
    e.preventDefault();

    // Reset lỗi
    passOldErr.textContent = "";
    passNewErr.textContent = "";
    passConfirmErr.textContent = "";

    const oldVal = passOld.value.trim();
    const newVal = passNew.value.trim();
    const confirmVal = passConfirm.value.trim();

    let hasError = false;

    if (!oldVal) {
        passOldErr.textContent = "Mật khẩu cũ không được để trống!";
        hasError = true;
    }

    if (!newVal) {
        passNewErr.textContent = "Mật khẩu mới không được để trống!";
        hasError = true;
    } else if (newVal.length < 8 || !/[A-Za-z]/.test(newVal) || !/\d/.test(newVal)) {
        passNewErr.textContent = "Mật khẩu mới phải có ít nhất 8 ký tự, gồm cả chữ và số!";
        hasError = true;
    } else if (newVal === oldVal) {
        passNewErr.textContent = "Mật khẩu mới phải khác mật khẩu cũ!";
        hasError = true;
    }

    if (!confirmVal) {
        passConfirmErr.textContent = "Vui lòng xác nhận mật khẩu!";
        hasError = true;
    } else if (confirmVal !== newVal) {
        passConfirmErr.textContent = "Mật khẩu xác nhận không khớp!";
        hasError = true;
    }

    updatePassButtons();
    if (hasError) return;

    try {
        const res = await fetch(`${API_BASE_URL}/khachhang/${currentUserId}/changepassword`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldPassword: oldVal, newPassword: newVal })
        });

        const result = await res.json();

        if (!res.ok) {
            if (result.field === "oldPassword") passOldErr.textContent = result.message;
            else showToast("❌ " + result.message);
            updatePassButtons();
            return;
        }

        showToast("Đổi mật khẩu thành công!");
        cancelPassBtn.click(); // reset form
        updatePassButtons();

    } catch (err) {
        console.error(err);
        showToast("❌ Lỗi kết nối server");
    }
});

// Khởi tạo trạng thái ban đầu
updatePassButtons();
document.querySelectorAll(".toggle-password").forEach(span => {
    span.addEventListener("click", () => {
        const input = span.previousElementSibling;
        if (input.type === "password") {
            input.type = "text";
            span.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
        } else {
            input.type = "password";
            span.innerHTML = '<i class="fa-regular fa-eye"></i>';
        }
    });
});

// ===============================================================
// 3. MEDICAL HISTORY LOGIC
// ===============================================================

async function loadMedicalHistory() {
    const currentUserId = localStorage.getItem("userId");
    if (!currentUserId) return;

    try {
        if (medicalHistoryTableBody) {
            medicalHistoryTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Đang tải dữ liệu...</td></tr>';
        }

        const res = await fetch(`http://localhost:3000/hosoyte/${currentUserId}`);
        const data = await res.json();

        // 1. Lưu trữ dữ liệu vào biến toàn cục
        medicalHistoryData = data.lichsu || [];

        // 2. Sắp xếp dữ liệu ban đầu (mới nhất trước)
        medicalHistoryData.sort((a, b) => new Date(b.ngayKham) - new Date(a.ngayKham));

        renderMedicalTable(medicalHistoryData);

    } catch (err) {
        console.error(err);
        if (medicalHistoryTableBody) {
            medicalHistoryTableBody.innerHTML = '<tr><td colspan="4" style="color: red; text-align: center;">Lỗi tải dữ liệu.</td></tr>';
        }
        showToast("❌ Lỗi tải dữ liệu lịch sử khám bệnh");
    }
}


const sortButton = document.querySelector(".sort-options .btn");
const sortMenu = document.querySelector(".sort-options .sort-menu");

// Toggle menu
if (sortButton) {
    sortButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Ngăn sự kiện click lan ra ngoài
        sortMenu.classList.toggle("hidden");
    });
}
// Ẩn menu khi click ra ngoài
document.addEventListener('click', (e) => {
    if (sortMenu && !sortMenu.contains(e.target) && e.target !== sortButton) {
        sortMenu.classList.add('hidden');
    }
});


// Hàm render lại table
function renderMedicalTable(lichsu) {
    const tbody = document.querySelector(".medical-history-table tbody");
    const detailContainer = document.querySelector(".medical-record-detail");

    if (!tbody || !detailContainer) return;

    tbody.innerHTML = "";
    detailContainer.innerHTML = `<p class="detail-placeholder">Chi tiết kết quả khám</p>`;

    if (!lichsu || lichsu.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Chưa có lịch sử khám bệnh</td></tr>`;
        return;
    }

    lichsu.forEach(item => {
        const tr = document.createElement("tr");
        // Lưu toàn bộ dữ liệu (hoặc chỉ phần chi tiết) vào dataset
        // Chỉnh sửa hiển thị ngày tháng
        const ngayKhamFormatted = new Date(item.ngayKham).toLocaleDateString('vi-VN');

        tr.dataset.chiTiet = `
            <h3>Kết Quả Khám: ${escapeHtml(ngayKhamFormatted)}</h3>
            <p><strong>Bác sĩ:</strong> ${escapeHtml(item.bacSi)}</p>
            <p><strong>Khoa:</strong> ${escapeHtml(item.khoa)}</p>
            <p><strong>Kết luận:</strong> ${escapeHtml(item.ketLuan)}</p>
            <hr>
            <p>${escapeHtml(item.chiTiet || "Thông tin chi tiết đang cập nhật...")}</p>
        `;

        tr.innerHTML = `
            <td>${escapeHtml(ngayKhamFormatted)}</td>
            <td>${escapeHtml(item.bacSi)}</td>
            <td>${escapeHtml(item.khoa)}</td>
            <td>${escapeHtml(item.ketLuan)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Click vào từng dòng
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.addEventListener("click", () => {
            // Xóa nội dung chi tiết cũ (nếu có)
            let oldDetailContent = detailContainer.querySelector('#active-medical-detail');
            if (oldDetailContent) oldDetailContent.remove();

            // Tạo container mới cho chi tiết và chèn nội dung
            const newDetailDiv = document.createElement('div');
            newDetailDiv.id = 'active-medical-detail';
            newDetailDiv.innerHTML = tr.dataset.chiTiet;

            // CHÈN NỘI DUNG MỚI SAU PHẦN TỬ PLACEHOLDER
            detailContainer.appendChild(newDetailDiv);
            
            // Ẩn placeholder
            document.querySelector('.medical-record-detail .detail-placeholder').style.display = 'none';

            // Đánh dấu dòng được chọn
            tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
            tr.classList.add("selected");
        });
    });
}

// Menu sắp xếp - CẬP NHẬT LOGIC SẮP XẾP
if (sortMenu) {
    sortMenu.querySelectorAll("a").forEach(a => {
        a.addEventListener("click", e => {
            e.preventDefault();

            if (medicalHistoryData.length === 0) {
                sortMenu.classList.add("hidden");
                return;
            }

            // Kiểm tra icon để xác định thứ tự sắp xếp
            const isDescending = a.querySelector('.fa-arrow-down');
            const order = isDescending ? "desc" : "asc";

            // Sắp xếp mảng dữ liệu toàn cục
            medicalHistoryData.sort((a, b) => {
                const dateA = new Date(a.ngayKham);
                const dateB = new Date(b.ngayKham);
                return order === "asc" ? dateA - dateB : dateB - dateA;
            });

            // Tái hiển thị bảng với dữ liệu đã sắp xếp
            renderMedicalTable(medicalHistoryData);

            // Ẩn menu sắp xếp
            sortMenu.classList.add("hidden");
        });
    });
}

// ================================
//      LOAD LỊCH KHÁM THEO IDKH
// ================================
const appointmentsListContainer = document.getElementById("appointmentsListContainer");
const appointmentDetailView = document.getElementById("appointmentDetailView");
const appointmentTableBody = document.querySelector(".appointments-table tbody");
const noAppointmentsMsg = document.getElementById("no-appointments-message");
const filterButtons = document.querySelectorAll(".filter-btn");

// Khai báo biến toàn cục lưu trữ danh sách lịch khám
let appointmentList = [];

// Hàm load lịch khám
function loadAppointments(status = "all") {
    if (!currentUserId) return;
    
    // Ẩn chi tiết, hiện danh sách (phòng trường hợp đang ở màn chi tiết)
    appointmentDetailView.style.display = "none";
    appointmentsListContainer.style.display = "block";


    fetch(`${API_BASE_URL}/lich-user/${currentUserId}`)
        .then(res => res.json())
        .then(data => {
            appointmentList = data || []; // Lưu dữ liệu gốc

            let list = appointmentList;

            if (status !== "all") {
                // Ánh xạ trạng thái tiếng Anh (data-status) sang tiếng Việt (DB)
                const filterMap = {
                    "pending": "chờ xác nhận",
                    "confirmed": "đã xác nhận",
                    "cancelled": "đã hủy"
                };
                const filterStatus = filterMap[status] || null;

                if (filterStatus) {
                    list = list.filter(item => (item.trangThai || "").toLowerCase() === filterStatus);
                }
            }

            // Hiển thị hoặc ẩn "chưa có lịch khám"
            if (list.length === 0) {
                appointmentTableBody.innerHTML = "";
                noAppointmentsMsg.style.display = "block";
            } else {
                noAppointmentsMsg.style.display = "none";
            }

            // Render bảng
            appointmentTableBody.innerHTML = list.map(item => {
                const itemStatus = (item.trangThai || "").toLowerCase();

                let statusText = "Đã hủy";
                let statusClass = "status-cancelled"; 

                if (itemStatus === "chờ xác nhận") {
                    statusText = "Chờ xác nhận";
                    statusClass = "status-pending"; 
                } else if (itemStatus === "đã xác nhận") {
                    statusText = "Đã xác nhận";
                    statusClass = "status-confirmed"; 
                } else if (itemStatus === "đã hủy") {
                    statusText = "Đã hủy";
                    statusClass = "status-cancelled"; 
                }

                // Gán idLichKham vào data-id để xem chi tiết
                return `
                    <tr data-id="${item.idLichKham}">
                        <td>${escapeHtml(item.tenBacSi)}</td>
                        <td>${escapeHtml(item.tenKhoa)}</td>
                        <td>${escapeHtml(formatDateDisplay(item.ngayKham))}</td> 
                        <td>${escapeHtml(String(item.gioKham || "").substring(0, 5))}</td>   
                        <td class="status-cell">
                                <span class="status-badge ${statusClass}">
                            ${statusText}
                                            </span>
                        </td>
                    
                    </tr>
                `;
            }).join("");
        })
        .catch(err => {
            console.error("Lỗi load lịch khám:", err);
            appointmentTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Lỗi tải dữ liệu.</td></tr>`;
        });
}

// ================================
//      EVENT FILTER BUTTONS
// ================================
filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {

        // bỏ active tất cả
        filterButtons.forEach(b => b.classList.remove("active"));

        // gán active cho nút được nhấn
        btn.classList.add("active");

        // trạng thái cần lọc (all / pending / confirmed / cancelled)
        const status = btn.dataset.status;

        // load lại danh sách theo trạng thái
        loadAppointments(status);
    });
});


// HÀM TIỆN ÍCH: FORMAT NGÀY (DD/MM/YYYY)
function formatDateDisplay(dateString) {
    if (!dateString) return '';

    let datePart = dateString.split('T')[0];

    const parts = datePart.split('-');
    if (parts.length === 3) {
        // Đảo ngược từ YYYY-MM-DD thành DD/MM/YYYY
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
    }

    return dateString;
}

// ================================
//  PROGRESS BAR LOGIC (3 BƯỚC CƠ BẢN + HỦY)
// ================================

function updateProgressBar(status) {
    
    const lowerCaseStatus = (status || "").toLowerCase();
    
    // --- 1. RESET HIỂN THỊ ---
    // Reset classes
    document.querySelectorAll('.progress-step').forEach(step => step.classList.remove('active', 'cancelled'));
    document.querySelectorAll('.progress-line').forEach(line => line.classList.remove('active'));
    
    // Hiện 3 bước chính và ẩn bước Hủy
    document.getElementById('step_placed').style.display = 'flex';
    document.getElementById('step_pending').style.display = 'flex';
    document.getElementById('step_confirmed').style.display = 'flex';
    document.getElementById('step_cancelled').style.display = 'none';
    
    document.getElementById('line1').style.display = 'block';
    document.getElementById('line2').style.display = 'block';
    
    // Reset icon chờ thành đồng hồ cát mặc định
    document.querySelector('#step_pending .circle').innerHTML = '<i class="fa-solid fa-hourglass-half"></i>';

    // Đảm bảo icon bước Hủy là X
    document.querySelector('#step_cancelled .circle').innerHTML = '<i class="fa-solid fa-xmark"></i>';


    // --- 2. CẬP NHẬT TRẠNG THÁI ---
    
    if (lowerCaseStatus === 'chờ xác nhận') {
        // Kịch bản 1: Đã đặt lịch (Xanh) -> Chờ xác nhận (Đồng hồ cát)
        document.getElementById('step_placed').classList.add('active'); 
        document.getElementById('line1').classList.add('active');
        document.getElementById('step_pending').classList.add('active');
        
    } else if (lowerCaseStatus === 'đã xác nhận') {
        // Kịch bản 2: Đã đặt lịch (Xanh) -> Chờ xác nhận (Tick) -> Đã xác nhận (Tick)
        document.getElementById('step_placed').classList.add('active'); 
        document.getElementById('line1').classList.add('active');
        document.getElementById('step_pending').classList.add('active');
        document.getElementById('line2').classList.add('active');
        document.getElementById('step_confirmed').classList.add('active');
        
        // Cập nhật icon bước Chờ xác nhận thành dấu tick (vì đã hoàn thành)
        document.querySelector('#step_pending .circle').innerHTML = '<i class="fa-solid fa-check"></i>';
        
    } else if (lowerCaseStatus === 'đã hủy') {
        // Kịch bản 3: Chỉ hiển thị bước Hủy (màu đỏ to)
        
        document.getElementById('step_placed').style.display = 'none';
        document.getElementById('step_pending').style.display = 'none';
        document.getElementById('step_confirmed').style.display = 'none';
        
        document.getElementById('line1').style.display = 'none';
        document.getElementById('line2').style.display = 'none';
        
        document.getElementById('step_cancelled').style.display = 'flex'; 
        document.getElementById('step_cancelled').classList.add('cancelled');
    }
}


// ================================
//  XEM CHI TIẾT & HỦY LỊCH KHÁM
// ================================

const appointmentsListView = document.querySelector(".appointments-table tbody");
const backToAppointmentsBtn = document.getElementById("backToAppointmentsList");
const cancelAppointmentArea = document.getElementById("cancelAppointmentArea");
const cancelAppointmentBtn = document.getElementById("cancelAppointmentBtn");

if (appointmentsListView && appointmentDetailView) {
    appointmentsListView.addEventListener("click", (e) => {
        const tr = e.target.closest("tr");
        if (!tr) return;

        const idLichKham = tr.dataset.id;
        const item = appointmentList.find(i => i.idLichKham == idLichKham);

        if (!item) return;

        // --- 1. Hiển thị thông tin chi tiết ---
        document.getElementById("detail_idLichKham").textContent = `#${item.idLichKham}`;
        document.getElementById("detail_hoTen").textContent = item.hoTen;
        document.getElementById("detail_lyDo").textContent = item.lyDo || "Không có";
        document.getElementById("detail_tenBacSi").textContent = item.tenBacSi;
        document.getElementById("detail_tenKhoa").textContent = item.tenKhoa;
        document.getElementById("detail_ngayKham").textContent = formatDateDisplay(item.ngayKham);
        document.getElementById("detail_gioKham").textContent = item.gioKham.substring(0, 5);


        // --- 2. Cập nhật Progress Bar ---
        updateProgressBar(item.trangThai);

        // --- 3. Cập nhật nút Hủy ---
        const isPending = (item.trangThai || "").toLowerCase() === 'chờ xác nhận';
        if (isPending) {
            cancelAppointmentBtn.dataset.id = item.idLichKham;
            cancelAppointmentArea.style.display = 'block';
        } else {
            cancelAppointmentArea.style.display = 'none';
        }

        // --- 4. Chuyển đổi view ---
        appointmentsListContainer.style.display = "none";
        appointmentDetailView.style.display = "block";
    });

    // Nút quay lại
    backToAppointmentsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        appointmentDetailView.style.display = "none";
        appointmentsListContainer.style.display = "block";
    });
    
    // HỦY LỊCH KHÁM
    cancelAppointmentBtn.addEventListener("click", async function() {
        const idLichKham = this.dataset.id;
        if (!confirm(`Bạn có chắc chắn muốn hủy lịch khám #${idLichKham} này không?`)) {
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/huy-lich`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idLichKham })
            });

            const result = await res.json();
            
            if (!res.ok || !result.success) {
                showToast("❌ " + (result.message || "Hủy lịch thất bại!"));
                return;
            }

            showToast("✅ Hủy lịch thành công!");
            
            // 1. Load lại danh sách (để cập nhật trạng thái)
            const activeStatus = document.querySelector('.filter-btn.active').dataset.status;
            loadAppointments(activeStatus);
            
            // 2. Chuyển về màn hình danh sách (nếu loadAppointments không tự làm)
            backToAppointmentsBtn.click();


        } catch (err) {
            console.error("Lỗi hủy lịch:", err);
            showToast("❌ Lỗi kết nối server khi hủy lịch.");
        }
    });

}
