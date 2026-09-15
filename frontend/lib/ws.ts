"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// 直接连后端 WS(Next.js rewrite 不支持 ws://),通过后端端口
// 仅开发环境;生产部署可改为同源 proxy
const WS_URL = typeof window !== "undefined"
  ? `ws://127.0.0.1:8000/api/v1/chat/ws`
  : "";

export type ChatEvent =
  | { type: "conversation"; id: number }
  | { type: "delta"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: string }
  | { type: "done"; message_id: number }
  | { type: "error"; message: string };

export type StreamHandlers = {
  onConversation?: (id: number) => void;
  onDelta: (content: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  onDone?: (messageId: number) => void;
  onError?: (message: string) => void;
};

export function useChatSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    return () => { ws.close(); };
  }, []);

  const send = useCallback((msg: object, handlers: StreamHandlers) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      handlers.onError?.("WebSocket 未连接");
      return;
    }
    ws.onmessage = (e) => {
      try {
        const ev: ChatEvent = JSON.parse(e.data);
        if (ev.type === "conversation") handlers.onConversation?.(ev.id);
        else if (ev.type === "delta") handlers.onDelta(ev.content);
        else if (ev.type === "tool_call") handlers.onToolCall?.(ev.name, ev.args);
        else if (ev.type === "tool_result") handlers.onToolResult?.(ev.name, ev.result);
        else if (ev.type === "done") handlers.onDone?.(ev.message_id);
        else if (ev.type === "error") handlers.onError?.(ev.message);
      } catch (err) {
        console.error("WS message parse error", err);
      }
    };
    ws.send(JSON.stringify(msg));
  }, []);

  return { send, connected };
}