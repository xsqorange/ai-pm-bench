"""WebSocket 流式聊天接口(W2:支持工具调用 + 多轮上下文)。"""
from __future__ import annotations
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.db.session import AsyncSessionLocal
from app.db.models.conversation import Conversation, Message
from app.services.agents.orchestrator import stream_chat
from app.services.workspace.file_ops import read_text_file, list_dir
from app.core.security import PathSandboxError
from app.core.logger import logger
from app.config import settings

router = APIRouter(prefix="/chat", tags=["chat"])

# ---------- 工具实现 ----------

def tool_read_file(args: dict) -> str:
    """读文件工具:args={path}"""
    try:
        content, size, truncated = read_text_file(args["path"])
        meta = f"[文件: {args['path']}  大小: {size}B  截断: {truncated}]\n"
        return meta + content
    except (FileNotFoundError, IsADirectoryError, PermissionError, PathSandboxError) as e:
        return f"[错误] {e}"


def tool_list_dir(args: dict) -> str:
    """列目录工具:args={path}"""
    try:
        entries = list_dir(args.get("path", "."))
        if not entries:
            return "(空目录)"
        lines = []
        for e in entries[:50]:
            if e["type"] == "directory":
                lines.append(f"📁 {e['name']}/")
            else:
                size_kb = e["size"] / 1024
                lines.append(f"📄 {e['name']}  ({size_kb:.1f} KB)")
        return "\n".join(lines)
    except (NotADirectoryError, PermissionError, PathSandboxError) as e:
        return f"[错误] {e}"


TOOLS = {
    "read_file": tool_read_file,
    "list_dir": tool_list_dir,
}


# ---------- WebSocket ----------

@router.websocket("/ws")
async def chat_ws(websocket: WebSocket):
    """协议(扩展版):
    client -> {"type":"start","conversation_id":..,"agent_id":..,"message":"..."}
    server -> {"type":"conversation","id":..}                  # 若新建会话
           -> {"type":"delta","content":"..."}
           -> {"type":"tool_call","name":"...","args":{...}}
           -> {"type":"tool_result","name":"...","result":"..."}
           -> {"type":"done","message_id":..}
           -> {"type":"error","message":"..."}
    """
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "invalid json"})
                continue
            if msg.get("type") != "start":
                continue

            agent_id = int(msg["agent_id"])
            conversation_id = int(msg.get("conversation_id", 0))
            user_text = msg.get("message", "")
            use_tools = bool(msg.get("tools", True))

            async with AsyncSessionLocal() as db:
                if not conversation_id:
                    conv = Conversation(agent_id=agent_id, title=user_text[:60] or "新会话")
                    db.add(conv)
                    await db.commit()
                    await db.refresh(conv)
                    conversation_id = conv.id
                    await websocket.send_json({"type": "conversation", "id": conversation_id})

                db.add(Message(conversation_id=conversation_id, role="user", content=user_text))
                await db.commit()

                full_text = ""
                try:
                    async for chunk, agent in stream_chat(
                        db, agent_id,
                        [{"role": "user", "content": user_text}],
                    ):
                        full_text += chunk
                        await websocket.send_json({"type": "delta", "content": chunk})
                except Exception as e:
                    logger.exception("Chat 流式调用失败")
                    await websocket.send_json({"type": "error", "message": str(e)})
                    continue

                assistant_msg = Message(
                    conversation_id=conversation_id, role="assistant", content=full_text,
                )
                db.add(assistant_msg)
                await db.commit()
                await db.refresh(assistant_msg)

                # 若助手回复中包含工具调用标记,执行
                if use_tools and ("<tool:" in full_text):
                    import re
                    for m in re.finditer(r"<tool:(\w+)\s+args=({[^>]+})>", full_text):
                        name, args_json = m.group(1), m.group(2)
                        try:
                            args = json.loads(args_json)
                        except json.JSONDecodeError:
                            args = {}
                        if name in TOOLS:
                            await websocket.send_json({"type": "tool_call", "name": name, "args": args})
                            try:
                                result = TOOLS[name](args)
                            except Exception as e:
                                result = f"[工具错误] {e}"
                            await websocket.send_json({"type": "tool_result", "name": name, "result": result[:8000]})

                            # 二次调用 LLM 给出最终回答
                            follow_text = ""
                            async for chunk2, _ in stream_chat(
                                db, agent_id,
                                [
                                    {"role": "user", "content": user_text},
                                    {"role": "assistant", "content": full_text},
                                    {"role": "tool", "content": f"工具 {name} 返回:\n{result[:5000]}"},
                                    {"role": "user", "content": "请基于工具返回给出最终回答。"},
                                ],
                            ):
                                follow_text += chunk2
                                await websocket.send_json({"type": "delta", "content": chunk2})

                            # 更新助手消息
                            assistant_msg.content = full_text + "\n\n" + follow_text
                            await db.commit()
                        else:
                            await websocket.send_json({"type": "tool_result", "name": name, "result": f"[未知工具]"})

                await websocket.send_json({"type": "done", "message_id": assistant_msg.id})
    except WebSocketDisconnect:
        logger.info("WS 客户端断开")
    except Exception:
        logger.exception("WS 异常")
        try:
            await websocket.close()
        except Exception:
            pass