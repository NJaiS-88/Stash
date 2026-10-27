"""
Phase 31 — LangChain RAG Pipeline
Uses LangChain and Google Gemini Flash 2.5 (gemini-2.5-flash) to perform
natural language question-answering over the user's private photo captions.
"""

import os
from typing import List, Dict, Any, Optional
from pipeline import construct_retrieval_text, TextEmbeddingPipeline
import numpy as np

# LangChain Imports
try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.prompts import PromptTemplate
    from langchain_core.output_parsers import StrOutputParser
    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False


RAG_SYSTEM_PROMPT = """You are Stash AI, an intelligent and private personal photo assistant.
The user is asking a question about their personal photo library.

You have access ONLY to the retrieved photo captions and keywords below from the user's private collection.
Under no circumstances do you have access to raw image files or other users' photos.

---------------------
RETRIEVED PHOTOS:
{context}
---------------------

USER QUESTION: {question}

INSTRUCTIONS:
1. Answer the user's question directly and conversationally based ONLY on the photos listed above.
2. For every photo you mention, clearly cite which photo and its Image ID (e.g. Photo 1 [ID: image-id-here]).
3. Explain what visual details in the photo answer their question.
4. If the retrieved photos do NOT contain what the user asked about, politely inform them that no matching photos were found in their library. Never invent or hallucinate photos.

YOUR ANSWER:"""


class StashRAGChain:
    """
    RAG chain built with LangChain, utilizing Google Gemini Flash 2.5
    for generative reasoning over retrieved photo semantic contexts.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None
    ):
        raw_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.api_key = raw_key.strip() if raw_key else None
        # Default to configured GEMINI_MODEL
        self.model_name = (model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")).strip()
        self.embed_pipeline = TextEmbeddingPipeline(api_key=self.api_key)
        self.llm = None
        self.chain = None
        self._init_llm()

    def _init_llm(self):
        if not LANGCHAIN_AVAILABLE:
            print("[StashRAGChain] Warning: LangChain or langchain-google-genai not installed.")
            return

        if self.api_key:
            try:
                # Initialize Gemini Flash 2.5
                self.llm = ChatGoogleGenerativeAI(
                    model=self.model_name,
                    google_api_key=self.api_key,
                    temperature=0.2,
                    max_output_tokens=1000
                )
                prompt = PromptTemplate(
                    template=RAG_SYSTEM_PROMPT,
                    input_variables=["context", "question"]
                )
                # Modern LangChain LCEL pipeline
                self.chain = prompt | self.llm | StrOutputParser()
                print(f"[StashRAGChain] Initialized LangChain with LLM: {self.model_name}")
            except Exception as e:
                print(f"[StashRAGChain] Failed to initialize Gemini LLM: {e}")
                self.llm = None
                self.chain = None
        else:
            print("[StashRAGChain] Notice: GEMINI_API_KEY not configured. Running in retrieval-matching mode.")

    def reload_key(self, api_key: str):
        """Allows dynamic runtime reload of the API key when pasted in .env."""
        self.api_key = api_key
        self.embed_pipeline = TextEmbeddingPipeline(api_key=self.api_key)
        self._init_llm()

    def retrieve_relevant_images(
        self,
        question: str,
        images: List[Dict[str, Any]],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Embeds the question text and performs cosine similarity retrieval
        over the pre-constructed retrieval texts of user images.
        """
        if not images:
            return []

        q_vec = np.array(self.embed_pipeline.embed_text(question), dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 0:
            q_vec = q_vec / q_norm

        scored_images = []
        for img in images:
            retrieval_text = img.get("retrievalText") or construct_retrieval_text(
                img.get("caption", ""),
                img.get("keywords", [])
            )

            # Use cached embedding or compute from retrieval text
            if "embedding" in img and img["embedding"] and len(img["embedding"]) == len(q_vec):
                img_vec = np.array(img["embedding"], dtype=np.float32)
            else:
                img_vec = np.array(self.embed_pipeline.embed_text(retrieval_text), dtype=np.float32)

            img_norm = np.linalg.norm(img_vec)
            if img_norm > 0:
                img_vec = img_vec / img_norm

            similarity = float(np.dot(q_vec, img_vec))
            scored_images.append({
                **img,
                "retrievalText": retrieval_text,
                "similarity": similarity
            })

        # Rank descending
        scored_images.sort(key=lambda x: x["similarity"], reverse=True)
        return scored_images[:top_k]

    def ask(
        self,
        question: str,
        images: List[Dict[str, Any]],
        top_k: int = 5
    ) -> Dict[str, Any]:
        """
        Main RAG invocation:
        1. Retrieval: retrieves top relevant images using text embeddings
        2. Augmentation: formats context string with image metadata
        3. Generation: prompts Gemini Flash 2.5 via LangChain chain
        """
        if not images:
            return {
                "question": question,
                "answer": "You do not have any photos indexed in your gallery yet. Connect a folder to begin.",
                "referencedImages": []
            }

        # 1. Retrieve top-k relevant photos
        relevant = self.retrieve_relevant_images(question, images, top_k=top_k)

        # Filter out negative / irrelevant matches
        valid_matches = [m for m in relevant if m.get("similarity", 0) > 0.15]
        if not valid_matches and relevant:
            valid_matches = relevant[:2]

        if not valid_matches:
            return {
                "question": question,
                "answer": f"I searched your photo library, but could not find any photos matching '{question}'.",
                "referencedImages": []
            }

        # 2. Construct context for LangChain prompt
        context_blocks = []
        for idx, item in enumerate(valid_matches):
            block = (
                f"Photo {idx + 1}:\n"
                f"  Image ID: {item.get('imageId')}\n"
                f"  Description: {item.get('caption', 'No caption')}\n"
                f"  Keywords: {', '.join(item.get('keywords', []))}"
            )
            context_blocks.append(block)

        context_str = "\n\n".join(context_blocks)

        # 3. Generate answer using LangChain + Gemini Flash 2.5
        answer = ""
        if self.chain:
            try:
                answer = self.chain.invoke({
                    "context": context_str,
                    "question": question
                })
            except Exception as e:
                print(f"[StashRAGChain] LangChain invocation error: {e}. Falling back to formatted summary.")

        # Fallback if API key missing or generation fails
        if not answer:
            descriptions = [f'"{m.get("caption")}" (ID: {m.get("imageId")})' for m in valid_matches]
            answer = f"Based on your private photo library, I found {len(valid_matches)} matching photo(s):\n" + "\n".join(f"• {d}" for d in descriptions)

        return {
            "question": question,
            "answer": answer.strip(),
            "model": self.model_name if self.chain else "local-retrieval-fallback",
            "referencedImages": [
                {
                    "imageId": m.get("imageId"),
                    "caption": m.get("caption"),
                    "keywords": m.get("keywords", []),
                    "similarity": round(m.get("similarity", 0.0), 3)
                }
                for m in valid_matches
            ]
        }
