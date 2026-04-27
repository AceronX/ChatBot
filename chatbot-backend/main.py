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

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
if not OPENROUTER_API_KEY:
    raise EnvironmentError(
        "OPENROUTER_API_KEY is not set. Create a .env file in chatbot-backend/ "
        "with: OPENROUTER_API_KEY=your_key_here (see .env.example)."
    )

# --- Model Initialization ---
MODEL_NAME = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
try:
    client = OpenAI(
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )
except Exception as e:
    raise RuntimeError(f"Failed to initialize OpenRouter client: {e}") from e

# --- FastAPI App ---
app = FastAPI(
    title="AI Chatbot API",
    description="API for interacting with an OpenRouter-hosted LLM.",
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
            extra_body={"provider": {"ignore": ["Venice"]}},
        )
    except Exception:
        logger.exception("Error generating content")
        raise HTTPException(status_code=500, detail="Error generating content.")

    text = (completion.choices[0].message.content or "").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Model returned an empty response.")
    return {"response": text}
