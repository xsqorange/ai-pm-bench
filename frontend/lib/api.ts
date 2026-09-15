// REST API 客户端
// - dev 模式:直连后端 http://127.0.0.1:8000/api/v1(避开 Next.js dev proxy 在 HMR 时的 ECONNRESET)
// - prod 模式:走 Next.js rewrite(/api/backend/* -> 后端 /api/v1/*)
// - 自定义:在 .env.local 设置 NEXT_PUBLIC_API_BASE 覆盖(同时适用于两种模式)

const _isBrowser = typeof window !== "undefined";
const _isDev = _isBrowser && process.env.NODE_ENV === "development";
const _envOverride = _isBrowser ? (process.env.NEXT_PUBLIC_API_BASE || "") : "";
const CONST_BASE = _envOverride
  ? _envOverride
  : (_isDev ? "http://127.0.0.1:8000/api/v1" : "/api/backend");

// 单次请求超时(默认 15s):防止后端假死时 fetch 永久 pending,UI 看着像卡死
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(CONST_BASE + path, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail ?? detail; } catch {}
      throw new Error(`${res.status} ${detail}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (e: any) {
    // AbortError 通常是超时触发 — 把它翻译成可读中文错误
    if (e?.name === "AbortError") {
      throw new Error(
        `请求超时(${REQUEST_TIMEOUT_MS / 1000}s):后端 ${CONST_BASE} 无响应。请检查后端是否启动、端口是否被占用。`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type Agent = {
  id: number; name: string; provider: string; model: string; base_url: string;
  temperature: number; max_tokens: number; system_prompt: string;
  description: string; enabled: boolean; has_api_key: boolean; extra: Record<string, unknown>;
};
export type Project = {
  id: number; name: string; path: string; tech_stack: string[];
  description: string; last_modified: string | null;
  git_branch: string | null; git_dirty: boolean;
};
export type Message = {
  id: number; conversation_id: number; role: string; content: string;
  tokens_in: number; tokens_out: number; created_at: string;
};
export type Conversation = {
  id: number; agent_id: number; title: string;
  project_id: number | null; requirement_id: number | null;
  created_at: string; updated_at: string; message_count: number;
};
export type TreeNode = { name: string; type: "directory" | "file"; children?: TreeNode[]; size?: number; };
export type DirEntry = { name: string; type: "directory" | "file"; size: number; };
export type FileContent = { path: string; content: string; size: number; truncated: boolean; };
export type Requirement = {
  id: number; title: string; description: string;
  status: "todo" | "doing" | "done" | "blocked";
  priority: "P0" | "P1" | "P2" | "P3";
  project_ids: number[]; solution_doc: string; tags: string[];
  created_at: string; updated_at: string; subtask_count: number;
};
export type Subtask = {
  id: number; requirement_id: number; project_id: number | null;
  module: string; title: string; description: string;
  status: "todo" | "doing" | "done" | "blocked";
  estimate_hours: number;
};
export type GitStatus = {
  branch: string; is_dirty: boolean;
  untracked: string[]; modified: string[]; staged: string[];
};

// Review
export type ReviewFinding = {
  file: string; line: number; severity: "error" | "warn" | "info";
  category: "bug" | "security" | "perf" | "smell" | "maintainability";
  title: string; detail: string; suggestion: string;
};
export type ReviewTrajectoryEvent = {
  ts: string; elapsed_ms: number;
  stage: string; status: string;
  payload: Record<string, unknown>;
};
export type Review = {
  id: number; project_id: number; agent_id: number;
  scope: string; summary: string; severity: string;
  findings: ReviewFinding[]; rules: Record<string, unknown>;
  created_at: string;
  trajectory?: ReviewTrajectoryEvent[];
  raw_llm?: string;
};

// Performance
export type PerfFinding = {
  file: string; line: number;
  category: string;  // db|algo|memory|concurrency|frontend
  title: string; impact: "high" | "medium" | "low";
  optimization: string;
};
export type PerfStatic = { rule: string; file: string; line: number; snippet: string; category: string; };
export type PerfReport = {
  id: number; project_id: number; agent_id: number;
  scope: string; summary: string;
  findings: PerfFinding[]; static_findings: PerfStatic[];
  created_at: string;
};

// Document
export type DocumentType = "README" | "API" | "ARCH" | "CHANGELOG" | "DEPLOY" | "OTHER";
export type Doc = {
  id: number; project_id: number | null;
  title: string; type: DocumentType;
  content: string; tags: string[];
  file_path: string | null;
  created_at: string; updated_at: string;
};

// Agents
export const AgentsApi = {
  list: () => request<Agent[]>("/agents"),
  create: (data: Partial<Agent> & { api_key: string }) =>
    request<Agent>("/agents", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Agent> & { api_key?: string }) =>
    request<Agent>(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/agents/${id}`, { method: "DELETE" }),
  test: (id: number) => request<{ ok: boolean; agent: string }>(`/agents/${id}/test`, { method: "POST" }),
};

// Projects
export const ProjectsApi = {
  list: () => request<Project[]>("/projects"),
  rescan: () => request<{ found: number; new: number }>("/projects/rescan", { method: "POST" }),
  tree: (id: number, path = "", maxDepth = 3) =>
    request<{ project: string; path: string; tree: TreeNode }>(
      `/projects/${id}/tree?path=${encodeURIComponent(path)}&max_depth=${maxDepth}`),
  listDir: (id: number, path = "") =>
    request<{ path: string; entries: DirEntry[] }>(`/projects/${id}/list?path=${encodeURIComponent(path)}`),
  readFile: (id: number, path: string) =>
    request<FileContent>(`/projects/${id}/file?path=${encodeURIComponent(path)}`, {
      cache: "no-store",  // 不缓存 — 防止浏览器把过期 404 留住
    }),
  writeFile: (id: number, data: { path: string; content: string; expected_original?: string; confirm: boolean }) =>
    request<{ path: string; written: boolean }>(`/projects/${id}/file`, {
      method: "PUT", body: JSON.stringify(data),
    }),
};

// Conversations
export const ConversationsApi = {
  list: (params?: { agent_id?: number; project_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.agent_id) q.set("agent_id", String(params.agent_id));
    if (params?.project_id) q.set("project_id", String(params.project_id));
    return request<Conversation[]>(`/conversations${q.toString() ? "?" + q : ""}`);
  },
  get: (id: number) => request<Conversation & { messages: Message[] }>(`/conversations/${id}`),
  remove: (id: number) => request<void>(`/conversations/${id}`, { method: "DELETE" }),
  exportUrl: (id: number) => `${CONST_BASE}/conversations/${id}/export`,
};

// Git
export const GitApi = {
  status: (projectId: number) => request<GitStatus>(`/projects/${projectId}/git/status`),
  log: (projectId: number, maxCount = 20) =>
    request<{ commits: { sha: string; message: string; author: string; date: string }[] }>(
      `/projects/${projectId}/git/log?max_count=${maxCount}`),
  diff: (projectId: number, file?: string, staged = false) => {
    const q = new URLSearchParams();
    if (file) q.set("path", file);
    if (staged) q.set("staged", "true");
    return request<{ diff: string; path?: string; staged: boolean }>(
      `/projects/${projectId}/git/diff${q.toString() ? "?" + q : ""}`);
  },
  branches: (projectId: number) =>
    request<{ local: { name: string; is_active: boolean }[]; remote: { name: string }[]; active: string }>(
      `/projects/${projectId}/git/branches`),
  createBranch: (projectId: number, name: string, checkout = true) =>
    request<{ branch: string; checkout: boolean }>(`/projects/${projectId}/git/branches`, {
      method: "POST", body: JSON.stringify({ name, checkout }),
    }),
  checkout: (projectId: number, name: string) =>
    request<{ branch: string }>(`/projects/${projectId}/git/checkout`, {
      method: "POST", body: JSON.stringify({ name }),
    }),
  commit: (projectId: number, message: string, addAll = true) =>
    request<{ sha: string; message: string }>(`/projects/${projectId}/git/commit`, {
      method: "POST", body: JSON.stringify({ message, add_all: addAll }),
    }),
  push: (projectId: number, remote = "origin", branch?: string) =>
    request<{ remote: string; branch: string; summary: string[] }>(
      `/projects/${projectId}/git/push`, {
      method: "POST", body: JSON.stringify({ remote, branch }),
      }),
  pull: (projectId: number, remote = "origin", branch?: string) =>
    request<{ remote: string; branch: string; summary: string[] }>(
      `/projects/${projectId}/git/pull`, {
      method: "POST", body: JSON.stringify({ remote, branch }),
      }),
};

// Requirements
export const RequirementsApi = {
  list: (params?: { status?: string; project_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.project_id !== undefined) q.set("project_id", String(params.project_id));
    return request<Requirement[]>(`/requirements${q.toString() ? "?" + q : ""}`);
  },
  get: (id: number) => request<Requirement>(`/requirements/${id}`),
  create: (data: Partial<Requirement>) =>
    request<Requirement>("/requirements", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Requirement>) =>
    request<Requirement>(`/requirements/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/requirements/${id}`, { method: "DELETE" }),
  generateSolution: (id: number, agentId: number) =>
    request<{ solution_doc: string; chars: number }>(`/requirements/${id}/solution`, {
      method: "POST", body: JSON.stringify({ agent_id: agentId }),
    }),
  decompose: (id: number, agentId: number, count = 5) =>
    request<Subtask[]>(`/requirements/${id}/decompose`, {
      method: "POST", body: JSON.stringify({ agent_id: agentId, count }),
    }),
  listSubtasks: (id: number) => request<Subtask[]>(`/requirements/${id}/subtasks`),
  createSubtask: (id: number, data: Partial<Subtask>) =>
    request<Subtask>(`/requirements/${id}/subtasks`, {
      method: "POST", body: JSON.stringify(data),
    }),
  updateSubtask: (reqId: number, subId: number, data: Partial<Subtask>) =>
    request<Subtask>(`/requirements/${reqId}/subtasks/${subId}`, {
      method: "PATCH", body: JSON.stringify(data),
    }),
  deleteSubtask: (reqId: number, subId: number) =>
    request<void>(`/requirements/${reqId}/subtasks/${subId}`, { method: "DELETE" }),
};

// Reviews
export const ReviewsApi = {
  list: (params?: { project_id?: number; severity?: string }) => {
    const q = new URLSearchParams();
    if (params?.project_id) q.set("project_id", String(params.project_id));
    if (params?.severity) q.set("severity", params.severity);
    return request<Review[]>(`/reviews${q.toString() ? "?" + q : ""}`);
  },
  get: (id: number) => request<Review & { raw_llm?: string }>(`/reviews/${id}`),
  run: (data: { project_id: number; agent_id: number; paths?: string[]; max_chars?: number }) =>
    request<Review>("/reviews/run", { method: "POST", body: JSON.stringify(data) }),
  // 实时审查流:用 fetch + ReadableStream 解析 SSE
  // handlers: { onStart, onTrajectory(ev), onDone({review_id, ok}), onError({reason}) }
  runStream: async (
    data: { project_id: number; agent_id: number; paths?: string[]; max_chars?: number; categories?: string[] },
    handlers: {
      onStart?: (info: any) => void;
      onTrajectory: (ev: ReviewTrajectoryEvent) => void;
      onDone?: (info: { review_id: number | null; ok: boolean }) => void;
      onError?: (info: { reason: string }) => void;
      signal?: AbortSignal;
    },
  ) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300_000); // 5 分钟上限
    if (handlers.signal) {
      handlers.signal.addEventListener("abort", () => controller.abort());
    }
    try {
      const res = await fetch(CONST_BASE + "/reviews/run/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail ?? detail; } catch {}
        throw new Error(res.status + " " + detail);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE 事件以 \n\n 分隔
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = raw.split("\n");
          let event = "message";
          let data = "";
          for (const ln of lines) {
            if (ln.startsWith("event: ")) event = ln.slice(7).trim();
            else if (ln.startsWith("data: ")) data += ln.slice(6);
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === "start") handlers.onStart?.(parsed);
            else if (event === "trajectory") handlers.onTrajectory(parsed);
            else if (event === "done") handlers.onDone?.(parsed);
            else if (event === "error") handlers.onError?.(parsed);
          } catch {}
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") handlers.onError?.({ reason: "请求超时/被取消" });
      else handlers.onError?.({ reason: e?.message || String(e) });
    } finally {
      clearTimeout(timer);
    }
  },
  remove: (id: number) => request<void>(`/reviews/${id}`, { method: "DELETE" }),
};

// Performance
export const PerformanceApi = {
  list: (params?: { project_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.project_id) q.set("project_id", String(params.project_id));
    return request<PerfReport[]>(`/performance${q.toString() ? "?" + q : ""}`);
  },
  get: (id: number) => request<PerfReport & { raw_llm?: string }>(`/performance/${id}`),
  run: (data: { project_id: number; agent_id: number; paths?: string[]; max_chars?: number }) =>
    request<PerfReport>("/performance/run", { method: "POST", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/performance/${id}`, { method: "DELETE" }),
};

// Documents
export const DocumentsApi = {
  list: (params?: { project_id?: number; type?: string }) => {
    const q = new URLSearchParams();
    if (params?.project_id) q.set("project_id", String(params.project_id));
    if (params?.type) q.set("type", params.type);
    return request<Doc[]>(`/documents${q.toString() ? "?" + q : ""}`);
  },
  get: (id: number) => request<Doc>(`/documents/${id}`),
  create: (data: Partial<Doc>) =>
    request<Doc>("/documents", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Doc>) =>
    request<Doc>(`/documents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: number) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  generate: (data: { project_id: number; agent_id: number; doc_type: DocumentType }) =>
    request<Doc>("/documents/generate", { method: "POST", body: JSON.stringify(data) }),
  polish: (id: number, agentId: number, instruction = "") =>
    request<Doc>(`/documents/${id}/polish`, {
      method: "POST", body: JSON.stringify({ agent_id: agentId, instruction }),
    }),
  exportUrl: (id: number) => `${CONST_BASE}/documents/${id}/export`,
};