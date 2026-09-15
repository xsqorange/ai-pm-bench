"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import MarkdownView from "@/components/chat/MarkdownView";
import { RequirementsApi, ProjectsApi, AgentsApi, type Requirement, type Subtask, type Project, type Agent } from "@/lib/api";
import { ArrowLeft, Sparkles, ListTodo, Plus, Trash2, RefreshCw } from "lucide-react";

export default function RequirementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const reqId = Number(id);
  const router = useRouter();
  const [req, setReq] = useState<Requirement | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [generating, setGenerating] = useState(false);
  const [decomposing, setDecomposing] = useState(false);

  const refresh = async () => {
    try { setReq(await RequirementsApi.get(reqId)); } catch {}
    try { setSubtasks(await RequirementsApi.listSubtasks(reqId)); } catch {}
  };
  useEffect(() => {
    ProjectsApi.list().then(setProjects).catch(() => {});
    AgentsApi.list().then(setAgents).catch(() => {});
    refresh();
  }, [reqId]);

  const del = async () => {
    if (!confirm("确定删除该需求及其所有子任务?此操作不可恢复。")) return;
    try {
      await RequirementsApi.remove(reqId);
      router.push("/requirements");
    } catch (e: any) { alert("删除失败: " + e.message); }
  };

  const generateSolution = async (agentId: number) => {
    setGenerating(true);
    try {
      const r = await RequirementsApi.generateSolution(reqId, agentId);
      setReq((prev) => prev ? { ...prev, solution_doc: r.solution_doc } : prev);
    } catch (e: any) { alert("生成失败: " + e.message); }
    finally { setGenerating(false); }
  };

  const decompose = async (agentId: number) => {
    const count = Number(prompt("拆几个子任务?(1-20)", "5") || "5");
    if (count < 1 || count > 20) return;
    setDecomposing(true);
    try {
      await RequirementsApi.decompose(reqId, agentId, count);
      await refresh();
    } catch (e: any) { alert("拆解失败: " + e.message); }
    finally { setDecomposing(false); }
  };

  const updateStatus = async (subId: number, status: Subtask["status"]) => {
    try {
      await RequirementsApi.updateSubtask(reqId, subId, { status });
      await refresh();
    } catch (e: any) { alert(e.message); }
  };

  const removeSub = async (subId: number) => {
    if (!confirm("删除子任务?")) return;
    try { await RequirementsApi.deleteSubtask(reqId, subId); await refresh(); } catch (e: any) { alert(e.message); }
  };

  if (!req) {
    return <div className="flex-1 p-8 text-ink-soft">加载中...</div>;
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push("/requirements")}>
            <ArrowLeft size={14} /> 返回列表
          </Button>
          <Button variant="danger" size="sm" onClick={del}>
            <Trash2 size={14} /> 删除
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl">{req.title}</CardTitle>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge color={req.priority === "P0" ? "error" : req.priority === "P1" ? "warn" : "info"}>{req.priority}</Badge>
                  <Badge color={req.status === "done" ? "ok" : req.status === "blocked" ? "warn" : "info"}>{req.status}</Badge>
                  <Badge>{subtasks.length} 子任务</Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-ink-soft whitespace-pre-wrap">{req.description || "(无描述)"}</p>
            {req.project_ids.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-ink-soft mb-1">关联项目:</div>
                <div className="flex gap-1 flex-wrap">
                  {req.project_ids.map(pid => {
                    const p = projects.find(x => x.id === pid);
                    return p ? <Badge key={pid} color="info">{p.name}</Badge> : null;
                  })}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Sparkles size={16} /> 联合解决方案</CardTitle>
            <div className="flex gap-2">
              {agents.length > 0 && (
                <select
                  id="solution-agent"
                  defaultValue={agents[0].id}
                  className="h-8 rounded-md border border-line bg-bg px-2 text-xs text-ink"
                >
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <Button
                size="sm"
                disabled={generating || agents.length === 0}
                onClick={() => {
                  const sel = document.getElementById("solution-agent") as HTMLSelectElement;
                  generateSolution(Number(sel.value));
                }}
              >
                <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
                {generating ? "生成中..." : (req.solution_doc ? "重新生成" : "生成方案")}
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {req.solution_doc ? (
              <div className="max-h-[600px] overflow-y-auto bg-bg-soft rounded-md p-4">
                <MarkdownView content={req.solution_doc} />
              </div>
            ) : (
              <p className="text-ink-soft text-sm">未生成。点击右上角"生成方案"让 AI 基于需求和关联项目设计联合解决方案。</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><ListTodo size={16} /> 子任务 ({subtasks.length})</CardTitle>
            <div className="flex gap-2">
              {agents.length > 0 && (
                <select
                  id="decompose-agent"
                  defaultValue={agents[0].id}
                  className="h-8 rounded-md border border-line bg-bg px-2 text-xs text-ink"
                >
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <Button
                size="sm"
                disabled={decomposing || agents.length === 0}
                onClick={() => {
                  const sel = document.getElementById("decompose-agent") as HTMLSelectElement;
                  decompose(Number(sel.value));
                }}
              >
                <Sparkles size={14} className={decomposing ? "animate-spin" : ""} />
                {decomposing ? "拆解中..." : "AI 拆子任务"}
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {subtasks.length === 0 ? (
              <p className="text-ink-soft text-sm">暂无子任务。点击右上角让 AI 拆解。</p>
            ) : (
              <div className="space-y-2">
                {subtasks.map((s) => (
                  <div key={s.id} className="border border-line rounded-md p-3 bg-bg-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{s.title}</span>
                          {s.module && <Badge>{s.module}</Badge>}
                          {s.estimate_hours > 0 && <Badge>{s.estimate_hours}h</Badge>}
                          {s.project_id && projects.find(p => p.id === s.project_id) && (
                            <Badge color="info">{projects.find(p => p.id === s.project_id)?.name}</Badge>
                          )}
                        </div>
                        {s.description && <p className="text-xs text-ink-soft mt-1">{s.description}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <select
                          value={s.status}
                          onChange={(e) => updateStatus(s.id, e.target.value as Subtask["status"])}
                          className="h-7 rounded border border-line bg-bg px-2 text-xs text-ink"
                        >
                          <option value="todo">todo</option>
                          <option value="doing">doing</option>
                          <option value="done">done</option>
                          <option value="blocked">blocked</option>
                        </select>
                        <Button size="sm" variant="danger" onClick={() => removeSub(s.id)}>
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}