import fitz  # PyMuPDF
import ollama
from qdrant_client import QdrantClient, models
import csv
import uuid
import re
import os
import logging
from tqdm import tqdm
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from pydantic import Field, BaseModel

# --- --- --- --- --- --- --- --- --- ---
# 1. CONFIGURATION
# --- --- --- --- --- --- --- --- --- ---
class AppConfig(BaseSettings):
    OLLAMA_HOST: str = Field("http://192.168.10.50:11434", env="OLLAMA_HOST")
    PDF_DIRECTORY: str = Field("path/to/your/pdf_directory", env="PDF_DIRECTORY")
    CSV_FILE_PATH: str = Field("path/to/your/csv_file.csv", env="CSV_FILE_PATH")
    QDRANT_PATH: str = Field("./qdrant_db1", env="QDRANT_PATH")
    COLLECTION_NAME: str = Field("local_citations", env="COLLECTION_NAME")
    VECTOR_SIZE: int = Field(768, env="VECTOR_SIZE")
    VECTOR_DISTANCE: str = Field("COSINE", env="VECTOR_DISTANCE")
    EMBEDDING_MODEL: str = Field("nomic-embed-text", env="EMBEDDING_MODEL")
    PARAGRAPH_THRESHOLD: int = Field(12, env="PARAGRAPH_THRESHOLD")

config = AppConfig()

# --- PDF Parsing ---
PARAGRAPH_THRESHOLD = config.PARAGRAPH_THRESHOLD

# --- File Paths ---
PDF_DIRECTORY = config.PDF_DIRECTORY
CSV_FILE_PATH = config.CSV_FILE_PATH
# --- Qdrant (On-Disk Mode) ---
# This is the folder that will be created to store your database.
QDRANT_PATH = config.QDRANT_PATH
COLLECTION_NAME = config.COLLECTION_NAME
VECTOR_SIZE = config.VECTOR_SIZE  # For nomic-embed-text
VECTOR_DISTANCE = models.Distance.COSINE

# --- Ollama ---
OLLAMA_HOST = config.OLLAMA_HOST
EMBEDDING_MODEL = config.EMBEDDING_MODEL


# --- --- --- --- --- --- --- --- --- ---
# 2. HELPER FUNCTIONS
# --- --- --- --- --- --- --- --- --- ---

def setup_logging():
    """Configures the logging system for clear console output."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

def create_qdrant_collection(client, collection_name):
    """
    Ensures the Qdrant collection exists and has the correct vector configuration.
    """
    try:
        # Check if collection already exists
        client.get_collection(collection_name=collection_name)
        logging.info(f"Collection '{collection_name}' already exists.")
    except Exception:
        # If it doesn't exist, create it
        logging.info(f"Collection '{collection_name}' not found. Creating...")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(
                size=VECTOR_SIZE,
                distance=VECTOR_DISTANCE
            )
        )
        logging.info(f"Collection '{collection_name}' created successfully.")

# --- (The parse_pdf_chunks function is identical, so it's omitted for brevity) ---
def parse_pdf_chunks(pdf_path):
    """
    Opens a PDF and yields paragraph chunks with metadata.
    (This function is unchanged from the previous script)
    """
    doc = fitz.open(pdf_path)
    
    for page_num_plus_one in range(1, len(doc) + 1):
        page = doc.load_page(page_num_plus_one - 1)
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (b[1], b[0]))  # Sort by y0, then x0

        current_paragraph_text = ""
        current_paragraph_num = 1
        last_block_y1 = 0

        for i, block in enumerate(blocks):
            block_text = block[4].strip()
            if not block_text:
                continue

            block_y0 = block[1]
            is_new_paragraph = False

            if i == 0:
                is_new_paragraph = True
            else:
                vertical_distance = block_y0 - last_block_y1
                if vertical_distance > PARAGRAPH_THRESHOLD:
                    is_new_paragraph = True

            if is_new_paragraph and current_paragraph_text:
                clean_text = re.sub(r'\s+', ' ', current_paragraph_text).strip()
                if clean_text:
                    yield {
                        "page_number": page_num_plus_one,
                        "paragraph_number": current_paragraph_num,
                        "text": clean_text
                    }
                current_paragraph_num += 1
                current_paragraph_text = block_text
            else:
                if current_paragraph_text:
                    current_paragraph_text += " " + block_text
                else:
                    current_paragraph_text = block_text
            last_block_y1 = block[3]

        if current_paragraph_text:
            clean_text = re.sub(r'\s+', ' ', current_paragraph_text).strip()
            if clean_text:
                yield {
                    "page_number": page_num_plus_one,
                    "paragraph_number": current_paragraph_num,
                    "text": clean_text
                }
    doc.close()


# --- --- --- --- --- --- --- --- --- ---
# 3. MAIN INGESTION SCRIPT
# --- --- --- --- --- --- --- --- --- ---

def main():
    """
    Main function to run the full ingestion pipeline.
    """
    setup_logging()
    logging.info("Starting ingestion pipeline (On-Disk Mode)...")

    # --- Initialize Clients ---
    try:
        # THIS IS THE CHANGE: Use `path` to create a local, file-based database.
        # No server or Docker needed.
        qdrant_client = QdrantClient(path=QDRANT_PATH)
        
        ollama_client = ollama.Client(host=OLLAMA_HOST)
        # Verify connection to Ollama (Ollama still runs as a server)
        ollama_client.list() 
        logging.info(f"Connected to Ollama and initialized Qdrant at '{QDRANT_PATH}'.")
    except Exception as e:
        logging.error(f"Failed to connect to Ollama: {e}")
        logging.error("Please ensure Ollama is running.")
        return

    # --- Setup Qdrant Collection ---
    create_qdrant_collection(qdrant_client, COLLECTION_NAME)

    # --- Read CSV Master List ---
    try:
        with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as f:
            all_files = list(csv.DictReader(f))
    except FileNotFoundError:
        logging.error(f"FATAL: CSV file not found at {CSV_FILE_PATH}")
        return
    except Exception as e:
        logging.error(f"FATAL: Error reading CSV file: {e}")
        return
        
    logging.info(f"Found {len(all_files)} files to process from CSV.")
    
    # --- Main Processing Loop (with Progress Bar) ---
    for file_info in tqdm(all_files, desc="Processing Files", unit="file"):
        filename = file_info.get('filename')
        source_id = file_info.get('source_id')

        if not filename or not source_id:
            logging.warning(f"Skipping row with missing data: {file_info}")
            continue

        pdf_path = os.path.join(PDF_DIRECTORY, filename)
        
        try:
            if not os.path.exists(pdf_path):
                logging.warning(f"File not found, skipping: {pdf_path}")
                continue
            
            logging.info(f"Processing: {filename}")
            
            points_to_upload = []
            
            for chunk in parse_pdf_chunks(pdf_path):
                
                text_to_embed = chunk["text"]
                
                response = ollama_client.embeddings(
                    model=EMBEDDING_MODEL,
                    prompt=text_to_embed
                )
                vector = response["embedding"]
                
                payload = {
                    "filename": filename,
                    "source_id": source_id,
                    "page_number": chunk["page_number"],
                    "paragraph_number": chunk["paragraph_number"],
                    "text_chunk": text_to_embed
                }
                
                points_to_upload.append(
                    models.PointStruct(
                        id=str(uuid.uuid4()),
                        vector=vector,
                        payload=payload
                    )
                )
            
            if points_to_upload:
                qdrant_client.upsert(
                    collection_name=COLLECTION_NAME,
                    points=points_to_upload,
                    wait=True
                )
                logging.info(f"Uploaded {len(points_to_upload)} chunks for {filename}")
            else:
                logging.warning(f"No text chunks found in {filename}")

        except Exception as e:
            logging.error(f"Failed to process {filename}: {e}", exc_info=True)
            pass 

    logging.info("Ingestion process complete.")
    logging.info(f"Your vector database is saved in the '{QDRANT_PATH}' folder.")

# --- Run the script ---
if __name__ == "__main__":
    main()