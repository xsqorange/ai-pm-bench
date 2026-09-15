"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Input";
import { DocumentsApi, AgentsApi, type Doc, type Agent } from "@/lib/api";
import MarkdownView from "@/components/chat/MarkdownView";
import { ArrowLeft, Save, Sparkles, Download, Loader2, Trash2 } from "lucide-react";

export default function DocDetailPage() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [polishAgent, setPolishAgent] = useState<number | null>(null);
  const [polishing, setPolishing] = useState(false);

  useEffect(() => {
    DocumentsApi.get(docId).then((d) => {
      setDoc(d);
      setDraft(d.content);
      setTitle(d.title);
    }).catch(() => {});
    AgentsApi.list().then((a) => {
      setAgents(a);
      if (a.length) setPolishAgent(a[0].id);
    }).catch(() => {});
  }, [docId]);

  const del = async () => {
    if (!confirm("确定删除该文档?此操作不可恢复。")) return;
    try {
      await DocumentsApi.remove(docId);
      router.push("/documents");
    } catch (e: any) { alert("删除失败: " + e.message); }
  };

  const save = async () => {
    try {
      const updated = await DocumentsApi.update(docId, { title, content: draft });
      setDoc(updated);
      setEditMode(false);
    } catch (e: any) { alert("保存失败: " + e.message); }
  };

  const polish = async () => {
    if (!polishAgent) { alert("请选择 Agent"); return; }
    setPolishing(true);
    try {
      const updated = await DocumentsApi.polish(docId, polishAgent, "");
      setDoc(updated);
      setDraft(updated.content);
    } catch (e: any) { alert("润色失败: " + e.message); }
    finally { setPolishing(false); }
  };

  if (!doc) return <div className="flex-1 p-8 text-ink-soft">加载中...</div>;

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push("/documents")}>
            <ArrowLeft size={14} /> 返回列表
          </Button>
          <Button variant="danger" size="sm" onClick={del}>
            <Trash2 size={14} /> 删除
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              {editMode ? (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-xl font-semibold bg-bg border border-line rounded px-2 py-1 text-ink flex-1"
                />
              ) : (
                <CardTitle>{doc.title}</CardTitle>
              )}
              <div className="flex items-center gap-2">
                <Badge>{doc.type}</Badge>
                {editMode ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditMode(false); setDraft(doc.content); setTitle(doc.title);
                    }}>取消</Button>
                    <Button size="sm" onClick={save}><Save size={14} /> 保存</Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setEditMode(true)}>编辑</Button>
                    <a href={DocumentsApi.exportUrl(doc.id)} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="secondary"><Download size={14} /> 导出</Button>
                    </a>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-sm">AI 润色</CardTitle>
            <div className="flex items-center gap-2">
              <select
                value={polishAgent ?? ""}
                onChange={(e) => setPolishAgent(parseInt(e.target.value) || null)}
                className="h-8 rounded-md border border-line bg-bg px-2 text-xs text-ink"
              >
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <Button size="sm" onClick={polish} disabled={polishing || !polishAgent}>
                {polishing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {polishing ? "润色中..." : "AI 润色"}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardBody className="p-0">
            {editMode ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full h-[600px] font-mono text-xs rounded-none border-0 resize-none"
                spellCheck={false}
              />
            ) : (
              <div className="p-6 max-h-[700px] overflow-y-auto">
                <MarkdownView content={doc.content} />
              </div>
            )}
          </CardBody>
        </Card>

        <div className="text-xs text-ink-dim flex gap-4 flex-wrap">
          <span>创建: {doc.created_at?.slice(0, 16)}</span>
          <span>更新: {doc.updated_at?.slice(0, 16)}</span>
          <span>{doc.content.length} 字符</span>
          {doc.file_path && <span>路径: <code>{doc.file_path}</code></span>}
        </div>
      </div>
    </div>
  );
}