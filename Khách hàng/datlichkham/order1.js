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

// Bắt buộc đăng nhập trước khi đặt lịch
(function requireCustomerAuth() {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const loggedIn = localStorage.getItem("loggedIn") === "true";
    if (!token || !userId || !loggedIn) {
        alert("Vui lòng đăng nhập trước khi đặt lịch khám!");
        const onApiHost = /:(3000)$/.test(location.host) || location.pathname.startsWith("/customer");
        window.location.href = onApiHost
            ? "/customer/trangchupre/trangchu1.html"
            : "../trangchupre/trangchu1.html";
        throw new Error("AUTH_REQUIRED");
    }
})();

// DOM
const khoaInput = document.getElementById("khoaInput");
const dropdown = document.getElementById("dropdownKhoa");
const doctorsList = document.getElementById("doctorsList");
const popup = document.getElementById("confirmPopup");
const confirmYes = document.getElementById("confirmYes");
const confirmNo = document.getElementById("confirmNo");
const confirmSummary = document.getElementById("confirmSummary");

// Escape HTML
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

// Lấy 7 ngày tiếp theo
function getNext7Days() {
    const daysOfWeek = ['Chủ Nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
    const today = new Date();
    const dates = [];
    for(let i=0;i<7;i++){
        const d = new Date();
        d.setDate(today.getDate() + i);
        const weekday = daysOfWeek[d.getDay()];
        const date = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
        dates.push({ weekday, date });
    }
    return dates;
}

// Load khoa + "Tất cả chuyên khoa"
async function loadKhoa() {
    try {
        const res = await fetch("http://localhost:3000/api/khoa");
        const data = await res.json();
        dropdown.innerHTML = "";

        const allOption = document.createElement("div");
        allOption.className = "dropdown-item";
        allOption.tabIndex = 0;
        allOption.textContent = "Tất cả chuyên khoa";
        allOption.dataset.id = "";
        allOption.addEventListener("click", ()=> {
            khoaInput.value = "Tất cả chuyên khoa";
            khoaInput.dataset.id = "";
            dropdown.style.display = "none";
            loadBacSi();
        });
        dropdown.appendChild(allOption);

        data.forEach(khoa => {
            const item = document.createElement("div");
            item.className = "dropdown-item";
            item.tabIndex = 0;
            item.textContent = khoa.tenKhoa;
            item.dataset.id = khoa.idKhoa;
            item.addEventListener("click", () => {
                khoaInput.value = khoa.tenKhoa;
                khoaInput.dataset.id = khoa.idKhoa;
                dropdown.style.display = "none";
                loadBacSi(khoa.idKhoa);
            });
            dropdown.appendChild(item);
        });
    } catch(err) { console.error(err); }
}
loadKhoa();

khoaInput.addEventListener('click', e => { 
    e.stopPropagation(); 
    dropdown.style.display = dropdown.style.display==='block'?'none':'block'; 
});
document.addEventListener('click', e => { 
    if(!e.target.closest('.input-box')) dropdown.style.display='none'; 
});

// Load bác sĩ (idKhoa=null => tất cả)
async function loadBacSi(idKhoa = null) {
    try {
        const url = idKhoa ? `http://localhost:3000/api/bacsi/${idKhoa}` : "http://localhost:3000/api/bacsi-all";
        const res = await fetch(url);
        const data = await res.json();
        renderDoctors(data, idKhoa);
    } catch(err){
        console.error(err); 
        doctorsList.innerHTML="<p>Không tải được danh sách bác sĩ</p>"; 
    }
}

// Render bác sĩ
function renderDoctors(bacSiArray, idKhoa) {
    if(!Array.isArray(bacSiArray) || bacSiArray.length===0) {
        doctorsList.innerHTML = "<p>Chưa có bác sĩ</p>";
        return;
    }
    doctorsList.innerHTML = bacSiArray.map(bs => createDoctorCardHTML(bs, idKhoa)).join('');
    attachInteractivity();
}

function createDoctorCardHTML(bs, idKhoa) {
    const days = getNext7Days().map((d,idx)=>
        `<div class="day-card ${idx===0?'selected':''}" data-weekday="${d.weekday}" data-date="${d.date}">
            <div class="weekday">${d.weekday}</div>
            <div class="date">${d.date}</div>
        </div>`
    ).join('');

    const times = ['07:45','08:00','08:15','08:30','08:45','09:00','09:15','09:30','09:45','10:00'];
    const timeBtnsHTML = times.map(t=>`<button class="time-btn">${t}</button>`).join('');

    return `<article class="doctor-card" data-id="${bs.idBacSi}" data-name="${escapeHtml(bs.hoTenBacSi)}" data-khoaid="${idKhoa || bs.idKhoa || ''}">
        <div class="doctor-header">
            <div class="avatar"><img src="../Picture/doctor.png" alt="avatar"></div>
            <div class="meta">
                <div class="name">${escapeHtml(bs.hoTenBacSi)}</div>
                <div class="spec">🩺 ${escapeHtml(bs.hocVi || '')}</div>
            </div>
            <button class="arrow-btn">&#9660;</button>
        </div>
        <div class="details" aria-hidden="true">
            <div class="details-inner">
                <div class="days">${days}</div>
                <div class="clinic">
                    <div class="clinic-icon">🏥</div>
                    <div class="clinic-info">
                        <div class="title">Phòng khám - ${escapeHtml(bs.hoTenBacSi)}</div>
                        <div class="times">${timeBtnsHTML}</div>
                    </div>
                </div>
            </div>
        </div>
    </article>`;
}

// Interactivity
function attachInteractivity() {
    document.querySelectorAll('.arrow-btn').forEach(btn => {
        btn.onclick = e=>{
            e.stopPropagation();
            const card = btn.closest('.doctor-card');
            const details = card.querySelector('.details');
            const isOpen = btn.classList.contains('open');
            document.querySelectorAll('.doctor-card .details').forEach(d=>{
                d.style.maxHeight=null; d.setAttribute('aria-hidden','true');
            });
            document.querySelectorAll('.arrow-btn').forEach(a=>a.classList.remove('open'));
            if(!isOpen){
                btn.classList.add('open'); 
                details.style.maxHeight=details.scrollHeight+"px"; 
                details.setAttribute('aria-hidden','false');
            }
        }
    });

    document.querySelectorAll('.day-card').forEach(day=>{
        day.onclick=()=>{
            const parent = day.parentNode;
            parent.querySelectorAll('.day-card').forEach(d=>d.classList.remove('selected'));
            day.classList.add('selected');
            updateTimeAvailability(day);
        }
    });

    document.querySelectorAll('.time-btn').forEach(btn=>{
        btn.onclick = async ()=>{
            const card = btn.closest('.doctor-card');
            if(btn.disabled) return;
            card.querySelectorAll('.time-btn').forEach(t=>t.classList.remove('time-selected'));
            btn.classList.add('time-selected');

            const name = document.getElementById("fullname").value.trim();
            const reason = document.getElementById("reason").value.trim();
            const khoaVal = khoaInput.value.trim();
            const selectedDay = card.querySelector('.day-card.selected');
            if(!name || !reason || !khoaVal || !selectedDay) { 
                alert("Vui lòng điền đầy đủ thông tin"); 
                return; 
            }

            const dayDate = selectedDay.dataset.date;
            const bacSiName = card.dataset.name;
            const bacSiId = card.dataset.id;

            confirmSummary.innerHTML = `
                <strong>Người bệnh:</strong> ${escapeHtml(name)}<br>
                <strong>Khoa:</strong> ${escapeHtml(khoaVal)}<br>
                <strong>Bác sĩ:</strong> ${escapeHtml(bacSiName)}<br>
                <strong>Ngày:</strong> ${escapeHtml(dayDate)}<br>
                <strong>Giờ:</strong> ${escapeHtml(btn.textContent)}<br>
                <strong>Lý do:</strong> ${escapeHtml(reason)}
            `;
            popup.dataset.selHoTen = name;
            popup.dataset.selLyDo = reason;
            popup.dataset.selIdBacSi = bacSiId;
            // Ưu tiên id khoa của bác sĩ (fix khi đang chọn "Tất cả chuyên khoa")
            popup.dataset.selIdKhoa = card.dataset.khoaid || khoaInput.dataset.id || "";
            popup.dataset.selTenKhoa = khoaVal;
            popup.dataset.selNgay = dayDate;
            popup.dataset.selGio = btn.textContent;
            popup.style.display = "flex";
        }
    });
}

// Kiểm tra giờ đã đặt
async function updateTimeAvailability(dayCard) {
    const card = dayCard.closest('.doctor-card');
    const bacSiId = card.dataset.id;
    const date = dayCard.dataset.date;
    const times = card.querySelectorAll('.time-btn');
    try {
        const res = await fetch(`http://localhost:3000/api/lich-da-dat?bacsi=${bacSiId}&ngay=${date}`);
        const bookedTimes = await res.json(); 
        times.forEach(t=>{
            if(bookedTimes.includes(t.textContent)){ 
                t.disabled = true; 
                t.classList.add('disabled-time'); 
            }
            else { 
                t.disabled=false; 
                t.classList.remove('disabled-time'); 
            }
        });
    } catch(err){ console.error(err); }
}

// Popup
confirmNo.onclick = ()=> popup.style.display='none';
confirmYes.onclick = async ()=>{
    const idKhoa = popup.dataset.selIdKhoa;
    if (!popup.dataset.selIdBacSi || !idKhoa) {
        alert("Thiếu thông tin bác sĩ/khoa. Vui lòng chọn lại.");
        return;
    }
    const body = {
        hoTen: popup.dataset.selHoTen,
        lyDo: popup.dataset.selLyDo,
        idBacSi: Number(popup.dataset.selIdBacSi),
        idKhoa: Number(idKhoa),
        ngayKham: popup.dataset.selNgay,
        gioKham: popup.dataset.selGio
    };
    try{
        const res = await fetch("http://localhost:3000/api/dat-lich",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify(body)
        });
        const data = await res.json();
        alert(data.message || (res.ok ? "Đặt lịch thành công!" : "Đặt lịch thất bại!"));
        popup.style.display = "none";
        if (!res.ok) return;
        const card = document.querySelector(`.doctor-card[data-id="${body.idBacSi}"]`);
        if (!card) return;
        const dayCard = Array.from(card.querySelectorAll('.day-card')).find(d=>d.dataset.date===body.ngayKham);
        if(dayCard) updateTimeAvailability(dayCard);
    } catch(err){ 
        console.error(err); 
        alert("Đặt lịch thất bại!"); 
    }
}

// Load all bác sĩ ban đầu
loadBacSi();
