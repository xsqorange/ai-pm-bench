"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ProjectsApi, GitApi, type Project, type TreeNode, type FileContent, type GitStatus } from "@/lib/api";
import { ArrowLeft, FolderGit2, GitBranch, RefreshCw, GitCommit, Upload, Download, File as FileIcon, Folder as FolderIcon, ChevronRight, ChevronDown, Save, AlertTriangle, Search } from "lucide-react";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLog, setGitLog] = useState<{ sha: string; message: string; author: string; date: string }[]>([]);
  const [branches, setBranches] = useState<{ local: { name: string; is_active: boolean }[]; remote: { name: string }[]; active: string } | null>(null);
  const [tab, setTab] = useState<"files" | "git">("files");
  const [commitMsg, setCommitMsg] = useState("");
  const [branchName, setBranchName] = useState("");
  const [busy, setBusy] = useState(false);
  const [logCount, setLogCount] = useState(20);
  const [logSearch, setLogSearch] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refreshGit = async (maxCount?: number) => {
    const n = maxCount ?? logCount;
    try { setGitStatus(await GitApi.status(projectId)); } catch {}
    try { setGitLog((await GitApi.log(projectId, n)).commits); } catch {}
    try { setBranches(await GitApi.branches(projectId)); } catch {}
    setMsg({ kind: "ok", text: `Git 信息已刷新 (${n} commits)` });
  };
  const refreshTree = async () => {
    const r = await ProjectsApi.tree(projectId, "", 3);
    setTree(r.tree);
  };
  const refreshAll = async () => {
    try {
      const ps = await ProjectsApi.list();
      setProject(ps.find(p => p.id === projectId) || null);
    } catch {}
    await refreshTree();
    await refreshGit();
  };

  useEffect(() => { refreshAll(); }, [projectId]);

  // commit 搜索过滤:作者 / 消息 / SHA 都参与匹配
  const filteredCommits = gitLog.filter((c) => {
    if (!logSearch.trim()) return true;
    const q = logSearch.toLowerCase();
    return (
      c.sha.toLowerCase().includes(q) ||
      c.message.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q)
    );
  });

  const openFile = async (relPath: string) => {
    setSelectedFile(relPath);
    setEditing(false);
    try {
      const fc = await ProjectsApi.readFile(projectId, relPath);
      setFileContent(fc);
      setEditContent(fc.content);
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
  };

  const saveFile = async () => {
    if (!fileContent) return;
    if (!confirm(`确认覆盖 ${selectedFile}?\n\n(此操作不可撤销,需要 confirm=true)`)) return;
    setBusy(true);
    try {
      await ProjectsApi.writeFile(projectId, {
        path: selectedFile,
        content: editContent,
        expected_original: fileContent.content,
        confirm: true,
      });
      setMsg({ kind: "ok", text: `已保存: ${selectedFile}` });
      // Refresh content (truncated可能变了)
      const fc = await ProjectsApi.readFile(projectId, selectedFile);
      setFileContent(fc);
      setEditContent(fc.content);
      setEditing(false);
      await refreshGit();  // git status 可能变化
    } catch (e: any) {
      setMsg({ kind: "err", text: `保存失败: ${e.message}` });
    } finally { setBusy(false); }
  };

  const doCommit = async () => {
    if (!commitMsg.trim()) { setMsg({ kind: "err", text: "请输入 commit message" }); return; }
    setBusy(true);
    try {
      const r = await GitApi.commit(projectId, commitMsg, true);
      setMsg({ kind: "ok", text: `已提交: ${r.sha.slice(0, 8)}` });
      setCommitMsg("");
      await refreshGit();
      await refreshTree();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    finally { setBusy(false); }
  };

  const doPush = async () => {
    setBusy(true);
    try {
      const r = await GitApi.push(projectId);
      setMsg({ kind: "ok", text: `已 push: ${r.summary.join("; ") || "OK"}` });
    } catch (e: any) { setMsg({ kind: "err", text: `push 失败: ${e.message}` }); }
    finally { setBusy(false); }
  };

  const doPull = async () => {
    setBusy(true);
    try {
      const r = await GitApi.pull(projectId);
      setMsg({ kind: "ok", text: `已 pull: ${r.summary.join("; ") || "OK"}` });
      await refreshGit();
      await refreshTree();
    } catch (e: any) { setMsg({ kind: "err", text: `pull 失败: ${e.message}` }); }
    finally { setBusy(false); }
  };

  const doCreateBranch = async () => {
    if (!branchName.trim()) return;
    setBusy(true);
    try {
      await GitApi.createBranch(projectId, branchName, true);
      setMsg({ kind: "ok", text: `已创建并切换到分支 ${branchName}` });
      setBranchName("");
      await refreshGit();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    finally { setBusy(false); }
  };

  const doCheckout = async (name: string) => {
    setBusy(true);
    try {
      await GitApi.checkout(projectId, name);
      setMsg({ kind: "ok", text: `已切换到 ${name}` });
      await refreshAll();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    finally { setBusy(false); }
  };

  if (!project) return <div className="flex-1 p-8 text-ink-soft">加载中...</div>;

  return (
    <div className="flex-1 p-6 overflow-hidden flex flex-col">
      <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
            <ArrowLeft size={14} /> 返回项目列表
          </Button>
        </div>

        {msg && (
          <div className={`rounded-md border px-3 py-2 text-sm ${msg.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
            {msg.text}
            <button className="ml-2 float-right" onClick={() => setMsg(null)}>×</button>
          </div>
        )}

        <Card>
          <CardBody className="py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <FolderGit2 size={20} className="text-brand" />
              <span className="font-semibold text-lg">{project.name}</span>
              <div className="flex gap-1 flex-wrap">
                {project.tech_stack.map(t => <Badge key={t}>{t}</Badge>)}
              </div>
              {gitStatus && (
                <>
                  <Badge color="info"><GitBranch size={10} className="inline mr-1" />{gitStatus.branch}</Badge>
                  {gitStatus.is_dirty && <Badge color="warn">脏 ({gitStatus.modified.length + gitStatus.untracked.length})</Badge>}
                </>
              )}
            </div>
          </CardBody>
        </Card>

        <div className="flex gap-1 border-b border-line">
          <button onClick={() => setTab("files")} className={`px-4 py-2 text-sm transition ${tab === "files" ? "border-b-2 border-brand text-brand-soft" : "text-ink-soft hover:text-ink"}`}>
            文件浏览
          </button>
          <button onClick={() => setTab("git")} className={`px-4 py-2 text-sm transition ${tab === "git" ? "border-b-2 border-brand text-brand-soft" : "text-ink-soft hover:text-ink"}`}>
            Git 操作
          </button>
        </div>

        {tab === "files" ? (
          <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
            {/* File tree */}
            <Card className="col-span-3 flex flex-col min-h-0">
              <CardHeader className="flex items-center justify-between py-2">
                <CardTitle className="text-sm">目录</CardTitle>
                <Button size="sm" variant="ghost" onClick={refreshTree}><RefreshCw size={12} /></Button>
              </CardHeader>
              <CardBody className="flex-1 overflow-y-auto py-2">
                {tree ? (
  tree.children && tree.children.length > 0 ? (
    tree.children.map((c, i) => (
      <TreeView key={i} node={c} currentPath="" selectedFile={selectedFile} onSelect={openFile} />
    ))
  ) : (
    <p className="text-ink-soft text-xs">(空目录)</p>
  )
) : <p className="text-ink-soft text-xs">加载中...</p>}
              </CardBody>
            </Card>

            {/* File viewer/editor */}
            <Card className="col-span-9 flex flex-col min-h-0">
              <CardHeader className="flex items-center justify-between py-2">
                <CardTitle className="text-sm font-mono">
                  {selectedFile || "(未选择文件)"}
                  {fileContent && <span className="text-ink-dim ml-2">· {fileContent.size}B{fileContent.truncated && " · 截断"}</span>}
                </CardTitle>
                <div className="flex gap-1">
                  {fileContent && !editing && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>编辑</Button>
                  )}
                  {editing && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditContent(fileContent?.content ?? ""); }}>取消</Button>
                      <Button size="sm" onClick={saveFile} disabled={busy}><Save size={12} /> 保存</Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardBody className="flex-1 min-h-0 overflow-hidden p-0">
                {!fileContent ? (
                  <p className="text-ink-soft text-sm p-4">从左侧选择一个文件查看或编辑。</p>
                ) : editing ? (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-full font-mono text-xs rounded-none border-0 resize-none"
                    spellCheck={false}
                  />
                ) : (
                  <pre className="w-full h-full overflow-auto bg-bg-soft p-4 text-xs font-mono whitespace-pre">
                    {fileContent ? fileContent.content : ""}
                  </pre>
                )}
              </CardBody>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>状态</CardTitle>
                <Button size="sm" variant="ghost" onClick={refreshGit}><RefreshCw size={12} /></Button>
              </CardHeader>
              <CardBody className="space-y-3">
                {gitStatus ? (
                  <>
                    <div>
                      <div className="text-xs text-ink-soft mb-1">分支</div>
                      <Badge color="info">{gitStatus.branch}</Badge>
                    </div>
                    {gitStatus.modified.length > 0 && (
                      <div>
                        <div className="text-xs text-ink-soft mb-1">已修改 ({gitStatus.modified.length})</div>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto bg-bg-soft p-2 rounded text-xs font-mono">
                          {gitStatus.modified.map(f => <div key={f}>📝 {f}</div>)}
                        </div>
                      </div>
                    )}
                    {gitStatus.staged.length > 0 && (
                      <div>
                        <div className="text-xs text-ink-soft mb-1">已暂存 ({gitStatus.staged.length})</div>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto bg-bg-soft p-2 rounded text-xs font-mono">
                          {gitStatus.staged.map(f => <div key={f}>✓ {f}</div>)}
                        </div>
                      </div>
                    )}
                    {gitStatus.untracked.length > 0 && (
                      <div>
                        <div className="text-xs text-ink-soft mb-1">未跟踪 ({gitStatus.untracked.length})</div>
                        <div className="space-y-0.5 max-h-32 overflow-y-auto bg-bg-soft p-2 rounded text-xs font-mono">
                          {gitStatus.untracked.map(f => <div key={f}>❔ {f}</div>)}
                        </div>
                      </div>
                    )}
                    {gitStatus.modified.length + gitStatus.untracked.length === 0 && (
                      <p className="text-emerald-300 text-sm">✓ 工作区干净</p>
                    )}
                  </>
                ) : (
                  <p className="text-ink-soft text-sm">无 Git 仓库或加载失败</p>
                )}

                <div className="border-t border-line pt-3 space-y-2">
                  <Input value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} placeholder="Commit message..." />
                  <Button size="sm" onClick={doCommit} disabled={busy || !commitMsg.trim()} className="w-full">
                    <GitCommit size={14} /> Commit & Add All
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>分支与远程</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={doPull} disabled={busy}><Download size={14} /> Pull</Button>
                  <Button size="sm" variant="secondary" onClick={doPush} disabled={busy}><Upload size={14} /> Push</Button>
                </div>

                {branches && (
                  <div>
                    <div className="text-xs text-ink-soft mb-1">本地分支</div>
                    <div className="space-y-0.5 max-h-48 overflow-y-auto bg-bg-soft p-2 rounded text-xs">
                      {branches.local.map((b) => (
                        <div key={b.name} className={`flex items-center justify-between px-2 py-1 rounded ${b.is_active ? "bg-brand/15 text-brand-soft" : "hover:bg-bg-card"}`}>
                          <span className="font-mono">{b.is_active && "★ "}{b.name}</span>
                          {!b.is_active && (
                            <button onClick={() => doCheckout(b.name)} className="text-xs text-ink-dim hover:text-ink">切换</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="新分支名" />
                  <Button size="sm" onClick={doCreateBranch} disabled={busy || !branchName.trim()}>创建</Button>
                </div>

                <div className="border-t border-line pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-ink-soft">最近提交 ({filteredCommits.length}/{gitLog.length})</div>
                    <div className="flex items-center gap-1">
                      <select
                        value={logCount}
                        onChange={(e) => { const n = Number(e.target.value); setLogCount(n); refreshGit(n); }}
                        className="h-7 text-xs rounded border border-line bg-bg px-1 text-ink"
                        title="拉取数量"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <Button size="sm" variant="ghost" onClick={() => refreshGit()} title="刷新 git 信息"><RefreshCw size={12} /></Button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-dim" />
                    <Input
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="搜索 commit(作者/消息/SHA)"
                      className="pl-7 h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {filteredCommits.length === 0 ? (
                      <p className="text-ink-dim text-xs py-2">{logSearch ? `无匹配 "${logSearch}" 的 commit` : "无提交记录"}</p>
                    ) : filteredCommits.map((c) => (
                      <div key={c.sha} className="text-xs bg-bg-soft p-2 rounded">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-brand-soft">{c.sha}</span>
                          <span className="text-ink-dim text-[10px]">{c.date.slice(0, 16)}</span>
                        </div>
                        <div className="line-clamp-2 mt-0.5">{c.message}</div>
                        <div className="text-ink-dim text-[10px] mt-0.5">{c.author}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function TreeView({ node, currentPath, selectedFile, onSelect }: {
  node: TreeNode; currentPath: string; selectedFile: string;
  onSelect: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const childPath = currentPath ? `${currentPath}/${node.name}` : node.name;
  if (node.type === "file") {
    const isSel = selectedFile === childPath;
    return (
      <button
        onClick={() => onSelect(childPath)}
        className={`flex items-center gap-1.5 py-0.5 px-2 text-xs w-full text-left rounded transition ${isSel ? "bg-brand/15 text-brand-soft" : "hover:bg-bg-card text-ink-soft"}`}
      >
        <FileIcon size={11} className="text-ink-dim shrink-0" />
        <span className="truncate font-mono">{node.name}</span>
      </button>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-1 py-0.5 cursor-pointer hover:bg-bg-card rounded" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <FolderIcon size={11} className="text-brand" />
        <span className="text-xs font-medium">{node.name}</span>
      </div>
      {open && node.children && (
        <div className="ml-3 border-l border-line/40 pl-1">
          {node.children.map((c, i) => <TreeView key={i} node={c} currentPath={childPath} selectedFile={selectedFile} onSelect={onSelect} />)}
        </div>
      )}
    </div>
  );
}