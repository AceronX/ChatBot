import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

# --- Configuration ---
load_dotenv()
logger = logging.getLogger(__name__)

CLOUDFLARE_API_KEY = os.getenv("CLOUDFLARE_API_KEY")
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
if not CLOUDFLARE_API_KEY or not CLOUDFLARE_ACCOUNT_ID:
    raise EnvironmentError(
        "CLOUDFLARE_API_KEY and CLOUDFLARE_ACCOUNT_ID must both be set in "
        "chatbot-backend/.env (see .env.example)."
    )

# --- Model Initialization ---
MODEL_NAME = os.getenv("CLOUDFLARE_MODEL", "@cf/meta/llama-3.1-8b-instruct")
try:
    client = OpenAI(
        api_key=CLOUDFLARE_API_KEY,
        base_url=f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
    )
except Exception as e:
    raise RuntimeError(f"Failed to initialize Cloudflare client: {e}") from e

# --- FastAPI App ---
app = FastAPI(
    title="AI Chatbot API",
    description="API for interacting with a Cloudflare Workers AI LLM.",
    version="1.0.0",
)

# --- CORS Configuration ---
# NOTE: No trailing slashes in origins
origins = [
    "http://localhost:5173",               # local dev frontend
    "https://basic-chatbot-xi.vercel.app", # deployed Vercel frontend
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---
class ChatInput(BaseModel):
    user_message: str = Field(..., min_length=1, max_length=4000)

# --- API Endpoints ---
@app.get("/", tags=["Health"])
async def health_check():
    """Endpoint to check the API's health status."""
    return {"status": "ok"}


@app.post("/chat", tags=["Chat"])
async def chat(chat_input: ChatInput):
    """Endpoint for chatting with the AI model."""
    try:
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": chat_input.user_message}],
        )
    except Exception:
        logger.exception("Error generating content")
        raise HTTPException(status_code=500, detail="Error generating content.")

    text = (completion.choices[0].message.content or "").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Model returned an empty response.")
    return {"response": text}
