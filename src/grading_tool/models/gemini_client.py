from __future__ import annotations

import json
import os

from dotenv import load_dotenv
import google.generativeai as genai


load_dotenv()


class GeminiClient:
    def __init__(self, model_name: str | None = None, api_key: str | None = None):
        api_key = api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is not set.")

        genai.configure(api_key=api_key)
        self.model_name = model_name or os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")
        self.model = genai.GenerativeModel(self.model_name)

    def generate_json(self, system_prompt: str, payload: dict) -> dict:
        prompt = (
            f"{system_prompt}\n\n"
            "Return valid JSON only.\n\n"
            f"INPUT:\n{json.dumps(payload, ensure_ascii=False, indent=2)}"
        )

        # temperature=0 + top_p=1 + top_k=1 makes the model greedy: same prompt
        # should produce the same (or near-identical) output across calls.
        response = self.model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.0,
                "top_p": 1.0,
                "top_k": 1,
                "response_mime_type": "application/json",
            },
        )
        text = (response.text or "").strip()

        if text.startswith("```json"):
            text = text[len("```json"):].strip()
        if text.startswith("```"):
            text = text[len("```"):].strip()
        if text.endswith("```"):
            text = text[:-3].strip()

        return json.loads(text)