"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProjectsApi, AgentsApi, DocumentsApi, type Doc, type DocumentType, type Project, type Agent } from "@/lib/api";
import { FileText, Sparkles, Trash2, Download } from "lucide-react";

const DOC_TYPES: DocumentType[] = ["README", "API", "ARCH", "CHANGELOG", "DEPLOY"];

export default function DocumentsPage() {
  const [items, setItems] = useState<Doc[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState<{ project_id: number; agent_id: number; doc_type: DocumentType }>({
    project_id: 0, agent_id: 0, doc_type: "README",
  });

  const refresh = async () => {
    try { setItems(await DocumentsApi.list()); } catch {}
  };
  useEffect(() => {
    ProjectsApi.list().then((ps) => {
      setProjects(ps);
      if (ps.length && !form.project_id) setForm((f) => ({ ...f, project_id: ps[0].id }));
    }).catch(() => {});
    AgentsApi.list().then((a) => {
      setAgents(a);
      if (a.length && !form.agent_id) setForm((f) => ({ ...f, agent_id: a[0].id }));
    }).catch(() => {});
    refresh();
  }, []);

  const generate = async () => {
    if (!form.project_id || !form.agent_id) { alert("请选择项目和 Agent"); return; }
    setGenerating(true);
    try {
      await DocumentsApi.generate({
        project_id: form.project_id, agent_id: form.agent_id, doc_type: form.doc_type,
      });
      await refresh();
    } catch (e: any) { alert("生成失败: " + e.message); }
    finally { setGenerating(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("删除该文档?")) return;
    try { await DocumentsApi.remove(id); await refresh(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><FileText size={22} /> Documents</h1>

        <Card>
          <CardBody className="space-y-3">
            <div className="text-sm font-medium">AI 生成新文档</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-ink-soft">项目</label>
                <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: parseInt(e.target.value) })}
                        className="h-10 w-full rounded-md border border-line bg px-3 text-sm text-ink">
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-ink-soft">文档类型</label>
                <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value as DocumentType })}
                        className="h-10 w-full rounded-md border border-line bg px-3 text-sm text-ink">
                  {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-ink-soft">Agent</label>
                <select value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: parseInt(e.target.value) })}
                        className="h-10 w-full rounded-md border border-line bg px-3 text-sm text-ink">
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <Button onClick={generate} disabled={generating || !form.project_id || !form.agent_id}>
              <Sparkles size={14} /> {generating ? "生成中..." : "生成"}
            </Button>
          </CardBody>
        </Card>

        {items.length === 0 ? (
          <Card><CardBody><p className="text-ink-soft text-sm">暂无文档。</p></CardBody></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map((d) => (
              <Card key={d.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/documents/${d.id}`} className="flex-1 min-w-0 group">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold group-hover:text-brand-soft transition truncate">{d.title}</span>
                        <Badge>{d.type}</Badge>
                      </div>
                      <div className="text-xs text-ink-dim mt-1">
                        {d.content.length} chars · {d.updated_at?.slice(0, 16)}
                      </div>
                      {d.tags?.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {d.tags.map((t) => <Badge key={t} color="info">{t}</Badge>)}
                        </div>
                      )}
                    </Link>
                    <div className="flex flex-col gap-1">
                      <a href={DocumentsApi.exportUrl(d.id)} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="secondary"><Download size={12} /></Button>
                      </a>
                      <Button size="sm" variant="danger" onClick={() => remove(d.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}