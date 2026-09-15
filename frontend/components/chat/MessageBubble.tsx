"use client";
import { useState } from "react";
import { Bot, User, Wrench, ChevronDown, ChevronUp } from "lucide-react";
import MarkdownView from "./MarkdownView";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id?: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  streaming?: boolean;
  tools?: { name: string; args?: Record<string, unknown>; result?: string }[];
};

// 折叠阈值:行数 / 字符数任一超过就默认折叠
const COLLAPSE_LINES = 8;
const COLLAPSE_CHARS = 500;
const TOOL_RESULT_PREVIEW_CHARS = 240;

function shouldCollapse(content: string): boolean {
  const lines = content.split("\n").length;
  return lines > COLLAPSE_LINES || content.length > COLLAPSE_CHARS;
}

export default function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";
  // 默认折叠条件:长内容 且 不是 streaming
  const [expanded, setExpanded] = useState(false);
  const collapsible =
    !!msg.content &&
    !msg.streaming &&
    !isUser &&
    !isTool &&
    shouldCollapse(msg.content);

  return (
    <div className={cn("flex gap-3 py-3", isUser ? "flex-row-reverse" : "")}>
      <div className={cn(
        "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center",
        isUser ? "bg-brand/20 text-brand-soft" : isTool ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/15 text-emerald-300",
      )}>
        {isUser ? <User size={16} /> : isTool ? <Wrench size={16} /> : <Bot size={16} />}
      </div>
      <div className={cn("flex-1 min-w-0 max-w-3xl", isUser ? "flex justify-end" : "")}>
        {msg.content && (
          <div className={cn(
            "rounded-xl px-4 py-3 border",
            isUser ? "bg-brand/10 border-brand/30" : "bg-bg-card border-line",
          )}>
            {collapsible && !expanded ? (
              // 折叠态:显示前 COLLAPSE_LINES 行 + 提示
              <CollapsedPreview content={msg.content} onExpand={() => setExpanded(true)} />
            ) : (
              <>
                <MarkdownView content={msg.content} />
                {msg.streaming && <span className="inline-block w-2 h-4 bg-brand ml-1 animate-pulse" />}
              </>
            )}

            {/* 折叠/展开 切换按钮(底部) */}
            {collapsible && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 text-xs text-brand-soft hover:underline flex items-center gap-1"
              >
                {expanded ? (
                  <>
                    <ChevronUp size={12} /> 收起
                  </>
                ) : (
                  <>
                    <ChevronDown size={12} /> 展开完整回复
                  </>
                )}
              </button>
            )}
          </div>
        )}
        {msg.tools && msg.tools.length > 0 && (
          <div className="mt-2 space-y-2">
            {msg.tools.map((t, i) => (
              <ToolCallBlock key={i} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 折叠预览:取前 N 行 + "..." 提示
function CollapsedPreview({ content, onExpand }: { content: string; onExpand: () => void }) {
  const preview = content.split("\n").slice(0, COLLAPSE_LINES).join("\n");
  return (
    <div className="relative">
      <MarkdownView content={preview + "\n\n…"} />
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-bg-card to-transparent pointer-events-none" />
    </div>
  );
}

// 工具调用块 — result 默认折叠(经常很长)
function ToolCallBlock({ t }: { t: { name: string; args?: Record<string, unknown>; result?: string } }) {
  const [open, setOpen] = useState(false);
  const hasResult = !!t.result;
  const resultPreview = hasResult && t.result!.length > TOOL_RESULT_PREVIEW_CHARS && !open
    ? t.result!.slice(0, TOOL_RESULT_PREVIEW_CHARS) + "…"
    : t.result;
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 text-amber-300 font-medium">
        <Wrench size={12} /> 工具: {t.name}
        {t.args && <span className="text-ink-dim">({JSON.stringify(t.args).slice(0, 80)})</span>}
      </div>
      {hasResult && (
        <>
          <pre className={cn(
            "mt-1 text-ink-soft whitespace-pre-wrap break-words",
            open ? "max-h-96 overflow-y-auto" : "max-h-32 overflow-hidden"
          )}>
            {resultPreview}
          </pre>
          {t.result!.length > TOOL_RESULT_PREVIEW_CHARS && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-1 text-amber-300 hover:underline flex items-center gap-1"
            >
              {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {open ? "收起" : `展开(${t.result!.length} 字符)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
