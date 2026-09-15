"use client";
import { useEffect, useRef, useState } from "react";
import MessageBubble, { type ChatMessage } from "./MessageBubble";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useChatSocket } from "@/lib/ws";
import { ConversationsApi, type Message as ApiMessage } from "@/lib/api";
import { Send, Square, Loader2 } from "lucide-react";

type ToolCall = { name: string; args?: Record<string, unknown>; result?: string };

function apiMsgToChat(m: ApiMessage): ChatMessage {
  return {
    id: m.id,
    role: m.role as ChatMessage["role"],
    content: m.content,
    tools: [],
  };
}

export default function ChatWindow({
  conversationId,
  agentId,
  onConversationCreated,
}: {
  conversationId: number;
  agentId: number;
  onConversationCreated?: (id: number) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { send, connected } = useChatSocket();

  // Load history when conversationId changes
  useEffect(() => {
    let cancelled = false;
    if (!conversationId || conversationId <= 0) {
      setMessages([]);
      setError(null);
      return;
    }
    setHistoryLoading(true);
    setError(null);
    (async () => {
      try {
        const conv = await ConversationsApi.get(conversationId);
        if (cancelled) return;
        // Filter out empty messages, sort by id
        const msgs = (conv.messages || [])
          .filter((m) => m.content && m.content.length > 0)
          .map(apiMsgToChat);
        setMessages(msgs);
      } catch (e: any) {
        if (!cancelled) setError(`加载历史失败: ${e.message}`);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId]);

  // Auto-scroll on message changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || streaming || !connected) return;
    setInput("");
    setError(null);

    const userMsg: ChatMessage = { role: "user", content: text };
    const assistantId = `tmp-${Date.now()}` as unknown as number;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
      tools: [],
    };
    setMessages((m) => [...m, userMsg, assistantMsg]);
    setStreaming(true);

    send(
      { type: "start", conversation_id: conversationId || 0, agent_id: agentId, message: text },
      {
        onConversation: (id) => {
          onConversationCreated?.(id);
        },
        onDelta: (content) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, content: msg.content + content } : msg,
            ),
          );
        },
        onToolCall: (name, args) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, tools: [...(msg.tools || []), { name, args }] }
                : msg,
            ),
          );
        },
        onToolResult: (name, result) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? {
                    ...msg,
                    tools: (msg.tools || []).map((t) =>
                      t.name === name && !t.result ? { ...t, result } : t,
                    ),
                  }
                : msg,
            ),
          );
        },
        onDone: () => {
          setStreaming(false);
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, streaming: false } : msg,
            ),
          );
        },
        onError: (msg) => {
          setStreaming(false);
          setError(msg);
          setMessages((m) => m.filter((x) => x.id !== assistantId));
        },
      },
    );
  };

  return (
    // h-full + min-h-0:确保 flex 子容器能正确撑满父级 <main min-h-screen>
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <div className="px-4 py-2 border-b border-line text-xs text-ink-dim flex items-center gap-3 shrink-0">
        <span>
          WS: {connected ? <span className="text-emerald-300">● 已连接</span> : <span className="text-red-300">○ 未连接</span>}
        </span>
        <span>·</span>
        <span>Agent ID: {agentId}</span>
        {conversationId > 0 && (
          <>
            <span>·</span>
            <span>Conv: #{conversationId}</span>
            <span>·</span>
            <span className="text-brand-soft">{messages.length} 条历史消息</span>
          </>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-1 min-h-0">
        {historyLoading ? (
          <div className="flex items-center justify-center text-ink-dim py-12 gap-2">
            <Loader2 size={16} className="animate-spin" />
            加载历史会话中...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-ink-dim py-12">
            <p>
              {conversationId > 0 ? "该会话暂无消息" : "开始对话吧。"}
            </p>
            {conversationId === 0 && (
              <p className="text-xs mt-2">
                <code className="px-2 py-1 bg-bg-card rounded">从左侧选择历史会话 或 发送新消息</code>
              </p>
            )}
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={(m.id as any) ?? i} msg={m} />)
        )}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            错误: {error}
          </div>
        )}
      </div>
      {/* shrink-0 + sticky bottom:输入框固定在底部,即使消息列表很长也不会被滚动盖住 */}
      <div className="shrink-0 sticky bottom-0 border-t border-line px-4 py-3 bg-bg-soft z-10">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="输入消息,Shift+Enter 换行,Enter 发送"
            rows={3}
            disabled={!connected || streaming || historyLoading}
          />
          <Button onClick={sendMessage} disabled={!connected || streaming || !input.trim() || historyLoading}>
            {streaming ? <Square size={16} /> : <Send size={16} />}
            {streaming ? "生成中" : "发送"}
          </Button>
        </div>
      </div>
    </div>
  );
}