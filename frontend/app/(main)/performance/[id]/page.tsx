"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PerformanceApi, type PerfReport, type PerfFinding } from "@/lib/api";
import { ArrowLeft, FileCode, Trash2 } from "lucide-react";

const IMPACT_COLOR: Record<string, "error" | "warn" | "info"> = {
  high: "error", medium: "warn", low: "info",
};

export default function PerfDetailPage() {
  const { id } = useParams<{ id: string }>();
  const perfId = Number(id);
  const router = useRouter();
  const [report, setReport] = useState<PerfReport | null>(null);

  useEffect(() => {
    PerformanceApi.get(perfId).then(setReport).catch(() => {});
  }, [perfId]);

  const del = async () => {
    if (!confirm("确定删除该性能分析记录?此操作不可恢复。")) return;
    try {
      await PerformanceApi.remove(perfId);
      router.push("/performance");
    } catch (e: any) { alert("删除失败: " + e.message); }
  };

  if (!report) return <div className="flex-1 p-8 text-ink-soft">加载中...</div>;

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push("/performance")}>
            <ArrowLeft size={14} /> 返回列表
          </Button>
          <Button variant="danger" size="sm" onClick={del}>
            <Trash2 size={14} /> 删除
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>分析 #{report.id}</CardTitle>
            <div className="text-sm text-ink-soft mt-2">{report.summary}</div>
            <div className="text-xs text-ink-dim mt-1">scope: <code className="text-ink-soft">{report.scope}</code></div>
          </CardHeader>
        </Card>

        {report.static_findings.length > 0 && (
          <Card>
            <CardHeader><CardTitle>静态扫描 ({report.static_findings.length})</CardTitle></CardHeader>
            <CardBody>
              <div className="space-y-2">
                {report.static_findings.map((s, i) => (
                  <div key={i} className="bg-bg-soft rounded p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{s.rule}</Badge>
                      <span className="text-xs text-ink-dim font-mono">{s.file}:{s.line}</span>
                    </div>
                    <pre className="text-xs text-ink-soft mt-1 font-mono whitespace-pre-wrap">{s.snippet}</pre>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {report.findings.length > 0 && (
          <Card>
            <CardHeader><CardTitle>AI 优化建议 ({report.findings.length})</CardTitle></CardHeader>
            <CardBody>
              <div className="space-y-3">
                {report.findings.map((f, i) => <OptimizationCard key={i} f={f} />)}
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

function OptimizationCard({ f }: { f: PerfFinding }) {
  return (
    <div className="border border-line rounded-md p-3">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Badge color={IMPACT_COLOR[f.impact] || "info"}>{f.impact} impact</Badge>
        <Badge>{f.category}</Badge>
        <span className="font-medium">{f.title}</span>
      </div>
      <div className="text-xs text-ink-dim mb-2 flex items-center gap-2">
        <FileCode size={12} />
        <code className="font-mono">{f.file}:{f.line || "?"}</code>
      </div>
      <pre className="bg-bg-soft rounded p-3 text-xs font-mono whitespace-pre-wrap text-ink">
        {f.optimization}
      </pre>
    </div>
  );
}