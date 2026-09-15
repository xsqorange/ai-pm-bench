"use client";
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AgentsApi, ProjectsApi } from "@/lib/api";
import Link from "next/link";
import { Bot, FolderGit2, MessageSquare, RefreshCw, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [rescanning, setRescanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      // 并行拉两个列表,任一失败都抛错
      const [a, p] = await Promise.all([AgentsApi.list(), ProjectsApi.list()]);
      setAgents(a);
      setProjects(p);
    } catch (e: any) {
      // 不再默默吞错 — 把错误展示给用户,并提供重试入口
      setError(e?.message || "加载失败");
      setAgents([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const rescan = async () => {
    setRescanning(true);
    try { await ProjectsApi.rescan(); await refresh(); } finally { setRescanning(false); }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-ink-soft mt-1">本地 AI 开发工作台 · 状态总览</p>
        </div>

        {/* 后端不可达 / 超时 时,显式告知用户,而不是页面看似卡死 */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-soft bg-bg-card border border-line rounded-md px-3 py-2">
            <Loader2 size={14} className="animate-spin" />
            正在加载 Agent / Project 列表…
          </div>
        )}
        {error && !loading && (
          <div className="flex items-center justify-between gap-3 text-sm text-red-300 bg-red-950/30 border border-red-900 rounded-md px-3 py-2">
            <div className="flex-1 min-w-0">
              <span className="font-semibold">加载失败:</span> {error}
            </div>
            <Button size="sm" variant="secondary" onClick={refresh}>
              <RefreshCw size={14} /> 重试
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Bot size={16} /> Agents</CardTitle>
              <Badge color={agents.length > 0 ? "ok" : "warn"}>{agents.length}</Badge>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-ink-soft">
                {agents.length === 0 ? "尚未配置任何 Agent。" : `已配置 ${agents.filter(a => a.enabled).length} 个可用 Agent。`}
              </p>
              <Link href="/agents" className="inline-block mt-3">
                <Button size="sm" variant="secondary">管理 Agents</Button>
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><FolderGit2 size={16} /> Projects</CardTitle>
              <Badge color={projects.length > 0 ? "ok" : "warn"}>{projects.length}</Badge>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-ink-soft">工作区根: <code className="text-ink">D:\work\workspace</code></p>
              <Button size="sm" variant="secondary" onClick={rescan} disabled={rescanning} className="mt-3">
                <RefreshCw size={14} className={rescanning ? "animate-spin" : ""} />
                {rescanning ? "扫描中..." : "重新扫描"}
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><MessageSquare size={16} /> Quick Chat</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-ink-soft">选择一个 Agent 即可开始对话。</p>
              <Link href="/chat" className="inline-block mt-3">
                <Button size="sm">开始聊天</Button>
              </Link>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>使用流程</CardTitle>
          </CardHeader>
          <CardBody>
            <ol className="space-y-2 text-sm text-ink-soft list-decimal pl-5">
              <li>在 <Link href="/agents" className="text-brand-soft hover:underline">Agents</Link> 页配置至少一个 AI 模型(填入 API Key)。</li>
              <li>在 <Link href="/projects" className="text-brand-soft hover:underline">Projects</Link> 页查看 <code>D:\work\workspace</code> 下的项目。</li>
              <li>在 <Link href="/chat" className="text-brand-soft hover:underline">Chat</Link> 页选择 Agent,直接对话或让 AI 读取项目文件。</li>
              <li>W3 之后:代码审查 / 性能分析 / 需求管理 / 文档生成。</li>
            </ol>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}