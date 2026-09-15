"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ProjectsApi, AgentsApi, ReviewsApi, type Project, type Agent, type Review, type ReviewTrajectoryEvent } from "@/lib/api";
import { ShieldAlert, Play, Trash2, Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const SEV_COLOR: Record<string, "error" | "warn" | "info" | "default"> = {
  error: "error", warn: "warn", info: "info",
};

const STAGE_LABEL: Record<string, string> = {
  init: "初始化",
  slice: "切片收集",
  prompt: "构造 prompt",
  llm: "调用 LLM",
  parse: "解析 findings",
  summarize: "汇总",
  saved: "落库",
};

const STAGE_COLOR: Record<string, string> = {
  init: "text-blue-400",
  slice: "text-cyan-400",
  prompt: "text-purple-400",
  llm: "text-amber-400",
  parse: "text-pink-400",
  summarize: "text-emerald-400",
  saved: "text-green-400",
};

export default function ReviewsPage() {
  const [items, setItems] = useState<Review[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ project_id: 0, agent_id: 0, paths: "" });
  const [running, setRunning] = useState(false);
  const [liveEvents, setLiveEvents] = useState<ReviewTrajectoryEvent[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveDone, setLiveDone] = useState<{ review_id: number | null; ok: boolean } | null>(null);

  const refresh = async () => {
    try { setItems(await ReviewsApi.list()); } catch {}
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
    setLiveEvents([]);
    setLiveError(null);
    setLiveDone(null);
    const paths = form.paths.split(",").map((p) => p.trim()).filter(Boolean);
    await ReviewsApi.runStream(
      { project_id: form.project_id, agent_id: form.agent_id, paths },
      {
        onStart: () => setLiveEvents([]),
        onTrajectory: (ev) => setLiveEvents((prev) => [...prev, ev]),
        onDone: (info) => {
          setLiveDone(info);
          setRunning(false);
          // 完成后:关表单 + 刷新列表(短暂延迟,让用户看 done 事件)
          setTimeout(() => {
            setCreating(false);
            setLiveEvents([]);
            setLiveDone(null);
            setForm({ project_id: 0, agent_id: agents[0]?.id ?? 0, paths: "" });
            refresh();
          }, 1500);
        },
        onError: (info) => {
          setLiveError(info.reason);
          setRunning(false);
        },
      },
    );
  };

  const remove = async (id: number) => {
    if (!confirm("删除该审查记录?")) return;
    try { await ReviewsApi.remove(id); await refresh(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><ShieldAlert size={22} /> Code Reviews</h1>
            <p className="text-ink-soft mt-1">基于 AI 的代码审查: bug / security / perf / smell / maintainability</p>
          </div>
          <Button onClick={() => setCreating(!creating)}>
            <Play size={16} /> {creating ? "取消" : "发起审查"}
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
                <label className="text-xs text-ink-soft">审查路径 (逗号分隔,留空=整个项目)</label>
                <Input value={form.paths} onChange={(e) => setForm({ ...form, paths: e.target.value })} placeholder="src/, app/main.py" />
              </div>
              <p className="text-xs text-ink-dim">审查可能耗时 1-3 分钟,大项目会切片分批送审。</p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCreating(false)}>取消</Button>
                <Button onClick={run} disabled={running || !form.project_id}>
                  {running ? "审查中..." : "开始审查"}
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* 实时审查轨迹(running / done / error 时显示) */}
        {(running || liveEvents.length > 0 || liveError || liveDone) && (
          <Card>
            <CardBody>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="flex items-center gap-2 font-semibold">
                  {running ? (
                    <Loader2 size={16} className="animate-spin text-amber-400" />
                  ) : liveError ? (
                    <XCircle size={16} className="text-red-400" />
                  ) : (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  )}
                  <Activity size={14} className="text-ink-soft" />
                  <span>实时审查轨迹</span>
                  <Badge>{liveEvents.length} 事件</Badge>
                  {liveDone && liveDone.review_id && !running && (
                    <Link href={`/reviews/${liveDone.review_id}`} className="text-brand-soft hover:underline text-xs">
                      → 查看审查 #{liveDone.review_id}
                    </Link>
                  )}
                </div>
              </div>

              {liveError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 mb-3">
                  {liveError}
                </div>
              )}

              <ol className="relative border-l border-line ml-2 space-y-2 max-h-96 overflow-y-auto">
                {liveEvents.map((e, i) => (
                  <li key={i} className="ml-4">
                    <div className="absolute -left-1.5 mt-1 w-3 h-3 rounded-full bg-bg-card border border-line flex items-center justify-center">
                      {e.status === "error" ? (
                        <XCircle size={10} className="text-red-400" />
                      ) : e.status === "ok" ? (
                        <CheckCircle2 size={10} className="text-emerald-400" />
                      ) : (
                        <Loader2 size={10} className="text-amber-400 animate-spin" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className={`font-semibold ${STAGE_COLOR[e.stage] || "text-ink-soft"}`}>
                        {STAGE_LABEL[e.stage] || e.stage}
                      </span>
                      <Badge color={e.status === "error" ? "error" : e.status === "ok" ? "ok" : "warn"}>
                        {e.status}
                      </Badge>
                      <span className="text-xs text-ink-dim">+{e.elapsed_ms}ms</span>
                    </div>
                    {e.payload && Object.keys(e.payload).length > 0 && (
                      <pre className="text-xs text-ink-soft bg-bg-soft rounded p-2 mt-1 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        )}

        {items.length === 0 ? (
          <Card><CardBody><p className="text-ink-soft text-sm">暂无审查记录。点击右上角"发起审查"开始第一次代码审查。</p></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {items.map((r) => (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <Link href={`/reviews/${r.id}`} className="flex-1 min-w-0 group">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold group-hover:text-brand-soft transition">审查 #{r.id}</span>
                        <Badge color={SEV_COLOR[r.severity] || "default"}>{r.severity}</Badge>
                        <Badge>{r.findings.length} findings</Badge>
                        <span className="text-xs text-ink-dim">scope: {r.scope || "(whole)"}</span>
                      </div>
                      <p className="text-sm text-ink-soft mt-2">{r.summary}</p>
                      <div className="text-xs text-ink-dim mt-1">{r.created_at?.slice(0, 16)} · agent #{r.agent_id} · project #{r.project_id}</div>
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