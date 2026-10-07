import { FlaskConical, Info, Receipt as ReceiptIcon } from "lucide-react";
import type { Receipt } from "@/lib/types";
import { formatMs } from "@/lib/utils";
import { EngineChip } from "../domain";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Stat } from "../ui/primitives";

const SOURCE_TONE = { serpapi: "brand", cache: "ok", fixture: "warn", missing: "bad" } as const;
const SOURCE_LABEL = { serpapi: "Paid search", cache: "Cache hit", fixture: "Replayed", missing: "No recording" } as const;

export function ReceiptView({ receipt }: { receipt: Receipt }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Engine calls" value={receipt.total_calls} />
        <Stat label="Paid searches" value={receipt.paid_searches} tone="brand" />
        <Stat label="Cache hits" value={receipt.cache_hits} tone="ok" sub="Free: same query within 24h" />
        <Stat label="Replayed" value={receipt.fixture_hits} tone={receipt.fixture_hits ? "warn" : undefined} sub={receipt.synthetic_hits ? `${receipt.synthetic_hits} synthetic samples` : "Recorded responses"} />
        <Stat label="Duration" value={formatMs(receipt.duration_ms)} />
      </div>
      {receipt.synthetic_hits > 0 && (
        <div className="flex gap-3 rounded-xl border border-warn-line bg-warn-soft p-4 text-[13px]">
          <FlaskConical className="size-4 shrink-0 text-warn" />
          <span>
            Some responses in this demo run are <b>synthetic samples</b> with fictional names, shaped like real SerpApi output. Record real fixtures with your key (<code className="font-mono text-xs">record-fixtures</code>) or switch to live mode to use real evidence.
          </span>
        </div>
      )}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ReceiptIcon className="size-4 text-brand" /> Search receipt
            </CardTitle>
            <CardDescription>Every SerpApi call this run made, in order. Keys are never recorded.</CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {Object.entries(receipt.engines).map(([e, n]) => (
              <EngineChip key={e} engine={e} count={n} />
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-subtle">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Engine</th>
                <th className="py-2 pr-3 font-semibold">Query</th>
                <th className="py-2 pr-3 font-semibold">Agent</th>
                <th className="py-2 pr-3 font-semibold">Source</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 text-right font-semibold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {receipt.records.map((r, i) => (
                <tr key={i} className="hover:bg-surface-2/50">
                  <td className="py-2 pr-3 tabular text-subtle">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <EngineChip engine={r.engine} />
                  </td>
                  <td className="max-w-xs truncate py-2 pr-3 font-mono text-xs">{r.query}</td>
                  <td className="py-2 pr-3 text-xs text-muted">{r.node_id}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={SOURCE_TONE[r.source]}>{SOURCE_LABEL[r.source]}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">{r.status}</td>
                  <td className="py-2 text-right tabular text-xs text-muted">{formatMs(r.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {receipt.records.length === 0 && (
            <p className="flex items-center gap-2 py-6 text-sm text-subtle">
              <Info className="size-4" /> This run made no searches.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
