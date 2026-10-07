import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Cpu, ExternalLink, FlaskConical, Gavel, Play, Search, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EngineChip, PageHeader } from "@/components/domain";
import { CATEGORY_STYLE } from "@/components/flow/AgentNode";
import { inputIsEmpty, normalizeInput, RunInputForm } from "@/components/RunInputForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Badge, Card, Input, Skeleton, Switch } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { agentIcon, engineMeta } from "@/lib/icons";
import { keys, useAgents, useEngines, useKeyStatus } from "@/lib/queries";
import type { AgentSpec, RunInput } from "@/lib/types";
import { cn, humanize, safeUrl } from "@/lib/utils";

const PROFILE_AGENTS = new Set(["demand_trend", "price_reality", "advertiser_identity", "market_brief", "ad_agent"]);
const CATEGORY_ORDER = ["core", "ground_truth", "evidence", "synthesis"] as const;

function TryDialog({ agent, onClose }: { agent: AgentSpec | null; onClose: () => void }) {
  const navigate = useNavigate();
  const key = useKeyStatus();
  const [kind, setKind] = useState<"text" | "profile">("text");
  const [input, setInput] = useState<RunInput>({ text: "" });
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (agent && agent.id !== lastId) {
    setLastId(agent.id);
    setKind(PROFILE_AGENTS.has(agent.id) ? "profile" : "text");
    setInput({ text: "" });
    setApproved(false);
  }
  const blocked = key.data?.mode === "live" && !key.data.connected;
  const start = async () => {
    if (!agent) return;
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>(`/agents/${agent.id}/try`, { input: normalizeInput(input, kind), approved: true });
      onClose();
      navigate({ to: "/runs/$runId", params: { runId: r.id } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start the agent");
    } finally {
      setBusy(false);
    }
  };
  const Icon = agent ? agentIcon(agent.icon) : Cpu;
  return (
    <Dialog open={Boolean(agent)} onOpenChange={(v) => !v && onClose()}>
      {agent && (
        <DialogContent title={`Try ${agent.title}`} description="Runs this single agent behind the intent reader, so you can see exactly what it proves.">
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
              <div className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                <Icon className="size-4.5" />
              </div>
              <div className="min-w-0 flex-1 text-xs text-muted">{agent.proves}</div>
              <Badge tone="brand">~{agent.est_searches} searches</Badge>
            </div>
            <Tabs value={kind} onValueChange={(v) => setKind(v as "text" | "profile")}>
              <TabsList>
                <TabsTrigger value="text">Message or claim</TabsTrigger>
                <TabsTrigger value="profile">Business profile</TabsTrigger>
              </TabsList>
            </Tabs>
            <RunInputForm kind={kind} value={input} onChange={setInput} compact showImage={agent.id === "visual_provenance"} />
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-[13px]">
              <span>
                I approve up to <b>{agent.est_searches + 1}</b> SerpApi searches for this test
              </span>
              <Switch checked={approved} onCheckedChange={setApproved} />
            </label>
            {blocked && <p className="text-xs text-bad">Connect a SerpApi key or switch the workspace to demo mode first.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={start} loading={busy} disabled={!approved || blocked || inputIsEmpty(input, kind)}>
                <Play /> Run agent
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function AgentCard({ a, onTry, i }: { a: AgentSpec; onTry: (a: AgentSpec) => void; i: number }) {
  const Icon = agentIcon(a.icon);
  const style = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE.evidence;
  const tryable = !["intent", "verdict", "watch"].includes(a.id) && a.category !== "synthesis";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
      <Card className="group flex h-full flex-col p-5 transition-shadow hover:shadow-lg">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${style.accent} 14%, transparent)`, color: style.accent }}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{a.title}</div>
            <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: style.accent }}>
              {style.label}
            </div>
          </div>
          {a.est_searches > 0 && <Badge>~{a.est_searches}</Badge>}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">{a.description}</p>
        {a.proves && (
          <div className="mt-3 flex gap-2 rounded-lg bg-surface-2 p-2.5 text-xs">
            <ShieldCheck className="size-3.5 shrink-0 text-ok" />
            <span>{a.proves}</span>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1">
          {a.engines.map((e) => (
            <EngineChip key={e} engine={e} />
          ))}
        </div>
        <div className="mt-3 space-y-1 font-mono text-[10.5px] text-subtle">
          <div>
            in: {a.consumes.join(", ") || "input"}
          </div>
          <div>
            out: {a.produces.join(", ")}
          </div>
        </div>
        <div className="mt-auto flex justify-end pt-4">
          {tryable && (
            <Button size="sm" variant="secondary" onClick={() => onTry(a)}>
              <FlaskConical /> Try it
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

export function AgentsPage() {
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const agents = useAgents();
  const engines = useEngines();
  const rules = useQuery({ queryKey: keys.rules, queryFn: () => api.get<{ rules: { id: string; title: string; requires: string[]; description: string }[] }>("/rules"), select: (d) => d.rules });
  const [q, setQ] = useState("");
  const [trying, setTrying] = useState<AgentSpec | null>(null);
  const titleOf = useMemo(() => Object.fromEntries((agents.data ?? []).map((a) => [a.id, a.title])), [agents.data]);
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());

  return (
    <div>
      <PageHeader
        title="Agents & Engine Atlas"
        description="Reusable evidence agents, the SerpApi engines behind them and the deterministic rules that turn their signals into a verdict."
        actions={
          <Button onClick={() => navigate({ to: "/studio" })}>
            Compose a workflow <ArrowRight />
          </Button>
        }
      />
      <Tabs defaultValue={search.tab ?? "agents"}>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="agents">
              <Cpu /> Agents {agents.data && <span className="text-subtle">{agents.data.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="engines">
              <Search /> Engine Atlas {engines.data && <span className="text-subtle">{engines.data.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="rules">
              <Gavel /> Verdict rules
            </TabsTrigger>
          </TabsList>
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="pl-9" aria-label="Filter" />
          </div>
        </div>

        <TabsContent value="agents">
          {agents.isLoading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
            <div className="space-y-8">
              {CATEGORY_ORDER.map((cat) => {
                const list = (agents.data ?? []).filter((a) => a.category === cat && match(`${a.title} ${a.description} ${a.engines.join(" ")}`));
                if (!list.length) return null;
                return (
                  <section key={cat}>
                    <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-subtle">{CATEGORY_STYLE[cat]?.label ?? humanize(cat)}</h2>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {list.map((a, i) => (
                        <AgentCard key={a.id} a={a} i={i} onTry={setTrying} />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="engines">
          {engines.isLoading ? (
            <Skeleton className="h-96 w-full rounded-xl" />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(engines.data ?? [])
                .filter((e) => match(`${e.title} ${e.engine} ${e.proves}`))
                .map((e, i) => {
                  const m = engineMeta(e.engine);
                  const Icon = m.icon;
                  return (
                    <motion.div key={e.engine} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                      <Card className="relative flex h-full flex-col overflow-hidden p-5">
                        <div className="absolute inset-x-0 top-0 h-1" style={{ background: m.color }} />
                        <div className="flex items-center gap-3">
                          <div className="grid size-10 place-items-center rounded-xl" style={{ background: `color-mix(in oklab, ${m.color} 14%, transparent)`, color: m.color }}>
                            <Icon className="size-5" />
                          </div>
                          <div>
                            <div className="font-semibold">{e.title}</div>
                            <code className="font-mono text-[11px] text-subtle">engine={e.engine}</code>
                          </div>
                        </div>
                        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-subtle">What it proves</div>
                        <p className="mt-1 text-[13px] leading-relaxed">{e.proves}</p>
                        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-subtle">Used by</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.agents.map((a) => (
                            <Badge key={a}>{titleOf[a] ?? a}</Badge>
                          ))}
                        </div>
                        <div className="mt-auto pt-4">
                          {safeUrl(e.docs) && (
                            <a href={safeUrl(e.docs)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                              <BookOpen className="size-3.5" /> SerpApi docs <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rules">
          <Card className="divide-y divide-border">
            <div className="flex gap-3 bg-surface-2/50 p-4 text-[13px] text-muted">
              <Gavel className="size-4 shrink-0 text-brand" />
              Rules decide the verdict. Language models only explain it, so the same evidence always gives the same answer.
            </div>
            {(rules.data ?? [])
              .filter((r) => match(`${r.title} ${r.description}`))
              .map((r) => (
                <div key={r.id} className="grid gap-2 p-4 md:grid-cols-[260px_1fr_auto] md:items-center">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <code className="font-mono text-[11px] text-subtle">{r.id}</code>
                  </div>
                  <p className="text-[13px] text-muted">{r.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {r.requires.map((s) => (
                      <Badge key={s} className={cn("font-mono text-[10.5px]")}>
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
          </Card>
        </TabsContent>
      </Tabs>
      <TryDialog agent={trying} onClose={() => setTrying(null)} />
    </div>
  );
}
