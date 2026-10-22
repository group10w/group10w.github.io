// admin-doctors.js
// Phiên bản khớp trực tiếp với admin.html bạn gửi
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

const API_BASE_ADMIN = "http://localhost:3000/api/admin/bacsi";
const API_KHOA = "http://localhost:3000/api/khoa";

(async function initDoctorsModule(){
  // Tìm section doctors trong admin.html
  const doctorsSection = document.querySelector('section[data-page="doctors"]');
  if (!doctorsSection) {
    console.warn("Không tìm thấy section[data-page='doctors'] trong admin.html");
    return;
  }

  // Tìm bảng trong section doctors
  const table = doctorsSection.querySelector('table');
  if (!table) {
    console.warn("Không tìm thấy <table> trong section doctors");
    return;
  }
  // tbody dùng để render danh sách
  let tbody = table.querySelector('tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
  }

  // Nút Thêm hiện có trong HTML (nút bg-teal-500 ở trên)
  const existingAddBtn = doctorsSection.querySelector('button.bg-teal-500');

  // Tạo toolbar (search + add) và chèn trước bảng (nếu muốn)
  const toolbar = document.createElement('div');
  toolbar.className = 'mb-4 flex items-center justify-between gap-3';
  toolbar.innerHTML = `
    <div class="flex items-center gap-2">
      <input id="doctorSearch" placeholder="Tìm tên hoặc khoa..." class="border rounded px-3 py-2 w-64" />
      <button id="refreshDoctors" class="px-3 py-2 border rounded">🔄 Làm mới</button>
    </div>
    <div></div>
  `;
  // chèn toolbar trước bảng container
  table.parentNode.insertBefore(toolbar, table);

  const searchInput = toolbar.querySelector('#doctorSearch');
  const refreshBtn = toolbar.querySelector('#refreshDoctors');

  // Nếu có nút existingAddBtn, gắn lại text và move nó vào toolbar phải
  if (existingAddBtn) {
    const addBtnClone = existingAddBtn.cloneNode(true);
    addBtnClone.id = 'addDoctorBtn';
    addBtnClone.textContent = '➕ Thêm bác sĩ';
    addBtnClone.className = 'bg-teal-500 text-white px-3 py-2 rounded-lg';
    toolbar.querySelector('div:last-child').appendChild(addBtnClone);
    // ẩn nút gốc (tránh trùng)
    existingAddBtn.style.display = 'none';
  } else {
    // nếu không có nút gốc tạo 1 nút thêm
    const addBtn = document.createElement('button');
    addBtn.id = 'addDoctorBtn';
    addBtn.className = 'bg-teal-500 text-white px-3 py-2 rounded-lg';
    addBtn.textContent = '➕ Thêm bác sĩ';
    toolbar.querySelector('div:last-child').appendChild(addBtn);
  }

  const addDoctorBtn = document.getElementById('addDoctorBtn');

  // Lưu danh sách tạm
  let doctors = [];
  let khoaList = [];

  // ------------------- helper: fetch danh sách khoa -------------------
  async function loadKhoa() {
    try {
      const r = await fetch(API_KHOA);
      khoaList = await r.json();
    } catch (err) {
      console.error("Lỗi load khoa:", err);
      khoaList = [];
    }
  }

  // ------------------- fetch doctors -------------------
  async function loadDoctors(q = '') {
    try {
      const url = q ? `${API_BASE_ADMIN}?q=${encodeURIComponent(q)}` : API_BASE_ADMIN;
      const r = await fetch(url);
      doctors = await r.json();
      renderDoctors();
    } catch (err) {
      console.error("Lỗi load doctors:", err);
      tbody.innerHTML = `<tr><td colspan="4" class="p-3 text-red-600">Lỗi khi tải danh sách bác sĩ</td></tr>`;
    }
  }

  // ------------------- render table -------------------
 function renderDoctors() {
  if (!Array.isArray(doctors) || doctors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-3 text-gray-600 text-center">Chưa có bác sĩ</td></tr>`;
    return;
  }

  tbody.innerHTML = doctors.map(d => {
    const id = d.idBacSi || "";
    const name = escapeHtml(d.hoTenBacSi || d.tenBacSi || "");
    const hocVi = escapeHtml(d.hocVi || "");
    const tenKhoa = escapeHtml(d.tenKhoa || "");

    return `
      <tr class="border-t hover:bg-gray-50">
        <td class="p-2 font-medium text-center">${id}</td>
        <td class="p-2">${name}</td>
        <td class="p-2">${hocVi}</td>
        <td class="p-2">${tenKhoa}</td>
        <td class="p-2 text-center">
          <button class="editDoctor px-2 py-1 mr-2 text-teal-600 hover:underline" data-id="${id}">✏️</button>
          <button class="deleteDoctor px-2 py-1 text-red-600 hover:underline" data-id="${id}">🗑️</button>
        </td>
      </tr>`;
  }).join("");

  // Gán lại sự kiện
  tbody.querySelectorAll(".editDoctor").forEach(btn => {
    btn.addEventListener("click", () => openDoctorModal(btn.dataset.id));
  });
  tbody.querySelectorAll(".deleteDoctor").forEach(btn => {
    btn.addEventListener("click", () => deleteDoctor(btn.dataset.id));
  });
}

  // ------------------- modal form (add/edit) -------------------
  function openDoctorModal(id = null){
    const existing = id ? doctors.find(x => String(x.idBacSi) === String(id)) : null;

    // build khoa options
    const khoaOptions = khoaList.map(k => `<option value="${k.idKhoa}" ${existing && existing.idKhoa == k.idKhoa ? 'selected' : ''}>${escapeHtml(k.tenKhoa)}</option>`).join('');

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center';
    modal.style.background = 'rgba(0,0,0,0.45)';
    modal.innerHTML = `
      <div class="bg-white rounded-lg w-[92%] max-w-md p-6 shadow-lg">
        <h3 class="text-lg font-semibold mb-3">${id ? 'Sửa bác sĩ' : 'Thêm bác sĩ'}</h3>
        <form id="doctorForm" class="space-y-3">
          <div>
            <label class="block text-sm mb-1">Họ tên bác sĩ</label>
            <input name="hoTenBacSi" class="w-full border rounded px-3 py-2" value="${escapeHtml(existing?.hoTenBacSi || '')}" required />
          </div>
          <div>
            <label class="block text-sm mb-1">Học vị</label>
            <input name="hocVi" class="w-full border rounded px-3 py-2" value="${escapeHtml(existing?.hocVi || '')}" />
          </div>
          <div>
            <label class="block text-sm mb-1">Khoa</label>
            <select name="idKhoa" class="w-full border rounded px-3 py-2" required>
              <option value="">-- Chọn khoa --</option>
              ${khoaOptions}
            </select>
          </div>
          <div class="flex justify-end gap-2 pt-3">
            <button type="button" id="cancelModal" class="px-3 py-2 border rounded">Hủy</button>
            <button type="submit" class="px-3 py-2 bg-teal-600 text-white rounded">${id ? 'Lưu' : 'Thêm'}</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    // close handlers
    modal.querySelector('#cancelModal').addEventListener('click', ()=> modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // submit
    const form = modal.querySelector('#doctorForm');
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      // minimal validation
      if (!payload.hoTenBacSi || !payload.idKhoa) {
        alert('Vui lòng điền tên bác sĩ và chọn khoa');
        return;
      }
      try {
        if (id) {
          // PUT
          const res = await fetch(`${API_BASE_ADMIN}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.message || 'Cập nhật thất bại');
          alert(json.message || 'Cập nhật thành công');
        } else {
          // POST
          const res = await fetch(API_BASE_ADMIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.message || 'Thêm thất bại');
          alert(json.message || 'Thêm thành công');
        }
      } catch (err) {
        console.error(err);
        alert(err.message || 'Lỗi khi lưu bác sĩ');
      } finally {
        modal.remove();
        await loadDoctors(searchInput.value.trim());
      }
    });
  }

  // ------------------- delete -------------------
async function deleteDoctor(id) {
  if (!id) return;

  try {
    // Gọi thử xóa lần 1 để kiểm tra ràng buộc
    const res = await fetch(`${API_BASE_ADMIN}/${id}`, { method: "DELETE" });
    const result = await res.json();

    if (result.requireConfirm) {
      // Có lịch hoặc lịch sử khám => hỏi lại
      const confirmDelete = confirm(result.message + "\n\nChọn OK để xóa toàn bộ, Cancel để hủy.");
      if (confirmDelete) {
        const res2 = await fetch(`${API_BASE_ADMIN}/${id}?force=true`, { method: "DELETE" });
        const result2 = await res2.json();
        alert(result2.message || "🗑️ Đã xóa bác sĩ và dữ liệu liên quan!");
      } else {
        alert("❎ Đã hủy xóa.");
      }
    } else {
      alert(result.message || "🗑️ Đã xóa bác sĩ thành công!");
    }

    await loadDoctors(searchInput.value.trim());
  } catch (err) {
    console.error("❌ Lỗi khi xóa bác sĩ:", err);
    alert("Đã xảy ra lỗi khi xóa bác sĩ!");
  }
}

  // ------------------- escape html helper -------------------
  function escapeHtml(str){
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
  }

  // ------------------- events -------------------
  addDoctorBtn.addEventListener('click', ()=> openDoctorModal());
  refreshBtn.addEventListener('click', ()=> loadDoctors(searchInput.value.trim()));
  searchInput.addEventListener('input', (e)=> {
    const q = e.target.value.trim();
    // debounce optional — but simple immediate call OK for small data
    loadDoctors(q);
  });

  // init

  await loadKhoa();
  await loadDoctors();
})();
