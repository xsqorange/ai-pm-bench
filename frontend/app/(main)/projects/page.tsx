"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { ProjectsApi, type Project } from "@/lib/api";
import { FolderGit2, RefreshCw, Search, GitBranch, GitCommit } from "lucide-react";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [search, setSearch] = useState("");

  const refresh = async () => {
    setLoading(true);
    try { setProjects(await ProjectsApi.list()); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const rescan = async () => {
    setRescanning(true);
    try { await ProjectsApi.rescan(); await refresh(); } finally { setRescanning(false); }
  };

  // 搜索过滤:项目名 / 路径 / 技术栈 / 当前 git 分支
  const filtered = projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.path.toLowerCase().includes(q) ||
      (p.tech_stack || []).some((t) => t.toLowerCase().includes(q)) ||
      (p.git_branch || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><FolderGit2 size={22} /> Projects</h1>
            <p className="text-ink-soft mt-1">工作区根: <code className="text-ink">D:\work\workspace</code></p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={rescan} disabled={rescanning}>
              <RefreshCw size={16} className={rescanning ? "animate-spin" : ""} />
              {rescanning ? "扫描中..." : "重新扫描"}
            </Button>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目(名/路径/技术栈/分支)..."
            className="pl-9"
          />
        </div>

        {loading ? (
          <p className="text-ink-soft">加载中...</p>
        ) : filtered.length === 0 ? (
          <p className="text-ink-soft">{search ? `无匹配 "${search}" 的项目` : "未发现项目。"}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="block">
                <Card className="cursor-pointer hover:border-brand transition h-full">
                  <CardBody>
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-ink-dim truncate mt-1">{p.path}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(p.tech_stack || []).slice(0, 4).map((t) => <Badge key={t}>{t}</Badge>)}
                      {(p.tech_stack || []).length > 4 && <Badge>+{(p.tech_stack || []).length - 4}</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-xs">
                      {p.git_branch ? (
                        <span className="flex items-center gap-1 text-emerald-300">
                          <GitBranch size={12} /> {p.git_branch}
                          {p.git_dirty && <Badge color="warn">脏</Badge>}
                        </span>
                      ) : (
                        <span className="text-ink-dim">no git</span>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}