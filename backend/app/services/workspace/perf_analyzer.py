"""性能分析:静态正则 + AST(Python)+ LLM 解读。"""
from __future__ import annotations
import re
import json
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.performance import PerformanceReport
from app.db.models.project import Project
from app.services.agents.orchestrator import stream_chat
from app.services.workspace.file_ops import WORKSPACE_IGNORE_DIRS
from app.core.security import WORKSPACE_ROOT, safe_resolve, PathSandboxError
from app.core.logger import logger


PERF_PROMPT = """你是资深性能优化专家。基于以下性能报告,对每个 finding 给出:
- 优化的具体代码片段(可直接替换)
- 影响程度评级(high/medium/low)
- 简要理由

报告(JSON):
{report}

输出 JSON 数组(可放在 ```json``` 中),每个元素:
{{
  "file": "<相对路径>",
  "line": <int>,
  "category": "db|algo|memory|concurrency|frontend",
  "title": "...",
  "impact": "high|medium|low",
  "optimization": "优化代码示例"
}}
"""

# 简单静态规则
STATIC_RULES = [
    # 嵌套 for + DB 查询 → 可能 N+1
    (r"for\s+.+\s+in\s+.+\s*:[\s\S]{0,500}?for\s+.+\s+in\s+.+\s*:[\s\S]{0,300}?\.(find|findAll|query|execute|all|filter)\s*\(", "nested_loop_db"),
    # 同步 sleep 在循环内
    (r"for\s+.+\s+in\s+.+\s*:[\s\S]{0,400}?(time\.sleep|Thread\.sleep|\.sleep\()", "loop_with_sleep"),
    # 全表 SELECT *
    (r"SELECT\s+\*\s+FROM", "select_star"),
    # 字符串拼接在循环里(低效)
    (r"for\s+.+\s+in\s+.+\s*:[\s\S]{0,400}?\+=\s*[\"']", "string_concat_in_loop"),
    # 同步阻塞 httpx/requests(应异步)
    (r"requests\.(get|post|put|delete)\(", "sync_http"),
    # 大列表字面量
    (r"\[\s*for\s+.+\s+in\s+range\(\s*\d{4,}\s*\)\s*\]", "big_list_literal"),
    # Java Stream chain 过长(可能性能)
    (r"\.stream\([^)]+\)\.filter\([^)]+\)\.map\([^)]+\)\.collect\(Collectors\.toList\(\)\)", "long_stream_chain"),
    # 同步 ORM session(N+1 风险)
    (r"for\s+\w+\s+in\s+\w+\.query\.all\(\)", "orm_query_in_loop"),
    # 多层 for 嵌套(可能 O(n³+))
    (r"for[^{]*?:\s*for[^{]*?:\s*for[^{]*?:", "triple_nested_loop"),
    # 用 lambda 作为频繁调用参数(开销)
    (r"sorted\([^,]+,\s*key\s*=\s*lambda", "lambda_sort"),
]


def _is_ignored(p: Path) -> bool:
    name = p.name
    return name in WORKSPACE_IGNORE_DIRS or name.startswith(".") or name.endswith(".min.js")


def _run_static(project_path: str, paths: list[str], max_chars: int) -> list[dict]:
    # 经 safe_resolve 校验,允许落在 EXTRA_SCAN_ROOTS 下的项目
    if Path(project_path).is_absolute():
        base = safe_resolve(project_path)
    else:
        base = safe_resolve(WORKSPACE_ROOT / project_path)
    findings: list[dict] = []
    total = 0

    targets: list[Path] = []
    if paths:
        for p in paths:
            cand = (base / p).resolve() if not Path(p).is_absolute() else Path(p).resolve()
            if cand.is_file():
                targets.append(cand)
            elif cand.is_dir():
                for fp in cand.rglob("*"):
                    if fp.is_file() and not _is_ignored(fp):
                        targets.append(fp)
    else:
        for fp in base.rglob("*"):
            if fp.is_file() and not _is_ignored(fp):
                if fp.stat().st_size > 200_000:
                    continue
                targets.append(fp)

    for fp in targets:
        if total > max_chars:
            break
        try:
            rel = fp.relative_to(base)
        except ValueError:
            continue
        try:
            text = fp.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if len(text) > 50_000:
            text = text[:50_000]
        for pattern, rule in STATIC_RULES:
            for m in re.finditer(pattern, text):
                line = text[:m.start()].count("\n") + 1
                snippet = text.splitlines()[line - 1][:140] if line <= len(text.splitlines()) else ""
                findings.append({
                    "rule": rule,
                    "file": str(rel),
                    "line": line,
                    "snippet": snippet,
                    "category": "static",
                })
                if len(findings) >= 200:
                    return findings
        total += len(text)
    return findings


async def run_perf_analysis(
    db: AsyncSession,
    project_id: int,
    agent_id: int,
    paths: list[str],
    max_chars: int = 40_000,
) -> PerformanceReport:
    proj = await db.get(Project, project_id)
    if not proj:
        raise ValueError(f"项目不存在: {project_id}")
    static_findings = _run_static(proj.path, paths, max_chars)

    # 把静态报告喂给 LLM 让它给出优化方案
    user_msg = PERF_PROMPT.format(report=json.dumps(static_findings[:80], ensure_ascii=False, indent=2))
    raw = ""
    async for chunk, _ in stream_chat(
        db, agent_id,
        [{"role": "user", "content": user_msg}],
        temperature=0.3,
    ):
        raw += chunk

    # 解析 LLM 返回的 findings
    llm_findings: list[dict] = []
    m = re.search(r"```json\s*(\[.*?\])\s*```", raw, re.S)
    if not m:
        m = re.search(r"(\[.*\])", raw, re.S)
    if m:
        try:
            items = json.loads(m.group(1))
            for it in items:
                if not isinstance(it, dict):
                    continue
                llm_findings.append({
                    "file": str(it.get("file", "")).strip()[:500],
                    "line": int(it.get("line", 0) or 0),
                    "category": it.get("category", "algo"),
                    "title": str(it.get("title", ""))[:300],
                    "impact": it.get("impact", "medium"),
                    "optimization": str(it.get("optimization", ""))[:3000],
                })
        except json.JSONDecodeError as e:
            logger.warning(f"[perf] JSON parse failed: {e}")

    summary_parts = []
    if static_findings:
        summary_parts.append(f"静态扫描发现 {len(static_findings)} 个可疑模式")
    if llm_findings:
        summary_parts.append(f"AI 给出 {len(llm_findings)} 条优化建议")
    summary = "; ".join(summary_parts) or "未发现问题"

    scope = ",".join(paths) if paths else "(whole project)"
    row = PerformanceReport(
        project_id=project_id,
        agent_id=agent_id,
        scope=scope,
        summary=summary,
        findings=llm_findings,
        static_findings=static_findings,
        raw_text=raw,  # 完整 LLM 输出(JSON 解析失败时也能调试)
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    logger.info(f"[perf] project={proj.name} static={len(static_findings)} llm={len(llm_findings)}")
    return row