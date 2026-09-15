// --- Các element DOM ---
const chatBtn = document.getElementById("chatBtn");
const closeChat = document.getElementById("closeChat");
const chatWindow = document.getElementById("chatWindow");
const chatBody = document.getElementById("chatBody");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

// --- Mở/đóng chat ---
if (chatBtn && chatWindow) {
	chatBtn.onclick = () => {
		chatWindow.style.display = "flex";
	};
}
if (closeChat && chatWindow) {
	closeChat.onclick = () => {
		chatWindow.style.display = "none";
	};
}

// --- Gửi tin nhắn ---
if (sendBtn) sendBtn.onclick = sendMessage;
if (userInput) {
	userInput.addEventListener("keypress", (e) => {
		if (e.key === "Enter") sendMessage();
	});
}

async function sendMessage() {
	if (!userInput || !chatBody) return;
	const msg = userInput.value.trim();
	if (!msg) return;

	// --- Hiển thị tin nhắn người dùng ---
	const userMsg = document.createElement("div");
	userMsg.className = "chat-message user";
	userMsg.textContent = msg;
	chatBody.appendChild(userMsg);
	userInput.value = "";
	chatBody.scrollTop = chatBody.scrollHeight;

	// --- Tạo bubble bot đang chờ ---
	const botMsg = document.createElement("div");
	botMsg.className = "chat-message bot";
	botMsg.textContent = "Đang trả lời...";
	chatBody.appendChild(botMsg);
	chatBody.scrollTop = chatBody.scrollHeight;

	try {
		const response = await fetch("http://localhost:8000/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ message: msg }),
		});

		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

		const data = await response.json();
		botMsg.textContent = "ICare: " + (data.reply || "");
	} catch (error) {
		console.error("Error:", error);
		botMsg.textContent = "⚠️ Chatbot đang tắt hoặc lỗi kết nối (cổng 8000).";
	}

	chatBody.scrollTop = chatBody.scrollHeight;
}
// =========================================================================
// KHAI BÁO BIẾN CHO MODAL ĐĂNG KÝ/ĐĂNG NHẬP
// =========================================================================

// Helpers
function validatePhone(phone) {
	// Kiểm tra SĐT hợp lệ (10 hoặc 11 số, bắt đầu bằng 0)
	return /^(0[0-9]{9,10})$/.test(phone);
}
const API_BASE = "http://localhost:3000";

// Đăng ký
const reg_name = document.getElementById("reg_name");
const reg_phone = document.getElementById("reg_phone");
const reg_pass = document.getElementById("reg_pass");
const reg_repass = document.getElementById("reg_repass");
const registerBtn = document.getElementById("registerBtn");
const registerError = document.getElementById("registerError");
const reg_passErr = document.getElementById("reg_passErr");

// Đăng nhập
const log_phone = document.getElementById("log_phone");
const log_pass = document.getElementById("log_pass");
const logBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError"); // Lỗi chung (trên form)
const log_phoneError = document.getElementById("log_phoneError"); // Lỗi SĐT không hợp lệ (dưới input)

// Modal
const registerModal = document.getElementById("registerModal");
const loginModal = document.getElementById("loginModal");
const headerRegister = document.getElementById("headerRegister");
const headerLogin = document.getElementById("headerLogin");
const closeRegister = document.getElementById("closeRegister");
const closeLogin = document.getElementById("closeLogin");
const toLogin = document.getElementById("toLogin");
const toRegister = document.getElementById("toRegister");

// =========================================================================
// FUNCTIONS
// =========================================================================

// VALIDATION ĐĂNG KÝ
function updateRegState() {
	if (!registerBtn) return;
	registerError.textContent = "";
	reg_passErr.textContent = "";
	let hasError = false;

	const nameValue = reg_name ? reg_name.value.trim() : "";
	const phoneValue = reg_phone ? reg_phone.value.trim() : "";
	const passValue = reg_pass ? reg_pass.value : "";
	const repassValue = reg_repass ? reg_repass.value : "";

	// Check all fields are filled
	const allFilled = nameValue && phoneValue && passValue && repassValue;

	if (phoneValue && !validatePhone(phoneValue)) {
		registerError.textContent = "Số điện thoại không hợp lệ";
		hasError = true;
	}

	if (passValue && (passValue.length < 8 || !/[A-Za-z]/.test(passValue) || !/\d/.test(passValue))) {
		reg_passErr.textContent = "Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số!";
		hasError = true;
	}

	if (passValue && repassValue && passValue !== repassValue) {
		reg_passErr.textContent = "Mật khẩu xác nhận không khớp!";
		hasError = true;
	}

	registerBtn.disabled = !(allFilled && !hasError);
}

// VALIDATION ĐĂNG NHẬP (Chỉ quản lý lỗi 3định dạng SĐT và trạng thái nút)
function updateLoginState() {
	if (!logBtn || !log_phoneError || !log_phone || !log_pass) return;

	// ⚠️ ĐÃ XÓA logic ẩn loginError. Nó chỉ ẩn/hiện trong hàm Login handler.
	log_phoneError.textContent = "";
	log_phoneError.style.display = "none";

	const sdtValue = log_phone.value.trim();
	const passValue = log_pass.value.trim();

	// Logic kiểm tra định dạng SĐT (Client-side)
	if (sdtValue && !validatePhone(sdtValue)) {
		log_phoneError.textContent = "Số điện thoại không hợp lệ";
		log_phoneError.style.display = "block";
		logBtn.disabled = true;
		return;
	}

	// Vô hiệu hóa nút nếu một trong hai trường rỗng
	logBtn.disabled = !(sdtValue && passValue);
}

// Toggle Modal
function resetAuthForms() {
	if (reg_name) reg_name.value = "";
	if (reg_phone) reg_phone.value = "";
	if (reg_pass) reg_pass.value = "";
	if (reg_repass) reg_repass.value = "";
	if (reg_name) reg_name.value = "";
	if (reg_phone) reg_phone.value = "";
	if (reg_pass) reg_pass.value = "";
	if (reg_repass) reg_repass.value = "";
	if (registerError) registerError.textContent = "";
	if (reg_passErr) reg_passErr.textContent = "";
	if (log_phone) log_phone.value = "";
	if (log_pass) log_pass.value = "";
	if (loginError) {
		loginError.textContent = "";
		loginError.style.display = "none";
	}
	if (log_phoneError) {
		log_phoneError.textContent = "";
		log_phoneError.style.display = "none";
	}
}

function openModal(modal) {
	if (!modal) return;

	document.querySelectorAll(".auth-modal").forEach((item) => {
		item.classList.remove("show");
		item.style.display = "none";
	});

	modal.style.display = "flex";
	requestAnimationFrame(() => modal.classList.add("show"));
}

function closeModal(modal) {
	if (!modal) return;
	modal.classList.remove("show");
	setTimeout(() => {
		if (!modal.classList.contains("show")) {
			modal.style.display = "none";
		}
	}, 220);
}

function toggleRegisterModal() {
	if (registerModal && registerModal.style.display === "flex") {
		closeModal(registerModal);
	} else {
		resetAuthForms();
		openModal(registerModal);
		updateRegState();
	}
}

function toggleLoginModal() {
	if (loginModal && loginModal.style.display === "flex") {
		closeModal(loginModal);
	} else {
		resetAuthForms();
		openModal(loginModal);
		updateLoginState();
	}
}

// =========================================================================
// EVENT LISTENERS
// =========================================================================

// Sự kiện mở modal
if (headerRegister) headerRegister.addEventListener("click", toggleRegisterModal);
if (headerLogin) headerLogin.addEventListener("click", toggleLoginModal);

// Sự kiện đóng mở modal
if (closeRegister) closeRegister.addEventListener("click", () => closeModal(registerModal));
if (closeLogin) closeLogin.addEventListener("click", () => closeModal(loginModal));

// Sự kiện chuyển đổi giữa hai modal
if (toLogin) toLogin.addEventListener("click", toggleLoginModal);
if (toRegister) toRegister.addEventListener("click", toggleRegisterModal);

// Input change listeners for validation
const requiredInputs = document.querySelectorAll(".required-input");
requiredInputs.forEach((input) => {
	input.addEventListener("input", () => {
		if (input.closest("#formRegister")) {
			updateRegState();
		} else if (input.closest("#formLogin")) {
			// Khi user gõ, ẩn lỗi chung đi (nếu có) để chuẩn bị cho lần thử mới
			if (loginError) {
				loginError.textContent = "";
				loginError.style.display = "none";
			}
			updateLoginState();
		}
	});
});

// Register handler (Giữ nguyên)
if (registerBtn)
	registerBtn.addEventListener("click", async () => {
		registerBtn.disabled = true;

		const payload = {
			hoten: reg_name.value.trim(),
			sdt: reg_phone.value.trim(),
			matkhau: reg_pass.value,
		};

		try {
			const res = await fetch(API_BASE + "/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = await res.json();

			if (res.ok) {
				alert(data.message || "Đăng ký thành công! Vui lòng đăng nhập.");
				resetAuthForms();
				openModal(loginModal);
			} else {
				registerError.textContent = data.message || "Đăng ký thất bại!";
			}
		} catch (err) {
			console.error("Lỗi kết nối Server:", err);
			registerError.textContent = "Không thể kết nối tới server.";
		} finally {
			updateRegState();
		}
	});

// Login handler
if (logBtn)
	logBtn.addEventListener("click", async () => {
		logBtn.disabled = true;
		loginError.textContent = "";
		loginError.style.display = "none"; // ✅ ẨN LỖI CHUNG KHI BẮT ĐẦU GỬI
		log_phoneError.textContent = ""; // ẨN LỖI SĐT
		log_phoneError.style.display = "none";

		const sdtValue = log_phone ? log_phone.value.trim() : "";
		const passValue = log_pass ? log_pass.value : "";

		// Kiểm tra thiếu input (Hiển thị tại vị trí lỗi chung)
		if (!sdtValue || !passValue) {
			loginError.textContent = "Vui lòng nhập số điện thoại và mật khẩu!";
			loginError.style.display = "block";
			logBtn.disabled = false;
			return;
		}

		try {
			const res = await fetch(API_BASE + "/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sdt: sdtValue, matkhau: passValue }),
			});
			const data = await res.json();

			if (res.ok) {
				// Đăng nhập thành công
				localStorage.setItem("loggedIn", "true");
				localStorage.setItem("token", data.token);

				const onApiHost = /:(3000)$/.test(location.host) || location.pathname.startsWith("/customer") || location.pathname.startsWith("/admin-panel");

				if (data.isAdmin) {
					localStorage.setItem("adminId", String(data.admin.idQTV));
					localStorage.removeItem("userId");
					localStorage.removeItem("userName");
					window.location.href = onApiHost
						? "/admin-panel/admin.html"
						: "../../Quản trị viên/admin.html";
				} else {
					localStorage.setItem("userId", String(data.user.idKH));
					localStorage.setItem("userName", data.user.hoTen || "");
					localStorage.removeItem("adminId");
					window.location.href = onApiHost
						? "/customer/trangchu/trangchu1.html"
						: "../trangchu/trangchu1.html";
				}
			} else {
				// ✅ Hiển thị lỗi từ server: "Số điện thoại hoặc mật khẩu không đúng!"
				loginError.textContent =
					data.message || "Số điện thoại hoặc mật khẩu không đúng!";
				loginError.style.display = "block"; // 👈 HIỂN THỊ Ở VỊ TRÍ CHUNG
			}
		} catch (err) {
			console.error("Lỗi kết nối Server:", err);
			loginError.textContent = "Không thể kết nối tới server.";
			loginError.style.display = "block"; // 👈 HIỂN THỊ Ở VỊ TRÍ CHUNG
		} finally {
			// Chỉ cập nhật trạng thái nút và kiểm tra lỗi định dạng SĐT (nếu có)
			updateLoginState();
		}
	});
// ================== HIỂN THỊ MODAL KHI CHƯA ĐĂNG NHẬP (TRÊN TRANG CHƯA ĐĂNG NHẬP) ==================
const btnDatLich = document.getElementById("btnDatLich");
const btnHoSo = document.getElementById("btnHoSo");

if (btnDatLich) {
	btnDatLich.addEventListener("click", (e) => {
		e.preventDefault();
		resetAuthForms();
		openModal(loginModal);
	});
}

if (btnHoSo) {
	btnHoSo.addEventListener("click", (e) => {
		e.preventDefault();
		resetAuthForms();
		openModal(loginModal);
	});
}

if (toRegister) {
	toRegister.addEventListener("click", () => {
		closeModal(loginModal);
		openModal(registerModal);
	});
}

if (toLogin) {
	toLogin.addEventListener("click", () => {
		closeModal(registerModal);
		openModal(loginModal);
	});
}

// Nút đóng
if (document.querySelectorAll(".close-btn").length) {
	document.querySelectorAll(".close-btn").forEach((btn) => {
		btn.addEventListener("click", () => {
			closeModal(btn.closest(".auth-modal"));
		});
	});
}
