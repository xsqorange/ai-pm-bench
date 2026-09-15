"""MiniMax 旧版非 OpenAI 兼容接口适配器 — registry.py 的兜底实现。

触发条件:`registry.build_adapter()` 检测到 `provider == "minimax"` 且 `base_url`
包含 `chatcompletion_v2` 时会走本类。

适用场景:
- 用户配置了 MiniMax 自建代理,且代理仍使用 MiniMax 官方旧文档里的
  `POST {base_url}/text/chatcompletion_v2` 端点(返回 SSE, 字段为
  `{"reply":"...", "is_end":false}`)。
- 调试 / 抓包需要保留旧协议。

若 base_url 不含 `chatcompletion_v2`,统一走 `OpenAICompatAdapter`。
"""
from __future__ import annotations
import json
import httpx
from typing import AsyncIterator
from .base import ProviderAdapter, ChatMessage


class MiniMaxAdapter(ProviderAdapter):
    """MiniMax 旧协议适配器。

    Endpoint:  POST {base_url}/text/chatcompletion_v2
    Headers:   Authorization: Bearer <key>
    Body:      { model, messages:[{sender_type, text}], use_standard_sse:true, ... }
    Response:  SSE, 每行 data: {"reply":"...", "is_end":false}
    """

    async def stream_chat(
        self, messages: list[ChatMessage], temperature: float = 0.7, max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        url = f"{self.base_url}/text/chatcompletion_v2"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        converted = []
        for m in messages:
            role = m["role"].lower()
            if role == "system":
                sender = "SYSTEM"
            elif role == "assistant":
                sender = "BOT"
            else:
                sender = "USER"
            converted.append({"sender_type": sender, "text": m["content"]})

        payload = {
            "model": self.model,
            "messages": converted,
            "use_standard_sse": True,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        timeout = httpx.Timeout(connect=15, read=120, write=30, pool=15)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as r:
                if r.status_code >= 400:
                    body = await r.aread()
                    raise RuntimeError(
                        f"MiniMax {r.status_code}: {body[:300].decode('utf-8', 'ignore')}"
                    )
                async for line in r.aiter_lines():
                    if not line:
                        continue
                    raw = line[5:].strip() if line.startswith("data:") else line
                    if not raw or raw == "[DONE]":
                        continue
                    try:
                        obj = json.loads(raw)
                        delta = obj.get("reply") or obj.get("text") or ""
                        if delta:
                            yield delta
                        if obj.get("is_end") or obj.get("finish_reason"):
                            break
                    except json.JSONDecodeError:
                        continue

    async def list_models(self) -> list[str]:
        return ["MiniMax-Text-01", "abab6.5s-chat", "abab6.5-chat"]
