"""Provider Adapter 抽象基类。"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import AsyncIterator, TypedDict


class ChatMessage(TypedDict):
    role: str           # "system" | "user" | "assistant" | "tool"
    content: str


class ProviderAdapter(ABC):
    """所有模型供应商必须实现的接口。"""

    def __init__(self, api_key: str, base_url: str, model: str, **kwargs):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.extra = kwargs

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[ChatMessage],
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """流式对话,每次 yield 一个 content 片段。"""

    @abstractmethod
    async def list_models(self) -> list[str]:
        """列出可用模型。"""

    async def health_check(self) -> bool:
        """默认实现:发一条最小请求。"""
        try:
            async for _ in self.stream_chat(
                [{"role": "user", "content": "ping"}],
                temperature=0.0, max_tokens=8,
            ):
                return True
        except Exception:
            return False
        return False