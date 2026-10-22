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

function loginPageUrl() {
    const onApiHost = /:(3000)$/.test(location.host) || location.pathname.startsWith("/customer");
    return onApiHost ? "/customer/trangchupre/trangchu1.html" : "../trangchupre/trangchu1.html";
}

// 🔒 Kiểm tra đăng nhập khi vào trang
if (!localStorage.getItem("loggedIn") || !localStorage.getItem("token") || !localStorage.getItem("userId")) {
    window.location.replace(loginPageUrl());
}

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

	const userMsg = document.createElement("div");
	userMsg.className = "chat-message user";
	userMsg.textContent = msg;
	chatBody.appendChild(userMsg);
	userInput.value = "";
	chatBody.scrollTop = chatBody.scrollHeight;

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

const userNameDisplay = document.getElementById('userNameDisplay');
const logoutBtn = document.getElementById("logoutBtn");

function displayUserName() {
    const userName = localStorage.getItem('userName');
    const loggedIn = localStorage.getItem('loggedIn');
    const userMenu = document.querySelector('.user-menu');
    const authDiv = document.querySelector('.auth');

    if (userName && loggedIn === 'true' && userNameDisplay) {
        userNameDisplay.textContent = `${userName}`;
        if (userMenu) userMenu.style.display = 'inline-block';
        if (authDiv) authDiv.style.display = 'none';
    } else {
        if (userMenu) userMenu.style.display = 'none';
        if (authDiv) authDiv.style.display = 'flex';
    }
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('loggedIn');
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('userName');
        localStorage.removeItem('adminId');
        window.location.href = loginPageUrl();
    });
}

document.addEventListener('DOMContentLoaded', () => {
    displayUserName();
});
