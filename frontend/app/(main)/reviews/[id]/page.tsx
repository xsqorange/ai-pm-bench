"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ReviewsApi, type Review, type ReviewFinding } from "@/lib/api";
import { ArrowLeft, FileCode, Trash2, Activity, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";

const SEV_COLOR: Record<string, "error" | "warn" | "info"> = {
  error: "error", warn: "warn", info: "info",
};
const CAT_LABEL: Record<string, string> = {
  bug: "Bug", security: "Security", perf: "Performance",
  smell: "Smell", maintainability: "Maintainability",
};

// 阶段中文标签(借鉴 DeepSeek Harness 轨迹展示)
const STAGE_LABEL: Record<string, string> = {
  init: "初始化",
  slice: "切片收集",
  prompt: "构造 prompt",
  llm: "调用 LLM",
  parse: "解析 findings",
  summarize: "汇总",
  saved: "落库",
};

// 阶段配色
const STAGE_COLOR: Record<string, string> = {
  init: "text-blue-400",
  slice: "text-cyan-400",
  prompt: "text-purple-400",
  llm: "text-amber-400",
  parse: "text-pink-400",
  summarize: "text-emerald-400",
  saved: "text-green-400",
};

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const reviewId = Number(id);
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    ReviewsApi.get(reviewId).then(setReview).catch(() => {});
  }, [reviewId]);

  const del = async () => {
    if (!confirm("确定删除该审查记录?此操作不可恢复。")) return;
    try {
      await ReviewsApi.remove(reviewId);
      router.push("/reviews");
    } catch (e: any) { alert("删除失败: " + e.message); }
  };

  if (!review) return <div className="flex-1 p-8 text-ink-soft">加载中...</div>;

  const errs = review.findings.filter((f) => f.severity === "error").length;
  const warns = review.findings.filter((f) => f.severity === "warn").length;
  const infos = review.findings.filter((f) => f.severity === "info").length;

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push("/reviews")}>
            <ArrowLeft size={14} /> 返回列表
          </Button>
          <Button variant="danger" size="sm" onClick={del}>
            <Trash2 size={14} /> 删除
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle>审查 #{review.id}</CardTitle>
              <Badge color={SEV_COLOR[review.severity]}>{review.severity}</Badge>
            </div>
            <div className="text-sm text-ink-soft mt-2">{review.summary}</div>
            <div className="flex gap-3 text-xs text-ink-dim mt-2">
              <span>error={errs}</span>
              <span>warn={warns}</span>
              <span>info={infos}</span>
              <span>·</span>
              <span>{review.created_at?.slice(0, 16)}</span>
            </div>
            <div className="text-xs text-ink-dim mt-1">scope: <code className="text-ink-soft">{review.scope}</code></div>
          </CardHeader>
        </Card>

        {review.findings.length === 0 ? (
          <Card><CardBody><p className="text-emerald-300 text-sm">未发现问题,代码质量良好</p></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {review.findings.map((f, i) => <FindingCard key={i} f={f} />)}
          </div>
        )}

        {/* 审查执行轨迹 — 借鉴 DeepSeek Harness 轨迹展示 */}
        {review.trajectory && review.trajectory.length > 0 && (
          <TrajectoryCard events={review.trajectory} />
        )}
      </div>
    </div>
  );
}

function TrajectoryCard({ events }: { events: NonNullable<Review["trajectory"]> }) {
  const [open, setOpen] = useState(true);
  const totalMs = events.length ? events[events.length - 1].elapsed_ms : 0;
  const errors = events.filter((e) => e.status === "error").length;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Activity size={16} /> 审查执行轨迹
          </CardTitle>
          <div className="flex items-center gap-2 text-xs text-ink-dim">
            <Clock size={12} /> {totalMs}ms
            {errors > 0 && <Badge color="error">{errors} 异常</Badge>}
            <Badge>{events.length} 事件</Badge>
            <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
              {open ? "收起" : "展开"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardBody>
          <ol className="relative border-l border-line ml-2 space-y-3">
            {events.map((e, i) => (
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-semibold ${STAGE_COLOR[e.stage] || "text-ink-soft"}`}>
                    {STAGE_LABEL[e.stage] || e.stage}
                  </span>
                  <Badge color={e.status === "error" ? "error" : e.status === "ok" ? "ok" : "warn"}>
                    {e.status}
                  </Badge>
                  <span className="text-xs text-ink-dim">
                    +{e.elapsed_ms}ms
                  </span>
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
      )}
    </Card>
  );
}

function FindingCard({ f }: { f: ReviewFinding }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <Badge color={SEV_COLOR[f.severity] || "info"}>{f.severity}</Badge>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold">{f.title}</span>
              <Badge>{CAT_LABEL[f.category] || f.category}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-dim mb-2">
              <FileCode size={12} />
              <code className="font-mono">{f.file}:{f.line || "?"}</code>
            </div>
            {f.detail && (
              <p className="text-sm text-ink-soft whitespace-pre-wrap mb-2">{f.detail}</p>
            )}
            {f.suggestion && (
              <div className="bg-bg-soft rounded p-2 text-xs text-ink">
                <div className="text-ink-dim mb-1">建议:</div>
                <pre className="whitespace-pre-wrap font-mono">{f.suggestion}</pre>
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}