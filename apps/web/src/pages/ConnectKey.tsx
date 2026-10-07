import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, EyeOff, FlaskConical, KeyRound, Lock, RefreshCw, ServerCog, ShieldCheck, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { ModeBadge, PageHeader } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Progress, Skeleton, Switch } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { keys, useKeyStatus, useMe } from "@/lib/queries";
import type { Account } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

function AccountCard({ account, masked, scope }: { account: Account; masked: string | null; scope: string | null }) {
  const total = account.searches_per_month ?? 0;
  const used = account.this_month_usage ?? 0;
  const pct = total ? (used / total) * 100 : 0;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-ok" /> Connected to SerpApi
            </CardTitle>
            <CardDescription>
              Key <span className="font-mono">{masked}</span> ·{" "}
              {scope === "workspace" ? "stored encrypted for this workspace" : scope === "env" ? "from the server environment" : "kept for this session only"}
            </CardDescription>
          </div>
          {account.plan_name && <Badge tone="brand">{account.plan_name}</Badge>}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-subtle">Searches left</div>
            <div className="mt-1 text-2xl font-semibold tabular">{formatNumber(account.total_searches_left ?? account.plan_searches_left)}</div>
          </div>
          <div>
            <div className="text-xs text-subtle">Used this month</div>
            <div className="mt-1 text-2xl font-semibold tabular">
              {formatNumber(used)}
              <span className="text-sm font-normal text-subtle"> / {formatNumber(total)}</span>
            </div>
            <Progress value={pct} className="mt-2" tone={pct > 85 ? "bad" : pct > 60 ? "warn" : "brand"} />
          </div>
          <div>
            <div className="text-xs text-subtle">Hourly rate limit</div>
            <div className="mt-1 text-2xl font-semibold tabular">{formatNumber(account.rate_limit_per_hour)}</div>
            <div className="text-xs text-subtle">{formatNumber(account.last_hour_searches ?? 0)} in the last hour</div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

const PROMISES = [
  { icon: EyeOff, title: "Never sent back to your browser", body: "After you save it, the UI only ever sees a masked form like ****3f9a." },
  { icon: Lock, title: "Session-only by default", body: "Held in server memory for this sign-in. Admins can opt in to AES-GCM encrypted storage." },
  { icon: ServerCog, title: "Scrubbed everywhere", body: "Redacted from logs, error messages, recorded fixtures and audit entries." },
  { icon: ShieldCheck, title: "Validated for free", body: "We check it with SerpApi's Account API, which does not use a search." },
];

export function ConnectKeyPage() {
  const me = useMe();
  const status = useKeyStatus();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  const isAdmin = me.data?.user.role === "admin";
  const isDemo = me.data?.user.is_demo;
  const s = status.data;

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/keys/serpapi", { api_key: key.trim(), remember });
      setKey("");
      toast.success("SerpApi key connected", { description: remember ? "Stored encrypted for your workspace." : "Kept for this session only." });
      await qc.invalidateQueries({ queryKey: keys.keyStatus });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not validate the key");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await api.del("/keys/serpapi");
    toast.success("Key removed");
    await qc.invalidateQueries({ queryKey: keys.keyStatus });
  };

  const refresh = async () => {
    await qc.fetchQuery({ queryKey: keys.keyStatus, queryFn: () => api.get("/keys/serpapi/status?refresh=true") });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Step 1"
        title="Connect SerpApi"
        description="Every agent gathers live evidence from Google engines through SerpApi. Bring your own key; we show the cost of every workflow before it runs."
        actions={<ModeBadge mode={s?.mode} />}
      />

      {status.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : s?.mode === "demo" ? (
        <Card>
          <CardContent className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn">
              <FlaskConical className="size-5" />
            </span>
            <div className="flex-1">
              <div className="font-semibold">This workspace runs in demo mode</div>
              <p className="mt-1 text-sm text-muted">
                Runs replay recorded SerpApi responses, so no key is needed and nothing is spent.
                {isDemo
                  ? me.data?.can_return
                    ? " Use “Back to my workspace” at the top to run live with your key."
                    : " Sign in to your own workspace to connect a key and run live."
                  : " An admin can switch to live mode in Settings."}
              </p>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => navigate({ to: "/" })}>Start checking</Button>
                {!isDemo && isAdmin && (
                  <Button variant="secondary" onClick={() => navigate({ to: "/settings" })}>
                    Open settings
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {s?.connected && s.account && <AccountCard account={s.account} masked={s.masked} scope={s.scope} />}
          {s?.connected && s.error && (
            <Card className="border-bad-line">
              <CardContent className="text-sm text-bad">{s.error}</CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="size-4 text-brand" /> {s?.connected ? "Replace key" : "Add your SerpApi key"}
                </CardTitle>
                <CardDescription>
                  Find it on your{" "}
                  <a className="text-brand hover:underline" href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener noreferrer">
                    SerpApi dashboard <ExternalLink className="inline size-3" />
                  </a>
                  .
                </CardDescription>
              </div>
              {s?.connected && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={refresh}>
                    <RefreshCw /> Refresh
                  </Button>
                  <Button variant="ghost" size="sm" className="text-bad" onClick={remove}>
                    <Trash2 /> Remove
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="API key">
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your 64-character key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="font-mono"
                />
              </Field>
              <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-2/60 p-3">
                <Switch checked={remember} onCheckedChange={setRemember} disabled={!isAdmin} className="mt-0.5" />
                <span>
                  <span className="block text-sm font-medium">Remember for this workspace</span>
                  <span className="block text-xs text-muted">
                    {isAdmin
                      ? "Encrypts the key with AES-GCM so scheduled watches can run while you are away."
                      : "Only admins can store a key. Yours stays in this session."}
                  </span>
                </span>
              </label>
              <Button onClick={save} loading={saving} disabled={key.trim().length < 20 || isDemo}>
                Validate & connect
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {PROMISES.map((p) => (
          <div key={p.title} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
            <p.icon className="mt-0.5 size-4 shrink-0 text-brand" />
            <div>
              <div className="text-sm font-medium">{p.title}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted">{p.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
