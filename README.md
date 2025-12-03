# Multimodal Legal RAG with Source Citation  
This project is a full-stack, multimodal Retrieval-Augmented Generation (RAG) system that analyzes user-uploaded legal documents and returns context-aware, source-cited answers. It uses a hybrid model: cloud-based parsing + fully local AI models. Everything is derived from the project report.

## Key Features
- Upload PDF, DOCX, PNG, JPG legal documents  
- Automatic parsing & OCR via LlamaParse  
- Context-injection RAG (embeds full document + query)  
- Local models: nomic-embed-text (embedding) & llama3.2:8b (generation)  
- Permanent Qdrant-based Legal Knowledge Base  
- Next.js chat frontend with citations  
- Strict JSON-only AI output for reliability

## Architecture Overview
### Frontend (Next.js)
- Real-time chat UI with support for file uploads  
- React hooks: useChatMessage (state), useChatService (API)  
- Parses $$-wrapped JSON and displays answer + citation

### Backend (FastAPI)
- Handles file uploads and RAG pipeline  
- Sends documents to LlamaParse for parsing  
- Performs context-injected embedding  
- Queries Qdrant for relevant legal text  
- Uses llama3.2:8b to generate structured JSON response

### Parsing (Cloud)
- LlamaParse handles multimodal ingestion  
- OCR support for scanned images  
- Returns structured extracted text (user_doc_text)

### Local AI (Ollama)
- nomic-embed-text: 8K-token embedding for deep context  
- llama3.2:8b: generates 60+ word structured JSON analysis  
- One-shot prompting ensures formatting consistency

### Qdrant Knowledge Base
- Stores permanent legal documents (BNS, BNSS, Arms Act, etc.)  
- Built via offline ingestion: PyMuPDF → metadata → embeddings  
- Supports fast cosine-similarity retrieval using HNSW

## End-to-End Workflow
1. User uploads file + query in frontend  
2. Next.js sends FormData → FastAPI  
3. FastAPI sends file → LlamaParse for text/OCR  
4. Backend concatenates doc_text + query into combined string  
5. nomic-embed-text embeds entire context into vector  
6. Qdrant returns top legal chunks  
7. llama3.2:8b produces $$-wrapped JSON answer  
8. Frontend parses JSON and displays answer + citation

## Results
- Successfully handled multimodal inputs  
- Highly accurate semantic retrieval using context-injection  
- Reliable JSON responses with one-shot prompting  
- Avg. response time: 8–12 seconds (cloud OCR + local LLM)  
- Achieved precise source citation from permanent KB

## Conclusion
The system demonstrates that hybrid-cloud + local RAG can bridge personal legal documents with Indian law. Large-context embeddings, structured JSON generation, and modular full-stack design make the tool scalable, private, and highly effective for contextual legal analysis.

## Suggested Repo Structure
project-root/
├── backend/
│   ├── main.py
│   ├── ingestion_pipeline/
│   ├── models/
│   └── utils/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   └── services/
├── knowledge_base/
│   └── qdrant_data/
└── README.md

## Tools & Frameworks
FastAPI, Next.js, Qdrant, Ollama, LlamaParse, PyMuPDF, TypeScript, Python, GitHub, VS Code
