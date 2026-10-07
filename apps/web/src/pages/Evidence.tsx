import { Link, useSearch } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Database, ExternalLink, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EngineChip, PageHeader } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Select } from "@/components/ui/overlays";
import { Badge, Card, EmptyState, Input, Skeleton } from "@/components/ui/primitives";
import { engineMeta } from "@/lib/icons";
import { useEvidence } from "@/lib/queries";
import type { Evidence } from "@/lib/types";
import { cn, hostOf, humanize, safeUrl, timeAgo } from "@/lib/utils";

const col = createColumnHelper<Evidence>();

export function EvidencePage() {
  const search = useSearch({ strict: false }) as { run?: string; engine?: string; q?: string };
  const [q, setQ] = useState(search.q ?? "");
  const [debounced, setDebounced] = useState(q);
  const [engine, setEngine] = useState(search.engine ?? "all");
  const [kind, setKind] = useState("all");
  const [runId, setRunId] = useState(search.run);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [open, setOpen] = useState<Evidence | null>(null);

  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(q), 300);
    return () => window.clearTimeout(h);
  }, [q]);

  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: "1000" });
    if (debounced) p.set("q", debounced);
    if (engine !== "all") p.set("engine", engine);
    if (kind !== "all") p.set("kind", kind);
    if (runId) p.set("run_id", runId);
    return p;
  }, [debounced, engine, kind, runId]);

  const evidence = useEvidence(params);
  const facets = evidence.data?.facets ?? [];
  const engines = Array.from(new Set(facets.map((f) => f.engine).filter(Boolean))) as string[];
  const kinds = Array.from(new Set(facets.map((f) => f.kind)));

  const columns = useMemo(
    () => [
      col.accessor("engine", {
        header: "Engine",
        cell: (c) => <EngineChip engine={c.getValue()} />,
        sortingFn: (a, b) => engineMeta(a.original.engine).label.localeCompare(engineMeta(b.original.engine).label),
      }),
      col.accessor("title", {
        header: "Evidence",
        cell: (c) => (
          <div className="max-w-xl">
            <button className="text-left font-medium hover:text-brand" onClick={() => setOpen(c.row.original)}>
              {c.getValue()}
            </button>
            {c.row.original.snippet && <div className="line-clamp-1 text-xs text-subtle">{c.row.original.snippet}</div>}
          </div>
        ),
      }),
      col.accessor((r) => r.source || hostOf(r.url), { id: "source", header: "Source", cell: (c) => <span className="text-muted">{c.getValue()}</span> }),
      col.accessor("kind", { header: "Kind", cell: (c) => <Badge className="capitalize">{humanize(c.getValue())}</Badge> }),
      col.accessor("workflow_name", {
        header: "Run",
        cell: (c) => (
          <Link to="/runs/$runId" params={{ runId: c.row.original.run_id ?? "" }} className="text-xs text-muted hover:text-brand">
            {c.getValue()}
          </Link>
        ),
      }),
      col.accessor("created_at", { header: "Collected", cell: (c) => <span className="whitespace-nowrap text-xs text-subtle">{timeAgo(c.getValue())}</span> }),
    ],
    [],
  );

  const table = useReactTable({
    data: evidence.data?.items ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div>
      <PageHeader title="Evidence explorer" description="Every fact any agent collected, with its engine, source and the run it belongs to. Text is displayed as data, never executed." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, snippets, sources" className="pl-9" />
        </div>
        <Select value={engine} onValueChange={setEngine} className="w-48" options={[{ value: "all", label: "All engines" }, ...engines.map((e) => ({ value: e, label: engineMeta(e).label }))]} />
        <Select value={kind} onValueChange={setKind} className="w-44" options={[{ value: "all", label: "All kinds" }, ...kinds.map((k) => ({ value: k, label: humanize(k) }))]} />
        {runId && (
          <Badge tone="brand" className="h-7">
            Run {runId.slice(-6)}
            <button onClick={() => setRunId(undefined)} aria-label="Clear run filter">
              <X />
            </button>
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted tabular">{evidence.data?.items.length ?? 0} items</span>
      </div>
      {evidence.isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (evidence.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={<Database />} title="No evidence yet" body="Evidence appears here as soon as a run completes." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-2/50 text-[11px] uppercase tracking-wider text-subtle">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((h) => (
                      <th key={h.id} className="px-4 py-2.5 font-semibold">
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === "asc" ? <ArrowUp className="size-3" /> : h.column.getIsSorted() === "desc" ? <ArrowDown className="size-3" /> : null}
                        </button>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-border">
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-2/50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted">
            <span className="tabular">
              Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        {open && (
          <DialogContent title={open.title} description={`${engineMeta(open.engine).label} · ${open.source || hostOf(open.url)}`} wide>
            <div className="space-y-4">
              {open.snippet && <p className="text-[13.5px] leading-relaxed text-muted">{open.snippet}</p>}
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge className="capitalize">{humanize(open.kind)}</Badge>
                <Badge>agent: {open.agent}</Badge>
                {open.published_at && <Badge>{open.published_at}</Badge>}
                <Badge className="font-mono">{open.id}</Badge>
              </div>
              {Object.keys(open.data ?? {}).length > 0 && (
                <pre className={cn("max-h-72 overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed")}>{JSON.stringify(open.data, null, 2)}</pre>
              )}
              {safeUrl(open.url) && (
                <Button asChild variant="secondary">
                  <a href={safeUrl(open.url)} target="_blank" rel="noopener noreferrer nofollow">
                    <ExternalLink /> Open source
                  </a>
                </Button>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
