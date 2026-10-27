import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    print("=" * 60)
    print("  🚀 Stash RAG & Text Embedding Microservice (FastAPI)")
    print(f"  🤖 LLM: {os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')}")
    print(f"  🌐 URL: http://{host}:{port}")
    print(f"  📖 Docs: http://{host}:{port}/docs")
    print("=" * 60)
    uvicorn.run("main:app", host=host, port=port, reload=True)
