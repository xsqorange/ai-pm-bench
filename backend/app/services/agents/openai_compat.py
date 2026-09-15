"""DeepSeek / Kimi / OpenAI 兼容接口适配器。"""
from __future__ import annotations
import json
import httpx
from typing import AsyncIterator
from .base import ProviderAdapter, ChatMessage


class OpenAICompatAdapter(ProviderAdapter):
    async def stream_chat(
        self, messages: list[ChatMessage], temperature: float = 0.7, max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": list(messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        timeout = httpx.Timeout(connect=15, read=120, write=30, pool=15)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as r:
                if r.status_code >= 400:
                    body = await r.aread()
                    raise RuntimeError(f"LLM {r.status_code}: {body[:300].decode('utf-8', 'ignore')}")
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield delta
                    except (KeyError, json.JSONDecodeError):
                        continue

    async def list_models(self) -> list[str]:
        url = f"{self.base_url}/models"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(url, headers=headers)
                r.raise_for_status()
                return [m["id"] for m in r.json().get("data", [])]
        except Exception:
            # 一些代理不开放 /models,降级返回空
            return []