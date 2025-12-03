import os
import logging
import tempfile
from typing import Annotated, Optional

# --- FastAPI ---
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# --- Pydantic & DotEnv ---
from pydantic_settings import BaseSettings
from pydantic import Field, BaseModel
from dotenv import load_dotenv

# --- LlamaIndex Core & Integrations ---
from llama_index.core import Settings
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_parse import LlamaParse

# --- Qdrant Client ---
from qdrant_client import QdrantClient

# --- Logging & Env ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
log = logging.getLogger(__name__)
load_dotenv()

class AppConfig(BaseSettings):
    LLAMA_CLOUD_API_KEY: str = Field(..., env="LLAMA_CLOUD_API_KEY")
    QDRANT_PATH: str = Field("./qdrant_db1", env="QDRANT_PATH")
    COLLECTION_NAME: str = Field("local_citations", env="COLLECTION_NAME")
    EMBEDDING_MODEL: str = Field("nomic-embed-text", env="EMBEDDING_MODEL")
    LLM_MODEL: str = Field("llama3.2:8b", env="LLM_MODEL")
    TOP_K_RESULTS: int = Field(5, env="TOP_K_RESULTS")
    SCORE_THRESHOLD: float = Field(0.7, env="SCORE_THRESHOLD")
    ALLOWED_ORIGINS: list[str] = Field("http://localhost:3000,http://127.0.0.1:3000", env="ALLOWED_ORIGINS")

config = AppConfig()

# --- Model / Engine Config ---
EMBEDDING_MODEL = config.EMBEDDING_MODEL
LLM_MODEL = config.LLM_MODEL

QDRANT_PATH = config.QDRANT_PATH
COLLECTION_NAME = config.COLLECTION_NAME
TOP_K_RESULTS = 5
SCORE_THRESHOLD = 0.7

# Validation constants
MAX_FILE_MB = 5
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
    "image/jpg",
}

SYSTEM_PROMPT = """You are a highly specialized legal analyst. Your user is a local citizen.
You will be given THREE pieces of information:
1. A USER'S QUESTION.
2. The full text of a USER'S DOCUMENT (if provided).
3. Several relevant LEGAL CHUNKS from a permanent knowledge base of official laws and regulations.

Your task is to synthesize all this information to answer the user's question.
- First, analyze the USER'S DOCUMENT (if it exists).
- Then, use the LEGAL CHUNKS to provide the official legal context and definitions.
- Finally, answer the USER'S QUESTION by connecting the user's document to the law.
- You MUST cite the legal chunks you use, like [Source: filename, Page: X, Para: Y].
- If the legal chunks are not relevant or don't add value, state that you can only analyze the user's document (or only the question if no document was provided).
- Your tone should be formal, professional, and helpful.
"""

# --- Initialize global clients ---
try:

    parser = LlamaParse(
        api_key=config.LLAMA_CLOUD_API_KEY,
        result_type="text",
        verbose=True
    )

    Settings.llm = Ollama(
        model=LLM_MODEL,
        base_url="http://192.168.10.50:11434",
        request_timeout=120.0
    )
    log.info(f"Ollama LLM initialized: {LLM_MODEL}")

    Settings.embed_model = OllamaEmbedding(
        model_name=EMBEDDING_MODEL,
        base_url="http://192.168.10.50:11434",  # Ensure this host is reachable
    )
    log.info(f"Ollama embedding model initialized: {EMBEDDING_MODEL}")

    qdrant_client = QdrantClient(path=QDRANT_PATH)
    log.info(f"Connected to Qdrant at path: {QDRANT_PATH}")

    qdrant_client.get_collection(collection_name=COLLECTION_NAME)
    log.info(f"Verified collection exists: {COLLECTION_NAME}")

except Exception as e:
    log.error("FATAL: Initialization failure", exc_info=True)
    raise

# --- FastAPI App ---
app = FastAPI(
    title="Hybrid RAG Engine (Local LLM)",
    description="Analyzes user documents (optional) against a permanent legal knowledge base."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("ALLOWED_ORIGINS", "").rstrip("/") or ""
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RAGResponse(BaseModel):
    answer: str
    retrieved_sources_count: int

async def log_request_info(user_query: str = Form(...)):
    log.info("--- New Request ---")
    log.info(f"User query: {user_query}")
    return user_query

def validate_file(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}"
        )

@app.post("/analyze/", response_model=RAGResponse)
async def analyze_document(
    user_query: Annotated[str, Depends(log_request_info)],
    file: Optional[UploadFile] = File(
        None,
        description=f"Optional document (PDF, DOCX, PNG, JPG). Max {MAX_FILE_MB}MB."
    )
):
    try:
        user_doc_text = ""
        if file:
            validate_file(file)
            file_bytes = await file.read()
            if len(file_bytes) > MAX_FILE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File exceeds {MAX_FILE_MB}MB limit."
                )

            _, ext = os.path.splitext(file.filename or "")
            suffix = ext if ext else ""
            log.info(f"Parsing uploaded file: {file.filename} (size={len(file_bytes)} bytes)")

            try:
                with tempfile.NamedTemporaryFile(delete=True, suffix=suffix) as tmp:
                    tmp.write(file_bytes)
                    tmp.flush()
                    documents = await parser.aload_data(tmp.name)
            except Exception as parse_err:
                log.error("LlamaParse parsing error", exc_info=True)
                raise HTTPException(status_code=400, detail=f"Failed to parse document: {parse_err}")

            if not documents:
                raise HTTPException(status_code=400, detail="Empty parse result for document.")

            # Adjust if your document object uses .text or .get_content()
            user_doc_text = documents[0].get_text()
            log.info(f"Document parsed ({len(user_doc_text)} chars).")
        else:
            log.info("No file uploaded; proceeding with question only.")

        if user_doc_text:
            combined_query_text = f"USER'S DOCUMENT:\n{user_doc_text}\n\nUSER'S QUESTION:\n{user_query}"
        else:
            combined_query_text = f"USER'S QUESTION ONLY:\n{user_query}"

        log.info(f"Embedding combined query (length={len(combined_query_text)} chars)...")
        query_vector = await Settings.embed_model.aget_query_embedding(combined_query_text)
        log.info("Embedding complete.")

        log.info("Searching Qdrant...")
        search_results = qdrant_client.search(
            collection_name=COLLECTION_NAME,
            query_vector=query_vector,
            limit=TOP_K_RESULTS,
            score_threshold=SCORE_THRESHOLD,
            with_payload=True
        )
        retrieved_sources_count = len(search_results)
        log.info(f"KB hits: {retrieved_sources_count}")

        if search_results:
            legal_chunks_text = ""
            for i, result in enumerate(search_results):
                payload = result.payload or {}
                cite = f"[Source: {payload.get('filename', 'N/A')}, Page: {payload.get('page_number', 'N/A')}, Para: {payload.get('paragraph_number', 'N/A')}]"
                legal_chunks_text += f"\n--- Legal Chunk {i+1} {cite} ---\n"
                legal_chunks_text += payload.get("text_chunk", "No text available.") + "\n"
        else:
            legal_chunks_text = "No relevant legal chunks were found in the knowledge base for this context."

        final_prompt = f"""{SYSTEM_PROMPT}

--- USER'S QUESTION ---
{user_query}

--- USER'S DOCUMENT TEXT ---
{user_doc_text or "[No user document provided]"}

--- RELEVANT LEGAL CHUNKS FROM KNOWLEDGE BASE ---
{legal_chunks_text}

--- FINAL ANALYSIS ---
"""

        log.info(f"Calling local LLM model '{LLM_MODEL}'...")
        response = await Settings.llm.acomplete(final_prompt)
        final_answer = response.text
        log.info("Answer generation complete.")

        return RAGResponse(
            answer=final_answer,
            retrieved_sources_count=retrieved_sources_count
        )

    except HTTPException:
        raise
    except Exception as e:
        log.error("Unhandled error in /analyze/", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")

if __name__ == "__main__":
    log.info("Starting server at http://127.0.0.1:8000")
    uvicorn.run(app, host="127.0.0.1", port=8000)