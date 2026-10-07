import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  CheckCircle2,
  CircleSlash,
  KeyRound,
  Lock,
  Mail,
  ScrollText,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/domain";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Skeleton, Switch } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { setLanguage } from "@/lib/i18n";
import { keys, useMe } from "@/lib/queries";
import type { Role } from "@/lib/types";
import { formatDateTime, humanize, timeAgo } from "@/lib/utils";

interface WsSettings {
  id: string;
  name: string;
  mode: "live" | "demo";
  run_budget: number;
  monthly_budget: number;
  llm_model: string | null;
  language: string;
  alert_telegram_chat: string | null;
  alert_email: string | null;
  retention_days: number;
  telegram_configured: boolean;
  smtp_configured: boolean;
  force_demo: boolean;
}

interface Member {
  id: string;
  email: string;
  name: string;
  role: Role;
  last_login_at: number | null;
  created_at: number;
}

interface AuditEntry {
  id: number;
  ts: number;
  user_email: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  ip: string | null;
}

const errMsg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function useSettingsData() {
  return useQuery({ queryKey: keys.settings, queryFn: () => api.get<WsSettings>("/settings") });
}

function WorkspaceTab({ s, canEdit }: { s: WsSettings; canEdit: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(s);
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm(s), [s]);
  const set = <K extends keyof WsSettings>(k: K, v: WsSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(s);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        mode: form.mode,
        run_budget: Number(form.run_budget),
        monthly_budget: Number(form.monthly_budget),
        llm_model: form.llm_model ?? "",
        language: form.language,
        retention_days: Number(form.retention_days),
        alert_telegram_chat: form.alert_telegram_chat || undefined,
        alert_email: form.alert_email || undefined,
      };
      const next = await api.put<WsSettings>("/settings", body);
      qc.setQueryData(keys.settings, next);
      await qc.invalidateQueries({ queryKey: keys.me });
      await qc.invalidateQueries({ queryKey: keys.keyStatus });
      if (next.language !== s.language) setLanguage(next.language);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(errMsg(err, "Could not save settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-brand" /> Workspace
              </CardTitle>
              <CardDescription>Name, language and data retention.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Workspace name">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label="Report language" hint="Verdict explanations can be generated in Hindi or Tamil.">
              <Select
                value={form.language}
                onValueChange={(v) => set("language", v)}
                disabled={!canEdit}
                options={[
                  { value: "en", label: "English" },
                  { value: "hi", label: "हिन्दी (Hindi)" },
                  { value: "ta", label: "தமிழ் (Tamil)" },
                ]}
              />
            </Field>
            <Field label="Keep runs for (days)" hint="Older runs and their evidence are purged daily.">
              <Input type="number" min={1} max={3650} value={form.retention_days} onChange={(e) => set("retention_days", Number(e.target.value))} disabled={!canEdit} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand" /> Mode & budgets
              </CardTitle>
              <CardDescription>Hard guardrails enforced on the server before any search runs.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <div className="text-[13px] font-medium">Live mode</div>
                <div className="text-xs text-muted">{s.force_demo ? "The server was started with --demo-only; live mode is locked." : "Off replays recorded responses and spends no searches."}</div>
              </div>
              <Switch checked={form.mode === "live"} onCheckedChange={(v) => set("mode", v ? "live" : "demo")} disabled={!canEdit || s.force_demo} />
            </div>
            <Field label={`Per-run search cap: ${form.run_budget}`}>
              <input
                type="range"
                min={1}
                max={60}
                value={form.run_budget}
                onChange={(e) => set("run_budget", Number(e.target.value))}
                disabled={!canEdit}
                className="w-full accent-[var(--brand)]"
                aria-label="Per-run search cap"
              />
            </Field>
            <Field label="Monthly search budget" hint="Runs are refused once the workspace reaches this many paid searches this month.">
              <Input type="number" min={0} max={100000} value={form.monthly_budget} onChange={(e) => set("monthly_budget", Number(e.target.value))} disabled={!canEdit} />
            </Field>
            <Field label="LLM for explanations and planning" hint="Optional, e.g. openai:gpt-5-mini. Rules decide verdicts either way.">
              <Input value={form.llm_model ?? ""} onChange={(e) => set("llm_model", e.target.value)} placeholder="Use server default" disabled={!canEdit} />
            </Field>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="size-4 text-brand" /> Watch alerts
            </CardTitle>
            <CardDescription>Where watches send a message when the evidence changes.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Telegram chat ID" hint={s.telegram_configured ? "Bot token configured on the server." : "Set TELEGRAM_BOT_TOKEN on the server to enable."}>
            <div className="relative">
              <Send className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input className="pl-9" value={form.alert_telegram_chat ?? ""} onChange={(e) => set("alert_telegram_chat", e.target.value)} placeholder="123456789" disabled={!canEdit} />
            </div>
          </Field>
          <Field label="Alert email" hint={s.smtp_configured ? "SMTP configured on the server." : "Set SMTP_HOST on the server to enable."}>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
              <Input className="pl-9" type="email" value={form.alert_email ?? ""} onChange={(e) => set("alert_email", e.target.value)} placeholder="alerts@company.in" disabled={!canEdit} />
            </div>
          </Field>
        </CardContent>
      </Card>
      {canEdit ? (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={save} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted">Only workspace admins can change these settings.</p>
      )}
    </div>
  );
}

function MembersTab({ isAdmin, myId }: { isAdmin: boolean; myId: string }) {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: keys.members, queryFn: () => api.get<{ members: Member[]; roles: Role[] }>("/members") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "analyst" as Role, password: "" });
  const [saving, setSaving] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.members });

  const add = async () => {
    setSaving(true);
    try {
      await api.post("/members", form);
      toast.success(`${form.email} added`);
      setOpen(false);
      setForm({ email: "", name: "", role: "analyst", password: "" });
      await refresh();
    } catch (err) {
      toast.error(errMsg(err, "Could not add member"));
    } finally {
      setSaving(false);
    }
  };
  const changeRole = async (id: string, role: string) => {
    try {
      await api.put(`/members/${id}`, { role });
      await refresh();
      toast.success("Role updated");
    } catch (err) {
      toast.error(errMsg(err, "Could not change role"));
    }
  };
  const remove = async (m: Member) => {
    try {
      await api.del(`/members/${m.id}`);
      await refresh();
      toast.success(`${m.email} removed`);
    } catch (err) {
      toast.error(errMsg(err, "Could not remove member"));
    }
  };
  const roleOpts = (members.data?.roles ?? ["viewer", "analyst", "admin"]).map((r) => ({ value: r, label: humanize(r) }));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-brand" /> Members & roles
          </CardTitle>
          <CardDescription>Viewers read reports. Analysts run workflows and spend searches. Admins manage keys, budgets and people.</CardDescription>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <UserPlus /> Add member
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {members.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="divide-y divide-border">
            {members.data?.members.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="grid size-9 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{(m.name || m.email).slice(0, 1).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13.5px] font-medium">
                    {m.name} {m.id === myId && <Badge>You</Badge>}
                  </div>
                  <div className="text-xs text-muted">
                    {m.email} · last seen {timeAgo(m.last_login_at)}
                  </div>
                </div>
                {isAdmin ? (
                  <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)} className="w-32" options={roleOpts} />
                ) : (
                  <Badge tone={m.role === "admin" ? "brand" : undefined}>{humanize(m.role)}</Badge>
                )}
                {isAdmin && m.id !== myId && (
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(m)} aria-label={`Remove ${m.email}`}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add a member" description="They sign in with this email and the temporary password you set.">
          <div className="space-y-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Role">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })} options={roleOpts} />
            </Field>
            <Field label="Temporary password" hint="At least 10 characters with a letter and a number.">
              <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={add} loading={saving} disabled={!form.email || form.name.length < 2 || form.password.length < 10}>
                Add member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SecurityTab() {
  const items = [
    { icon: KeyRound, title: "Your SerpApi key stays on the server", body: "It is never sent back to the browser, never logged and shown only as ****1234. By default it lives in your session only." },
    { icon: Lock, title: "Encrypted at rest when remembered", body: "Admins can opt in to store a workspace key, encrypted with AES-256-GCM using a key derived from APP_SECRET_KEY." },
    { icon: ShieldCheck, title: "Hardened sessions", body: "Argon2id password hashing, HttpOnly SameSite cookies, CSRF tokens on every write, and login rate limiting." },
    { icon: CircleSlash, title: "Safe by default", body: "Strict Content-Security-Policy, no inline scripts, SSRF protection on image URLs, and evidence text rendered as data only." },
    { icon: CheckCircle2, title: "Spend only what you approve", body: "Every run shows a search estimate first. Per-run and monthly caps are enforced on the server." },
    { icon: ScrollText, title: "Everything is audited", body: "Logins, key changes, runs, settings and role changes are recorded with who, when and from where." },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <Card key={it.title} className="p-5">
            <it.icon className="size-5 text-brand" />
            <div className="mt-3 font-semibold">{it.title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{it.body}</p>
          </Card>
        ))}
      </div>
      <Button variant="secondary" asChild>
        <Link to="/connect">
          <KeyRound /> Manage SerpApi key
        </Link>
      </Button>
    </div>
  );
}

function AuditTab() {
  const audit = useQuery({ queryKey: keys.audit, queryFn: () => api.get<{ entries: AuditEntry[] }>("/audit?limit=300") });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="size-4 text-brand" /> Audit log
          </CardTitle>
          <CardDescription>Most recent 300 security-relevant events in this workspace.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {audit.isLoading ? (
          <Skeleton className="h-60 w-full" />
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-wider text-subtle">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Who</th>
                <th className="py-2 pr-3 font-semibold">Action</th>
                <th className="py-2 pr-3 font-semibold">Target</th>
                <th className="py-2 pr-3 font-semibold">Detail</th>
                <th className="py-2 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {audit.data?.entries.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted">{formatDateTime(e.ts)}</td>
                  <td className="py-2 pr-3 text-xs">{e.user_email ?? "system"}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={/fail|denied|revoked|removed/.test(e.action) ? "bad" : /key/.test(e.action) ? "warn" : undefined}>{humanize(e.action)}</Badge>
                  </td>
                  <td className="max-w-[180px] truncate py-2 pr-3 font-mono text-[11px] text-muted">{e.target}</td>
                  <td className="max-w-xs truncate py-2 pr-3 font-mono text-[11px] text-subtle">{Object.keys(e.detail ?? {}).length ? JSON.stringify(e.detail) : ""}</td>
                  <td className="py-2 font-mono text-[11px] text-subtle">{e.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const search = useSearch({ strict: false }) as { tab?: string };
  const me = useMe();
  const settings = useSettingsData();
  const isAdmin = me.data?.user.role === "admin";
  const canEdit = isAdmin && !me.data?.user.is_demo;

  return (
    <div>
      <PageHeader title="Settings" description="Workspace configuration, people and security." />
      <Tabs defaultValue={search.tab ?? "workspace"}>
        <TabsList className="mb-5">
          <TabsTrigger value="workspace">
            <Building2 /> Workspace
          </TabsTrigger>
          <TabsTrigger value="members">
            <Users /> Members
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck /> Security
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="audit">
              <ScrollText /> Audit log
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="workspace">{settings.data ? <WorkspaceTab s={settings.data} canEdit={canEdit} /> : <Skeleton className="h-96 w-full rounded-xl" />}</TabsContent>
        <TabsContent value="members">
          <MembersTab isAdmin={canEdit} myId={me.data?.user.id ?? ""} />
        </TabsContent>
        <TabsContent value="security">
          <SecurityTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="audit">
            <AuditTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
