"use client";
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { AgentsApi, type Agent } from "@/lib/api";
import { Bot, Plus, Trash2, Pencil, Check, X } from "lucide-react";

// 后端 provider key(规范化后)。显示名用中文标签。
const PROVIDERS = [
  { key: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { key: "kimi",     label: "Kimi (月之暗面)", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { key: "minimax",  label: "MiniMax", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-Text-01" },
  { key: "openai",   label: "OpenAI 兼容", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
];

type FormState = {
  name: string; provider: string; model: string; base_url: string;
  api_key: string; temperature: number; max_tokens: number;
  system_prompt: string; description: string;
};

const emptyForm: FormState = {
  name: "", provider: "deepseek", model: "deepseek-chat",
  base_url: "https://api.deepseek.com/v1", api_key: "",
  temperature: 0.7, max_tokens: 4096, system_prompt: "", description: "",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; msg: string } | undefined>>({});

  const refresh = async () => {
    setLoading(true);
    try { setAgents(await AgentsApi.list()); } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const setProvider = (p: string, target: "create" | "edit") => {
    const def = PROVIDERS.find((x) => x.key === p);
    if (!def) return;
    if (target === "create") setForm((f) => ({ ...f, provider: p, base_url: def.baseUrl, model: def.model }));
    else setEditForm((f) => ({ ...f, provider: p, base_url: def.baseUrl, model: def.model }));
  };

  const create = async () => {
    if (!form.name || !form.api_key || !form.model) {
      alert("请填写名称、模型、API Key"); return;
    }
    try {
      await AgentsApi.create(form);
      setForm(emptyForm);
      setCreating(false);
      await refresh();
    } catch (e: any) { alert("创建失败: " + e.message); }
  };

  const startEdit = (a: Agent) => {
    setEditing(a);
    setEditForm({
      name: a.name,
      provider: a.provider,
      model: a.model,
      base_url: a.base_url,
      api_key: "",            // 不回显原 key
      temperature: a.temperature,
      max_tokens: a.max_tokens,
      system_prompt: a.system_prompt,
      description: a.description,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const payload: any = { ...editForm };
      if (!payload.api_key) delete payload.api_key;   // 空字符串不上送,保留原 key
      await AgentsApi.update(editing.id, payload);
      setEditing(null);
      await refresh();
    } catch (e: any) { alert("保存失败: " + e.message); }
  };

  const test = async (id: number) => {
    setTestResults((m) => ({ ...m, [id]: undefined }));
    try {
      const r = await AgentsApi.test(id);
      setTestResults((m) => ({ ...m, [id]: { ok: r.ok, msg: r.ok ? "联通成功" : "联通失败" } }));
    } catch (e: any) {
      setTestResults((m) => ({ ...m, [id]: { ok: false, msg: e.message } }));
    }
  };

  const remove = async (id: number) => {
    if (!confirm("确认删除此 Agent?")) return;
    try { await AgentsApi.remove(id); await refresh(); } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2"><Bot size={22} /> Agents</h1>
            <p className="text-ink-soft mt-1">配置 DeepSeek / Kimi / MiniMax / OpenAI 等模型供应商</p>
          </div>
          <Button onClick={() => setCreating(!creating)}>
            <Plus size={16} /> {creating ? "取消" : "新建 Agent"}
          </Button>
        </div>

        {creating && (
          <Card>
            <CardHeader><CardTitle>新建 Agent</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              <AgentFormFields form={form} setForm={setForm} setProvider={(p) => setProvider(p, "create")} />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setCreating(false)}>取消</Button>
                <Button onClick={create}>保存</Button>
              </div>
            </CardBody>
          </Card>
        )}

        {editing && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Pencil size={16} /> 编辑 Agent #{editing.id} — {editing.name}
              </CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <AgentFormFields form={editForm} setForm={setEditForm} setProvider={(p) => setProvider(p, "edit")} />
              <p className="text-xs text-ink-dim">API Key 留空表示保留原值。</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                <Button onClick={saveEdit}><Check size={14} /> 保存</Button>
              </div>
            </CardBody>
          </Card>
        )}

        {loading ? (
          <p className="text-ink-soft">加载中...</p>
        ) : agents.length === 0 ? (
          <Card><CardBody><p className="text-ink-soft text-sm">尚未配置 Agent。点击右上角"新建 Agent"开始。</p></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {agents.map((a) => (
              <Card key={a.id}>
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{a.name}</span>
                        <Badge color="info">{a.provider}</Badge>
                        <Badge>{a.model}</Badge>
                        {a.has_api_key && <Badge color="ok">KEY OK</Badge>}
                        {!a.enabled && <Badge color="warn">已禁用</Badge>}
                      </div>
                      <div className="text-xs text-ink-dim mt-1 truncate">{a.base_url}</div>
                      {a.description && <div className="text-sm text-ink-soft mt-2">{a.description}</div>}
                      <div className="text-xs text-ink-dim mt-1">T={a.temperature} · max_tokens={a.max_tokens}</div>
                      {testResults[a.id] && (
                        <div className={`text-xs mt-2 ${testResults[a.id]!.ok ? "text-emerald-300" : "text-red-300"}`}>
                          {testResults[a.id]!.ok ? <Check size={12} className="inline" /> : <X size={12} className="inline" />}
                          {" "}{testResults[a.id]!.msg}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={() => test(a.id)}>联通测试</Button>
                      <Button size="sm" variant="secondary" onClick={() => startEdit(a)}>
                        <Pencil size={14} /> 编辑
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => remove(a.id)}>
                        <Trash2 size={14} />
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

function AgentFormFields({
  form, setForm, setProvider,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setProvider: (p: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-ink-soft">名称</label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-deepseek-coder" />
      </div>
      <div>
        <label className="text-xs text-ink-soft">Provider</label>
        <select
          value={form.provider}
          onChange={(e) => setProvider(e.target.value)}
          className="h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-ink"
        >
          {PROVIDERS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-ink-soft">Model</label>
        <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-ink-soft">Base URL</label>
        <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} />
      </div>
      <div className="col-span-2">
        <label className="text-xs text-ink-soft">API Key</label>
        <Input type="password" value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="sk-..." />
      </div>
      <div>
        <label className="text-xs text-ink-soft">Temperature ({form.temperature})</label>
        <input type="range" min="0" max="2" step="0.1" value={form.temperature}
               onChange={(e) => setForm({ ...form, temperature: parseFloat(e.target.value) })}
               className="w-full" />
      </div>
      <div>
        <label className="text-xs text-ink-soft">Max Tokens</label>
        <Input type="number" value={form.max_tokens} onChange={(e) => setForm({ ...form, max_tokens: parseInt(e.target.value) || 4096 })} />
      </div>
      <div className="col-span-2">
        <label className="text-xs text-ink-soft">System Prompt (可选)</label>
        <Textarea rows={3} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} />
      </div>
      <div className="col-span-2">
        <label className="text-xs text-ink-soft">备注</label>
        <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
    </div>
  );
}