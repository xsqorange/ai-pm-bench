"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function MarkdownView({ content }: { content: string }) {
  return (
    <div className="md text-ink">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const value = String(children).replace(/\n$/, "");
            return !inline && match ? (
              <SyntaxHighlighter
                language={match[1]}
                style={oneDark as any}
                customStyle={{ margin: 0, padding: "0.75rem", fontSize: "0.85rem" }}
              >
                {value}
              </SyntaxHighlighter>
            ) : (
              <code className={className}>{children}</code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}