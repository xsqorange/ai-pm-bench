"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import ChatWindow from "@/components/chat/ChatWindow";
import { AgentsApi, ConversationsApi, type Agent, type Conversation } from "@/lib/api";
import { MessageSquare, Plus, Trash2, Download } from "lucide-react";

function formatRelative(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return d.toISOString().slice(0, 10);
}

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<number | null>(null);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const ags = await AgentsApi.list();
      setAgents(ags);
      if (ags.length && !activeAgentId) setActiveAgentId(ags[0].id);
    } catch {}
    try {
      const convs = await ConversationsApi.list();
      setConversations(convs);
      // 不自动选第一个会话,留给用户主动选;如果没有 active 且是新对话(0),保持 0
    } catch {}
  };
  useEffect(() => { refresh(); }, []);

  const newChat = () => setActiveConvId(0);

  const removeConv = async (id: number) => {
    if (!confirm("删除该会话(包括所有消息)?")) return;
    try {
      await ConversationsApi.remove(id);
      if (activeConvId === id) setActiveConvId(null);
      await refresh();
    } catch (e: any) { alert(e.message); }
  };

  const exportConv = (id: number) => {
    // 直接打开浏览器下载,后端 PlainTextResponse
    window.open(ConversationsApi.exportUrl(id), "_blank");
  };

  const selectConv = (c: Conversation) => {
    setActiveConvId(c.id);
    // 自动切到该会话当时用的 agent(若存在且启用)
    if (c.agent_id) {
      const ag = agents.find((a) => a.id === c.agent_id);
      if (ag && ag.enabled) setActiveAgentId(c.agent_id);
    }
  };

  return (
    <div className="flex-1 flex min-h-0 h-full">
      {/* Left: conversation + agent list */}
      <div className="w-80 shrink-0 border-r border-line bg-bg-soft flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-line">
          <Button className="w-full" onClick={newChat}>
            <Plus size={14} /> 新对话
          </Button>
        </div>
        <div className="px-4 py-2 border-b border-line">
          <div className="text-xs text-ink-soft mb-1">Agent (新对话使用)</div>
          <select
            value={activeAgentId ?? ""}
            onChange={(e) => setActiveAgentId(parseInt(e.target.value) || null)}
            className="h-9 w-full rounded-md border border-line bg-bg px-2 text-sm text-ink"
          >
            <option value="" disabled>选择 Agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.enabled}>
                {a.name} ({a.provider}){!a.enabled && " - 禁用"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 text-xs text-ink-soft flex items-center justify-between sticky top-0 bg-bg-soft/95 backdrop-blur z-10">
            <span>历史会话 ({conversations.length})</span>
          </div>
          {conversations.length === 0 ? (
            <p className="text-xs text-ink-dim text-center py-4">尚无历史会话</p>
          ) : (
            <div>
              {conversations.map((c) => {
                const isActive = activeConvId === c.id;
                const ag = agents.find((a) => a.id === c.agent_id);
                return (
                  <div
                    key={c.id}
                    onClick={() => selectConv(c)}
                    className={`px-4 py-2.5 cursor-pointer border-l-2 transition group ${
                      isActive
                        ? "border-brand bg-bg-card"
                        : "border-transparent hover:bg-bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare size={12} className="text-ink-dim shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm truncate flex-1 font-medium">
                            {c.title || "(无标题)"}
                          </span>
                          <Badge>{c.message_count}</Badge>
                        </div>
                        <div className="flex items-center justify-between mt-1 gap-2">
                          <span className="text-[10px] text-ink-dim truncate flex-1">
                            {ag ? ag.name : `agent#${c.agent_id}`} · {formatRelative(c.updated_at)}
                          </span>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={(e) => { e.stopPropagation(); exportConv(c.id); }}
                              title="导出 Markdown"
                              className="p-1 hover:bg-bg-soft rounded text-ink-dim hover:text-ink"
                            >
                              <Download size={11} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeConv(c.id); }}
                              title="删除"
                              className="p-1 hover:bg-bg-soft rounded text-ink-dim hover:text-red-400"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: chat window */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeAgentId ? (
          <ChatWindow
            conversationId={activeConvId ?? 0}
            agentId={activeAgentId}
            onConversationCreated={(id) => {
              setActiveConvId(id);
              refresh();
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-ink-dim">
            请先在 <a href="/agents" className="text-brand-soft hover:underline mx-1">Agents</a> 配置至少一个 Agent。
          </div>
        )}
      </div>
    </div>
  );
}