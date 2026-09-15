"use client";
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { RequirementsApi, ProjectsApi, AgentsApi, type Requirement, type Project, type Agent } from "@/lib/api";
import { ListChecks, Plus, Trash2, Sparkles, ArrowRight, X } from "lucide-react";
import Link from "next/link";

const STATUS_COLOR: Record<string, "ok" | "warn" | "info" | "default"> = {
  todo: "default", doing: "info", done: "ok", blocked: "warn",
};
const PRIORITY_COLOR: Record<string, "error" | "warn" | "info" | "default"> = {
  P0: "error", P1: "warn", P2: "info", P3: "default",
};

export default function RequirementsPage() {
  const [items, setItems] = useState<Requirement[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", priority: "P1", status: "todo",
    project_ids: [] as number[],
  });

  const refresh = async () => {
    try { setItems(await RequirementsApi.list()); } catch {}
  };
  useEffect(() => {
    ProjectsApi.list().then(setProjects).catch(() => {});
    AgentsApi.list().then(setAgents).catch(() => {});
    refresh();
  }, []);

  const create = async () => {
    if (!form.title.trim()) { alert("请填写标题"); return; }
    try {
      await RequirementsApi.create({
        ...form,
        status: form.status as Requirement["status"],
        priority: form.priority as Requirement["priority"],
      });
      setForm({ title: "", description: "", priority: "P1", status: "todo", project_ids: [] });
      setCreating(false);
      await refresh();
    } catch (e: any) { alert("创建失败: " + e.message); }
  };

  const remove = async (id: number) => {
    if (!confirm("确认删除此需求及其子任务?")) return;
    try { await RequirementsApi.remove(id); await refresh(); } catch (e: any) { alert(e.message); }
  };

  const toggleProject = (pid: number) => {
    setForm(f => ({
      ...f,
      project_ids: f.project_ids.includes(pid) ? f.project_ids.filter(x => x !== pid) : [...f.project_ids, pid],
    }));
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><ListChecks size={22} /> Requirements</h1>
            <p className="text-ink-soft mt-1">跨项目需求管理 · 联合方案生成 · 子任务拆解</p>
          </div>
          <Button onClick={() => setCreating(!creating)}><Plus size={16} /> {creating ? "取消" : "新建需求"}</Button>
        </div>

        {creating && (
          <Card>
            <CardHeader><CardTitle>新建需求</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <div>
                <label className="text-xs text-ink-soft">标题</label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例:为 StudioAI 平台增加 SSO" />
              </div>
              <div>
                <label className="text-xs text-ink-soft">描述</label>
                <Textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="详细描述需求背景、目标、约束..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-soft">优先级</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                          className="h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink">
                    <option value="P0">P0 (最高)</option>
                    <option value="P1">P1 (高)</option>
                    <option value="P2">P2 (中)</option>
                    <option value="P3">P3 (低)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-ink-soft">状态</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                          className="h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink">
                    <option value="todo">待办</option>
                    <option value="doing">进行中</option>
                    <option value="blocked">阻塞</option>
                    <option value="done">已完成</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-ink-soft">关联项目 (可多选)</label>
                <div className="mt-1 flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-bg-soft rounded-md border border-line">
                  {projects.map((p) => (
                    <button key={p.id} type="button" onClick={() => toggleProject(p.id)}
                            className={`px-2 py-1 rounded text-xs transition ${
                              form.project_ids.includes(p.id)
                                ? "bg-brand text-white"
                                : "bg-bg-card text-ink-soft hover:bg-line"
                            }`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setCreating(false)}>取消</Button>
                <Button onClick={create}>保存</Button>
              </div>
            </CardBody>
          </Card>
        )}

        {items.length === 0 ? (
          <Card><CardBody><p className="text-ink-soft text-sm">尚未创建需求。</p></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {items.map((r) => (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/requirements/${r.id}`} className="flex-1 min-w-0 group">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold group-hover:text-brand-soft transition">{r.title}</span>
                        <Badge color={PRIORITY_COLOR[r.priority] || "default"}>{r.priority}</Badge>
                        <Badge color={STATUS_COLOR[r.status] || "default"}>{r.status}</Badge>
                        <Badge>{r.subtask_count} 子任务</Badge>
                        {r.solution_doc && <Badge color="ok"><Sparkles size={10} className="inline mr-1" />已生成方案</Badge>}
                      </div>
                      {r.description && <p className="text-sm text-ink-soft mt-2 line-clamp-2">{r.description}</p>}
                      <div className="text-xs text-ink-dim mt-2">
                        {r.project_ids.length} 个关联项目 · 更新于 {r.updated_at?.slice(0, 16)}
                      </div>
                    </Link>
                    <div className="flex items-center gap-2">
                      <Link href={`/requirements/${r.id}`}>
                        <Button size="sm" variant="secondary"><ArrowRight size={14} /></Button>
                      </Link>
                      <Button size="sm" variant="danger" onClick={() => remove(r.id)}><Trash2 size={14} /></Button>
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