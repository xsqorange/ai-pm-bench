"""按 provider 字段分发到具体 Adapter。支持中文/旧名/别名。

适配策略:
- 默认:`OpenAICompatAdapter`(覆盖 deepseek / kimi / openai / 大部分 MiniMax 调用)
- Fallback:`MiniMaxAdapter`(仅当 provider=minimax 且 base_url 含 `chatcompletion_v2` 时启用,
  用于兼容老用户配置的自建代理或 MiniMax 旧文档里描述的 `text/chatcompletion_v2` 端点)
"""
from __future__ import annotations
from .base import ProviderAdapter
from .openai_compat import OpenAICompatAdapter
from .MiniMax import MiniMaxAdapter  # noqa: F401  # 兜底适配器,见 build_adapter 注释


# 内部标准化的 provider 名称
INTERNAL_PROVIDERS = ("deepseek", "kimi", "openai", "minimax")

# 各种中文 / 旧写法 → 内部名
PROVIDER_ALIASES: dict[str, str] = {
    "deepseek": "deepseek",
    "kimi": "kimi",
    "openai": "openai",
    "minimax": "minimax",
    # 中文 / 旧写法
    "MiniMax": "minimax",
    "MiniMax": "minimax",
    "Mini马": "minimax",
    "minimax-m2": "minimax",
    "minimax-m3": "minimax",
    "abab": "minimax",
    "abab6.5s": "minimax",
    "abab6.5": "minimax",
}


def normalize_provider(p: str | None) -> str:
    """把任意 provider 字符串归一到内部名称 (deepseek / kimi / openai / minimax)。"""
    if not p:
        return ""
    p = p.strip()
    if not p:
        return ""
    if p in PROVIDER_ALIASES:
        return PROVIDER_ALIASES[p]
    pl = p.lower()
    if pl in PROVIDER_ALIASES:
        return PROVIDER_ALIASES[pl]
    # 提取 ASCII 部分做模糊匹配
    ascii_key = "".join(c for c in pl if c.isascii())
    if ascii_key and len(ascii_key) >= 3:
        for known in INTERNAL_PROVIDERS:
            head = known[: min(4, len(known))]
            if ascii_key.startswith(head) and ascii_key[:3] == known[:3]:
                return known
        if ascii_key in INTERNAL_PROVIDERS:
            return ascii_key
    return pl


def _uses_legacy_minimax_endpoint(base_url: str) -> bool:
    """检测是否指向 MiniMax 旧版非 OpenAI 兼容端点 (`text/chatcompletion_v2`)。"""
    if not base_url:
        return False
    return "chatcompletion_v2" in base_url.lower()


def build_adapter(
    provider: str, api_key: str, base_url: str, model: str, **kw
) -> ProviderAdapter:
    """根据 provider + base_url 构建合适的 Adapter。

    路由规则:
    - minimax + base_url 含 `chatcompletion_v2`  → `MiniMaxAdapter`(老协议 fallback)
    - deepseek / kimi / openai / minimax(其他)    → `OpenAICompatAdapter`
    """
    p = normalize_provider(provider)

    if p == "minimax" and _uses_legacy_minimax_endpoint(base_url):
        return MiniMaxAdapter(api_key=api_key, base_url=base_url, model=model, **kw)

    if p in ("deepseek", "kimi", "openai", "openai_compat", "minimax"):
        # 兜底:某些用户在 base_url 里误填了带 chatcompletion_v2 后缀的地址,
        # 自动剥离后走 OpenAI 兼容路径。
        if p == "minimax" and "chatcompletion_v2" in base_url:
            base_url = base_url.replace("/text/chatcompletion_v2", "")
            base_url = base_url.replace("/chatcompletion_v2", "")
        return OpenAICompatAdapter(api_key=api_key, base_url=base_url, model=model, **kw)

    raise ValueError(f"不支持的 provider: {provider!r} (规范化后={p!r})")


DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com/v1",
    "kimi":     "https://api.moonshot.cn/v1",
    "minimax":  "https://api.minimax.chat/v1",
    "openai":   "https://api.openai.com/v1",
}
