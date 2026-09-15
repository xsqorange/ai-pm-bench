"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ProjectsApi, AgentsApi, PerformanceApi, type Project, type Agent, type PerfReport } from "@/lib/api";
import { Gauge, Play, Trash2 } from "lucide-react";

export default function PerformancePage() {
  const [items, setItems] = useState<PerfReport[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ project_id: 0, agent_id: 0, paths: "" });
  const [running, setRunning] = useState(false);

  const refresh = async () => {
    try { setItems(await PerformanceApi.list()); } catch {}
  };
  useEffect(() => {
    ProjectsApi.list().then(setProjects).catch(() => {});
    AgentsApi.list().then((a) => {
      setAgents(a);
      if (a.length && !form.agent_id) setForm((f) => ({ ...f, agent_id: a[0].id }));
    }).catch(() => {});
    refresh();
  }, []);

  const run = async () => {
    if (!form.project_id || !form.agent_id) { alert("请选择项目和 Agent"); return; }
    setRunning(true);
    try {
      const paths = form.paths.split(",").map((p) => p.trim()).filter(Boolean);
      await PerformanceApi.run({ project_id: form.project_id, agent_id: form.agent_id, paths });
      setForm({ project_id: 0, agent_id: agents[0]?.id ?? 0, paths: "" });
      setCreating(false);
      await refresh();
    } catch (e: any) { alert("分析失败: " + e.message); }
    finally { setRunning(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("删除该分析记录?")) return;
    try { await PerformanceApi.remove(id); await refresh(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Gauge size={22} /> Performance</h1>
            <p className="text-ink-soft mt-1">静态扫描 + LLM 优化建议</p>
          </div>
          <Button onClick={() => setCreating(!creating)}>
            <Play size={16} /> {creating ? "取消" : "发起分析"}
          </Button>
        </div>

        {creating && (
          <Card>
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink-soft">项目</label>
                  <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: parseInt(e.target.value) })}
                          className="h-10 w-full rounded-md border border-line bg px-3 text-sm text-ink">
                    <option value="0">选择项目...</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-ink-soft">Agent</label>
                  <select value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: parseInt(e.target.value) })}
                          className="h-10 w-full rounded-md border border-line bg px-3 text-sm text-ink">
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.provider})</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-ink-soft">分析路径 (逗号分隔)</label>
                <Input value={form.paths} onChange={(e) => setForm({ ...form, paths: e.target.value })} placeholder="src/, app/main.py" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCreating(false)}>取消</Button>
                <Button onClick={run} disabled={running || !form.project_id}>
                  {running ? "分析中..." : "开始分析"}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {items.length === 0 ? (
          <Card><CardBody><p className="text-ink-soft text-sm">暂无分析记录。</p></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {items.map((r) => (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/performance/${r.id}`} className="flex-1 min-w-0 group">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold group-hover:text-brand-soft transition">分析 #{r.id}</span>
                        <Badge>{r.findings.length} 优化建议</Badge>
                        <Badge>{r.static_findings.length} 静态发现</Badge>
                        <span className="text-xs text-ink-dim">scope: {r.scope || "(whole)"}</span>
                      </div>
                      <p className="text-sm text-ink-soft mt-2">{r.summary}</p>
                      <div className="text-xs text-ink-dim mt-1">{r.created_at?.slice(0, 16)} · project #{r.project_id}</div>
                    </Link>
                    <Button size="sm" variant="danger" onClick={() => remove(r.id)}>
                      <Trash2 size={14} />
                    </Button>
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