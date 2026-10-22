# server.py — API chatbot (FastAPI)
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Load .env thủ công (không bắt buộc python-dotenv)
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)

# KHÔNG hardcode API key — chỉ lấy từ biến môi trường / .env
if not os.getenv("GEMINI_API_KEY"):
    print("⚠️ GEMINI_API_KEY chưa được cấu hình. Chatbot sẽ không hoạt động cho đến khi bạn thêm key vào .env")

from chatbot import MedicalChatbot

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
]

app = FastAPI(title="ICare Chatbot")
chatbot = None

try:
    chatbot = MedicalChatbot()
except Exception as exc:
    print(f"⚠️ Không khởi tạo được chatbot: {exc}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


@app.post("/chat")
async def chat(req: ChatRequest):
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot chưa sẵn sàng. Kiểm tra GEMINI_API_KEY trong .env")
    text = req.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Tin nhắn trống")
    try:
        answer = chatbot.ask(text)
        return {"reply": answer}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Lỗi chatbot: {exc}") from exc


@app.get("/")
def home():
    return {
        "message": "Server is running",
        "chatbot_ready": chatbot is not None,
    }
