import json
import logging
import os
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI, OpenAI
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
_base_url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1"
try:
    # Sync client — used by the non-streaming /chat endpoint
    client = OpenAI(
        api_key=CLOUDFLARE_API_KEY,
        base_url=_base_url,
    )
    # Async client — used by the streaming endpoint so the event loop isn't blocked
    async_client = AsyncOpenAI(
        api_key=CLOUDFLARE_API_KEY,
        base_url=_base_url,
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
    """Non-streaming endpoint for chatting with the AI model."""
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


async def _stream_chunks(user_message: str, request: Request) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted chunks from the model stream (non-blocking).
    Bails early if the client disconnects to avoid wasting tokens.
    Returns an error if the model produces an empty response.
    """
    has_content = False
    try:
        stream = await async_client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": user_message}],
            stream=True,
        )
        async for chunk in stream:
            # Stop generating if the client has disconnected (e.g. Stop button)
            if await request.is_disconnected():
                break
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta and delta.content:
                has_content = True
                # SSE format: "data: <json>\n\n"
                payload = json.dumps({"chunk": delta.content})
                yield f"data: {payload}\n\n"
        
        # If no content was emitted, return an error instead of [DONE]
        if not has_content:
            error_payload = json.dumps({"error": "Model returned an empty response."})
            yield f"data: {error_payload}\n\n"
        else:
            # Signal end of stream
            yield "data: [DONE]\n\n"
    except Exception:
        logger.exception("Error during streaming")
        error_payload = json.dumps({"error": "Error generating content."})
        yield f"data: {error_payload}\n\n"


@app.post("/chat/stream", tags=["Chat"])
async def chat_stream(request: Request, chat_input: ChatInput):
    """Streaming endpoint — returns Server-Sent Events (SSE)."""
    return StreamingResponse(
        _stream_chunks(chat_input.user_message, request),
        media_type="text/event-stream",
        headers={
            # Prevent proxies / browsers from buffering the stream
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
