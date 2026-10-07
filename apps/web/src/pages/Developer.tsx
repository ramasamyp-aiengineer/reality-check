import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Code2, Copy, Cpu, KeyRound, Plug, Plus, ShieldCheck, Terminal, Trash2, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Skeleton } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { keys, useMe } from "@/lib/queries";
import { copyText, timeAgo } from "@/lib/utils";

interface McpConfig {
  claude_desktop: Record<string, unknown>;
  cursor: Record<string, unknown>;
  tools: string[];
  rest_example: string;
}

interface Token {
  id: string;
  name: string;
  last4: string;
  created_at: number;
  last_used_at: number | null;
}

const TOOL_DOCS: Record<string, string> = {
  list_agents: "List every evidence agent with the engines it uses and what it proves.",
  list_workflows: "List the built-in workflow templates.",
  run_agent: "Run one agent on a message or claim and return its signals and evidence.",
  verify_claim: "Check a forwarded message or claim end to end and return a verdict with evidence.",
  market_pulse: "Build a grounded market brief and ad pack for a business and product.",
  run_workflow: "Run any template workflow by id.",
};

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface-2">
      {label && <div className="border-b border-border px-4 py-2 font-mono text-[11px] text-subtle">{label}</div>}
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute right-2 top-2"
        aria-label="Copy"
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {copied ? <Check className="text-ok" /> : <Copy />}
      </Button>
      <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed">{code}</pre>
    </div>
  );
}

function TokensCard() {
  const qc = useQueryClient();
  const me = useMe();
  const tokens = useQuery({ queryKey: keys.tokens, queryFn: () => api.get<{ tokens: Token[] }>("/tokens"), select: (d) => d.tokens });
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const canCreate = me.data && me.data.user.role !== "viewer" && !me.data.user.is_demo;

  const create = async () => {
    setCreating(true);
    try {
      const r = await api.post<{ token: string }>("/tokens", { name });
      setFresh(r.token);
      setName("");
      await qc.invalidateQueries({ queryKey: keys.tokens });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create token");
    } finally {
      setCreating(false);
    }
  };
  const revoke = async (t: Token) => {
    try {
      await api.del(`/tokens/${t.id}`);
      await qc.invalidateQueries({ queryKey: keys.tokens });
      toast.success(`Revoked ${t.name}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not revoke token");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-brand" /> Personal API tokens
          </CardTitle>
          <CardDescription>Use the REST API from scripts and CI. Tokens carry your role and are stored only as a hash.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {canCreate ? (
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name, e.g. nightly-watch" aria-label="Token name" />
            <Button onClick={create} loading={creating} disabled={name.trim().length < 2}>
              <Plus /> Create
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted">{me.data?.user.is_demo ? "Tokens are disabled for the demo account." : "Analysts and admins can create tokens."}</p>
        )}
        {tokens.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !tokens.data?.length ? (
          <EmptyState icon={<KeyRound />} title="No tokens yet" />
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {tokens.data.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted">
                    rc_••••{t.last4} · created {timeAgo(t.created_at)} · {t.last_used_at ? `used ${timeAgo(t.last_used_at)}` : "never used"}
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => revoke(t)} aria-label={`Revoke ${t.name}`}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={Boolean(fresh)} onOpenChange={(v) => !v && setFresh(null)}>
        <DialogContent title="Copy your token now" description="For your security it will not be shown again.">
          <div className="space-y-4">
            <CodeBlock code={fresh ?? ""} />
            <div className="flex justify-end">
              <Button onClick={() => setFresh(null)}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const LLM_ROLES: [string, string][] = [
  ["Reads the message", "Pulls out the product, app, company, price and red flags."],
  ["Plans the workflow", "Turns a free-text request into a graph of agents."],
  ["Explains the verdict", "Plain English, Hindi or Tamil, from the rule findings only."],
  ["Drafts ad copy", "Ad Studio copy, then checked against the evidence."],
];

const SLMS: [string, string, string][] = [
  ["qwen2.5:3b", "~2 GB", "Fast on a laptop CPU. Good default."],
  ["qwen2.5:7b", "~4.7 GB", "Better wording, strong in Hindi and Tamil."],
  ["llama3.2:3b", "~2 GB", "Small and quick."],
  ["phi4-mini", "~2.5 GB", "Reliable structured output."],
];

const OLLAMA = `# 1. Install Ollama (Windows: winget install Ollama.Ollama, macOS: brew install ollama)
ollama pull qwen2.5:3b

# 2. .env
LLM_MODEL=ollama:qwen2.5:3b
# OLLAMA_BASE_URL defaults to http://localhost:11434/v1

# 3. Restart
uv run reality-check --demo`;

const OPENAI_COMPAT = `# LM Studio, llama.cpp (llama-server), vLLM or any OpenAI-compatible server
LLM_MODEL=openai:qwen2.5-3b-instruct      # the model name your server reports
OPENAI_BASE_URL=http://localhost:1234/v1   # LM Studio; llama-server uses :8080/v1
OPENAI_API_KEY=local                       # any non-empty value for local servers`;

const HOSTED = `# Open-weight models on a hosted API (fast, no local GPU needed)
LLM_MODEL=groq:llama-3.3-70b-versatile
GROQ_API_KEY=...

# Closed models work the same way
LLM_MODEL=google-gla:gemini-2.5-flash     # GEMINI_API_KEY
LLM_MODEL=openai:gpt-4.1-mini             # OPENAI_API_KEY`;

function LlmCard() {
  const me = useMe();
  const label = me.data?.workspace.llm;
  const rulesOnly = !label || label.startsWith("rules");
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="size-4 text-brand" /> Language model, including open-source and local
          </CardTitle>
          <CardDescription>
            Rules decide every verdict. A language model only handles language, so a small open-source model running on your own machine is enough, and
            nothing but SerpApi searches leaves it.
          </CardDescription>
        </div>
        <Badge tone={rulesOnly ? "neutral" : "ok"}>{rulesOnly ? "Rules only" : label}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {LLM_ROLES.map(([title, body]) => (
            <div key={title} className="rounded-lg border border-border p-3">
              <div className="text-[13px] font-medium">{title}</div>
              <div className="mt-0.5 text-xs text-muted">{body}</div>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-ok-line bg-ok-soft p-3 text-xs text-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
          <span>
            The model never sees your SerpApi key, cannot start searches and cannot change a verdict. Search results reach it wrapped as untrusted data. If it
            is slow, offline or returns bad output, every step falls back to the built-in rules and the run still completes.
          </span>
        </div>
        <Tabs defaultValue="ollama">
          <TabsList className="mb-3">
            <TabsTrigger value="ollama">Local with Ollama</TabsTrigger>
            <TabsTrigger value="compat">LM Studio / llama.cpp</TabsTrigger>
            <TabsTrigger value="hosted">Hosted</TabsTrigger>
          </TabsList>
          <TabsContent value="ollama" className="space-y-3">
            <CodeBlock label="terminal + .env" code={OLLAMA} />
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-subtle">
                  <tr>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium">Download</th>
                    <th className="px-3 py-2 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {SLMS.map(([name, size, why]) => (
                    <tr key={name} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-brand">{name}</td>
                      <td className="px-3 py-2 tabular text-muted">{size}</td>
                      <td className="px-3 py-2 text-muted">{why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-subtle">Pick a model that supports tool calling in Ollama; structured output relies on it (for example, gemma3 does not).</p>
          </TabsContent>
          <TabsContent value="compat">
            <CodeBlock label=".env" code={OPENAI_COMPAT} />
          </TabsContent>
          <TabsContent value="hosted">
            <CodeBlock label=".env" code={HOSTED} />
          </TabsContent>
        </Tabs>
        <p className="text-xs text-subtle">
          Admins can also set a different model for one workspace in <b>Settings</b>, which overrides <code className="font-mono">LLM_MODEL</code>.
        </p>
      </CardContent>
    </Card>
  );
}

export function DeveloperPage() {
  const mcp = useQuery({ queryKey: keys.mcp, queryFn: () => api.get<McpConfig>("/developer/mcp") });
  const origin = window.location.origin;
  const curlRun = `curl -X POST ${origin}/api/runs \\
  -H "Authorization: Bearer rc_..." \\
  -H "Content-Type: application/json" \\
  -d '{"workflow_id": "loan_forward_check", "approved": true,
       "input": {"text": "Instant loan in 5 minutes, no CIBIL check. Download QuickCash Pro"}}'`;
  const curlGet = `curl -H "Authorization: Bearer rc_..." ${origin}/api/runs/<run_id>`;
  const sse = `curl -N -H "Authorization: Bearer rc_..." ${origin}/api/runs/<run_id>/events`;

  return (
    <div>
      <PageHeader
        title="Developer"
        description="Use every evidence agent from Claude, Cursor or any MCP client, or call the REST API with a personal token."
        actions={
          <Button variant="secondary" asChild>
            <a href="/api/docs" target="_blank" rel="noopener noreferrer">
              <Code2 /> OpenAPI docs
            </a>
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="size-4 text-brand" /> MCP server
                </CardTitle>
                <CardDescription>The same agents, exposed as tools over stdio. The server reads your SerpApi key from its own environment, never from this app.</CardDescription>
              </div>
              <Badge tone="brand">
                <Bot /> stdio
              </Badge>
            </CardHeader>
            <CardContent>
              {mcp.isLoading || !mcp.data ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <Tabs defaultValue="claude">
                  <TabsList className="mb-3">
                    <TabsTrigger value="claude">Claude Desktop</TabsTrigger>
                    <TabsTrigger value="cursor">Cursor</TabsTrigger>
                    <TabsTrigger value="cli">Command line</TabsTrigger>
                  </TabsList>
                  <TabsContent value="claude">
                    <CodeBlock label="claude_desktop_config.json" code={JSON.stringify(mcp.data.claude_desktop, null, 2)} />
                  </TabsContent>
                  <TabsContent value="cursor">
                    <CodeBlock label=".cursor/mcp.json" code={JSON.stringify(mcp.data.cursor, null, 2)} />
                  </TabsContent>
                  <TabsContent value="cli">
                    <CodeBlock label="terminal" code={"# Demo mode needs no key and spends nothing\nRC_MODE=demo uv run reality-check-mcp\n\n# Live mode, capped at 10 searches per call\nSERPAPI_API_KEY=... RC_MAX_SEARCHES=10 uv run reality-check-mcp"} />
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="size-4 text-brand" /> REST API
                </CardTitle>
                <CardDescription>Start a run, stream its events and fetch the result. Runs still require explicit approval.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <CodeBlock label="Start a run" code={curlRun} />
              <CodeBlock label="Stream live events (Server-Sent Events)" code={sse} />
              <CodeBlock label="Fetch the verdict and evidence" code={curlGet} />
            </CardContent>
          </Card>
          <LlmCard />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="size-4 text-brand" /> MCP tools
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(mcp.data?.tools ?? Object.keys(TOOL_DOCS)).map((t) => (
                <div key={t} className="rounded-lg border border-border p-3">
                  <code className="font-mono text-[12.5px] font-semibold text-brand">{t}</code>
                  <p className="mt-1 text-xs text-muted">{TOOL_DOCS[t] ?? ""}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <TokensCard />
          <Field label="Base URL" hint="Point scripts and agents here.">
            <Input readOnly value={`${origin}/api`} className="font-mono text-xs" />
          </Field>
        </div>
      </div>
    </div>
  );
}
