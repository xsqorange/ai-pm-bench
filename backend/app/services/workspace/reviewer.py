"""代码审查服务:切片 + 调用 LLM + 解析结构化 findings + 轨迹收集。

借鉴 DeepSeek Harness 的轨迹设计:每个阶段(扫描 / 切片 / 调 LLM / 解析 / 落库)都 append 一条
`{ts, stage, status, payload}` 事件到 trajectory 列表,落库后前端可展开 timeline 查看。
"""
from __future__ import annotations
import json
import re
import time
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.review import ReviewReport
from app.db.models.project import Project
from app.services.agents.orchestrator import stream_chat
from app.services.workspace.file_ops import read_text_file, WORKSPACE_IGNORE_DIRS
from app.core.security import WORKSPACE_ROOT, safe_resolve, PathSandboxError
from app.core.logger import logger


REVIEW_PROMPT = """你是一名严格的高级工程师,对以下代码做 Code Review。

项目: {project} ({tech})
范围: {scope}

请按下面 JSON 数组输出(可放在 ```json 代码块中)。每条 finding:
{{
  "file": "相对路径",
  "line": <int>,
  "severity": "error|warn|info",
  "category": "bug|security|perf|smell|maintainability",
  "title": "一句话标题",
  "detail": "问题详述",
  "suggestion": "修复建议(可附代码片段)"
}}

重点关注:
{checklist}

如果没问题,输出 []。

代码:
{files}
"""


def _is_ignored(p: Path) -> bool:
    name = p.name
    return (
        name in WORKSPACE_IGNORE_DIRS
        or name.startswith(".")
        or name.endswith((".min.js", ".min.css", ".map", ".lock"))
        or name in ("package-lock.json", "yarn.lock", "pnpm-lock.yaml")
    )


def _collect_files(project_path, paths, max_chars):
    """收集要送审的文件内容,总字符数不超过 max_chars。

    项目根会经过 safe_resolve 校验,确保落在 ALLOWED_ROOTS 内。
    绝对路径形式的 project_path 必须命中允许根。
    """
    if Path(project_path).is_absolute():
        base = safe_resolve(project_path)
    else:
        base = safe_resolve(WORKSPACE_ROOT / project_path)
    chunks = []
    total = 0
    files_collected = []

    targets = []
    if paths:
        for p in paths:
            cand = (base / p).resolve() if not Path(p).is_absolute() else Path(p).resolve()
            try:
                cand.relative_to(base)
                targets.append(cand)
            except ValueError:
                continue
    else:
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            try:
                rel = p.relative_to(base)
            except ValueError:
                continue
            depth = len(rel.parts)
            if depth > 4:
                continue
            if _is_ignored(p):
                continue
            if p.stat().st_size > 200_000:
                continue
            targets.append(p)

    for fp in targets:
        try:
            rel = fp.relative_to(base)
        except ValueError:
            continue
        try:
            text = fp.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        if total + len(text) > max_chars:
            remaining = max_chars - total
            if remaining < 200:
                break
            text = text[:remaining] + "\n... (truncated) ..."
        chunks.append("\n--- " + str(rel) + "---\n" + text + "\n")
        files_collected.append(str(rel))
        total += len(text)
        if total >= max_chars:
            break

    return chunks, len(files_collected)


def _checklist(categories):
    defaults = {
        "bug": "空指针、边界值、类型转换、并发竞争、错误处理",
        "security": "SQL/XSS/命令注入、越权、敏感信息泄露、不安全反序列化",
        "perf": "N+1 查询、O(n²) 算法、大对象、内存泄漏、阻塞调用",
        "smell": "命名、重复代码、过长函数、过大类、循环中创建对象",
        "maintainability": "模块化、注释、测试覆盖、错误处理一致性",
    }
    return "\n".join("- " + c + ": " + defaults.get(c, c) for c in categories if c in defaults) or "- 综合质量"


def _parse_findings(raw):
    """从 LLM 输出提取 JSON findings 数组(多策略级联)。

    返回 (findings, raw_cleaned)。
    优先级:
      1. ```json [...] ``` 代码块(最严格)
      2. 任意 ``` ``` 代码块
      3. 剥离 <think>...</think> 之后再匹配(LLM 经常先思考后输出)
      4. JSONDecoder.raw_decode 容错扫描(从每个 `[` 开始尝试解码)
      5. 都失败 → 返回 [],但保留 raw_cleaned 给用户排查
    """
    raw_cleaned = raw

    # 优先剥离 <think>...</think> 块(LLM 经常先思考,块内有 [...] 示例会误导解析)
    working = re.sub(r"<think>.*?</think>", "", raw, flags=re.S).strip() if raw else ""
    if not working:
        working = raw_cleaned

    def _try_load(text):
        """尝试从 text 中找 JSON 数组并解析,失败返回 None。

        LLM 输出常常省略结尾 ``` ,所以策略 1/2 不要求闭合。
        LLM 输出也常常被截断(超过 max_chars 等),所以策略 4 用补全策略。
        """
        # 策略 1: ```json 开头(不要求闭合),后面跟 [
        m = re.search(r"```json\s*(\[\s*\S[\s\S]*?\])(?:\s*```)?", text, re.S)
        if m:
            arr = _complete_and_parse(m.group(1))
            if arr is not None: return _validate(arr)
        # 策略 2: ``` 开头(不要求 json 标记)
        m = re.search(r"```\s*(\[\s*\S[\s\S]*?\])(?:\s*```)?", text, re.S)
        if m:
            arr = _complete_and_parse(m.group(1))
            if arr is not None: return _validate(arr)
        # 策略 3(早于 4 触发): raw_decode + 补全 容错扫描 — 从每个 [ 开始尝试解码
        decoder = json.JSONDecoder()
        idx = text.find("[")
        while idx >= 0:
            # 先试严格解码
            try:
                obj, _ = decoder.raw_decode(text, idx)
                if isinstance(obj, list):
                    return _validate(obj)
            except json.JSONDecodeError:
                pass
            # 失败:补全后试
            arr = _complete_and_parse(text[idx:])
            if arr is not None: return _validate(arr)
            idx = text.find("[", idx + 1)
        return None

    def _validate(items):
        """校验 + 规范化 findings。只保留含 file/title 字段的项。"""
        out = []
        for it in items:
            if not isinstance(it, dict):
                continue
            # 必须有 file + title 字段才算合法 finding
            if not it.get("file") or not it.get("title"):
                continue
            out.append({
                "file": str(it.get("file", "")).strip()[:500],
                "line": int(it.get("line", 0) or 0),
                "severity": it.get("severity", "info"),
                "category": it.get("category", "smell"),
                "title": str(it.get("title", ""))[:300],
                "detail": str(it.get("detail", ""))[:2000],
                "suggestion": str(it.get("suggestion", ""))[:2000],
            })
        return out

    # 全部策略都基于 working(剥离了 <think> 块)
    found = _try_load(working)
    if found is not None and len(found) > 0:
        return found, raw_cleaned

    # 兜底:直接对 raw 试一次(可能 <think> 没闭合)
    found = _try_load(raw)
    if found is not None and len(found) > 0:
        return found, raw_cleaned

    logger.warning("[reviewer] 所有 JSON 解析策略失败 — 详见 raw_llm")
    return [], raw_cleaned


def _complete_and_parse(text):
    """把可能未闭合的 JSON 字符串补全后解析。失败返回 None。

    用于处理 LLM 输出被 max_chars 截断、缺少结尾 ``` 或末尾字段未闭合的情况。
    text 可以以 ```json ``` ``` 或 [ 等任何前缀开头。
    """
    if not text:
        return None
    # 剥离可能的 ```json / ``` 前缀(从第一个 [ 开始算)
    bracket_start = text.find("[")
    if bracket_start < 0:
        return None
    arr_text = text[bracket_start:]

    in_string = False
    escape = False
    brace_depth = 0
    bracket_depth = 0
    for ch in arr_text:
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == chr(34):
            in_string = not in_string
            continue
        if not in_string:
            if ch == "{": brace_depth += 1
            elif ch == "}": brace_depth -= 1
            elif ch == "[": bracket_depth += 1
            elif ch == "]": bracket_depth -= 1
    # 补全顺序:如果当前在字符串内,先关字符串;然后关结构
    completed = arr_text
    if in_string:
        completed += chr(34)
    if brace_depth > 0:
        completed += "}" * brace_depth
    if bracket_depth > 0:
        completed += "]" * bracket_depth
    try:
        obj = json.loads(completed)
        return obj if isinstance(obj, list) else None
    except json.JSONDecodeError:
        return None


def _summarize(findings):
    by_sev = {"error": 0, "warn": 0, "info": 0}
    for f in findings:
        sev = f.get("severity", "info")
        by_sev[sev] = by_sev.get(sev, 0) + 1
    severity = "info"
    if by_sev["error"] > 0:
        severity = "error"
    elif by_sev["warn"] > 0:
        severity = "warn"
    summary = (
        str(len(findings)) + " 个发现 (error=" + str(by_sev["error"]) +
        " warn=" + str(by_sev["warn"]) + " info=" + str(by_sev["info"]) + ")"
    )
    return summary, severity


class TrajectoryRecorder:
    """轻量级轨迹收集器。每条事件:`{ts, stage, status, payload, duration_ms?}`

    stage 取值:`init / slice / prompt / llm / parse / summarize / saved`
    status 取值:`start / ok / error`

    可选传入 asyncio.Queue — emit 时同步 put_nowait,用于 SSE 实时推送。
    """
    def __init__(self, queue=None):
        self.events = []
        self._t0 = time.monotonic()
        self._queue = queue  # type: asyncio.Queue | None

    def emit(self, stage, status, payload=None):
        now = time.monotonic() - self._t0
        event = {
            "ts": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
            "elapsed_ms": int(now * 1000),
            "stage": stage,
            "status": status,
            "payload": payload or {},
        }
        self.events.append(event)
        # 实时推送给订阅者(仅当 queue 提供;run_review 自身仍在 async loop 内)
        if self._queue is not None:
            try:
                self._queue.put_nowait(event)
            except Exception:
                pass  # 队列满或已关闭,忽略 — 不影响主流程

    def dump(self):
        return self.events


async def run_review(db, project_id, agent_id, paths, max_chars=60_000, categories=None, trajectory_queue=None):
    """对项目运行代码审查并落库(含 trajectory)。

    trajectory_queue: 可选 asyncio.Queue,每个阶段 emit 后立即 put_nowait,
    用于 SSE 流式推送给前端实时显示。
    """
    traj = TrajectoryRecorder(queue=trajectory_queue)
    traj.emit("init", "start", {"project_id": project_id, "agent_id": agent_id, "paths": paths})

    proj = await db.get(Project, project_id)
    if not proj:
        traj.emit("init", "error", {"reason": "项目不存在"})
        raise ValueError("项目不存在: " + str(project_id))
    traj.emit("init", "ok", {"project": proj.name, "path": proj.path, "tech_stack": proj.tech_stack})

    cats = categories or ["bug", "security", "perf", "smell", "maintainability"]

    # 切片阶段
    traj.emit("slice", "start", {"max_chars": max_chars, "categories": cats})
    try:
        chunks, file_count = _collect_files(proj.path, paths, max_chars)
    except PathSandboxError as e:
        traj.emit("slice", "error", {"reason": str(e)})
        raise
    if not chunks:
        traj.emit("slice", "error", {"reason": "未找到可审查的文件"})
        raise ValueError("未找到可审查的文件")
    files_blob = "".join(chunks)[:max_chars]
    traj.emit("slice", "ok", {
        "files_collected": file_count,
        "total_chars": len(files_blob),
        "truncated": len("".join(chunks)) > max_chars,
    })

    # prompt 构造
    scope = ",".join(paths) if paths else "(whole project)"
    user_msg = REVIEW_PROMPT.format(
        project=proj.name,
        tech=", ".join(proj.tech_stack or []),
        scope=scope,
        checklist=_checklist(cats),
        files=files_blob,
    )
    traj.emit("prompt", "ok", {"prompt_chars": len(user_msg), "checklist_items": len(cats)})

    # LLM 调用
    traj.emit("llm", "start", {"agent_id": agent_id, "files_count": file_count})
    raw = ""
    t_llm = time.monotonic()
    try:
        async for chunk, agent in stream_chat(
            db, agent_id,
            [{"role": "user", "content": user_msg}],
            temperature=0.2,
        ):
            raw += chunk
        llm_ms = int((time.monotonic() - t_llm) * 1000)
        traj.emit("llm", "ok", {
            "agent": agent.name,
            "model": agent.model,
            "response_chars": len(raw),
            "duration_ms": llm_ms,
        })
    except Exception as e:
        traj.emit("llm", "error", {"reason": str(e)})
        raise

    # 解析阶段
    traj.emit("parse", "start", {"raw_chars": len(raw)})
    findings, raw_cleaned = _parse_findings(raw)
    parse_failed = bool(raw) and not findings
    parse_status = "error" if parse_failed else "ok"
    parse_hint = "JSON 未解析到 — 详情见 raw_llm" if parse_failed else None
    traj.emit("parse", parse_status, {
        "findings_extracted": len(findings),
        "parse_failed": parse_failed,
        "hint": parse_hint,
    })

    # 汇总阶段
    summary, severity = _summarize(findings)
    by_sev = {k: sum(1 for f in findings if f.get("severity") == k) for k in ("error", "warn", "info")}
    rules = {
        "categories": cats,
        "files_reviewed": file_count,
        "max_chars": max_chars,
        "model_temperature": 0.2,
    }
    traj.emit("summarize", "ok", {"severity": severity, "summary": summary, "by_sev": by_sev})

    row = ReviewReport(
        project_id=project_id,
        agent_id=agent_id,
        scope=scope,
        summary=summary,
        severity=severity,
        findings=findings,
        rules=rules,
        raw_text=raw_cleaned or raw,
        trajectory=traj.dump(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    traj.emit("saved", "ok", {"review_id": row.id})
    # 把 saved 事件补到 row.trajectory(再 commit 一次)
    row.trajectory = traj.dump()
    await db.commit()

    logger.info("[reviewer] project=" + proj.name + " files=" + str(file_count) +
        " findings=" + str(len(findings)) + " severity=" + severity +
        " trajectory_events=" + str(len(traj.dump())))
    return row
