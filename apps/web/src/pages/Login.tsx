import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, FlaskConical, Fingerprint, Lock, Mail, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BannerSlider } from "@/components/BannerSlider";
import type { Slide } from "@/components/slides";
import { Button } from "@/components/ui/button";
import { Field, Input, Separator, Skeleton } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { keys, useAuthState } from "@/lib/queries";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

const setupSchema = z.object({
  name: z.string().min(2, "At least 2 characters"),
  email: z.email("Enter a valid email"),
  workspace_name: z.string().min(2, "At least 2 characters"),
  password: z
    .string()
    .min(10, "At least 10 characters")
    .regex(/[a-z]/, "Add a lowercase letter")
    .regex(/[A-Z]/, "Add an uppercase letter")
    .regex(/\d/, "Add a number"),
});

type Target = { to: string; search?: Record<string, unknown> };

function strength(pw: string): number {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-subtle hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const submit = form.handleSubmit(async (values) => {
    try {
      await api.post("/auth/login", values);
      onDone();
    } catch (err) {
      form.setError("password", { message: err instanceof ApiError ? err.message : "Sign in failed" });
    }
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" placeholder="you@company.in" {...form.register("email")} />
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message}>
        <PasswordInput autoComplete="current-password" placeholder="••••••••••" {...form.register("password")} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        Sign in <ArrowRight />
      </Button>
    </form>
  );
}

function SetupForm({ onDone }: { onDone: () => void }) {
  const form = useForm<z.infer<typeof setupSchema>>({
    resolver: zodResolver(setupSchema),
    defaultValues: { name: "", email: "", workspace_name: "My workspace", password: "" },
  });
  const pw = form.watch("password");
  const s = strength(pw);
  const submit = form.handleSubmit(async (values) => {
    try {
      await api.post("/auth/setup", values);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Setup failed");
    }
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Your name" error={form.formState.errors.name?.message}>
          <Input autoComplete="name" {...form.register("name")} />
        </Field>
        <Field label="Workspace" error={form.formState.errors.workspace_name?.message}>
          <Input {...form.register("workspace_name")} />
        </Field>
      </div>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register("email")} />
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message} hint="10+ characters with upper and lower case and a number. Hashed with Argon2id.">
        <PasswordInput autoComplete="new-password" {...form.register("password")} />
      </Field>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < s ? (s <= 1 ? "bg-bad" : s <= 2 ? "bg-warn" : "bg-ok") : "bg-surface-3")} />
        ))}
      </div>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        Create admin account <ArrowRight />
      </Button>
    </form>
  );
}

export function LoginPage() {
  const state = useAuthState();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = useSearch({ strict: false }) as { next?: string };
  const [demoLoading, setDemoLoading] = useState(false);

  const finish = async (to?: Target) => {
    await qc.invalidateQueries({ queryKey: keys.me });
    await qc.invalidateQueries({ queryKey: keys.authState });
    if (to) navigate(to);
    else if (search.next && search.next.startsWith("/") && !search.next.startsWith("//") && !search.next.startsWith("/login")) navigate({ href: search.next });
    else navigate({ to: "/" });
  };

  const demo = async (to?: Target) => {
    setDemoLoading(true);
    try {
      await api.post("/auth/demo");
      await finish(to);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Demo sign-in failed");
    } finally {
      setDemoLoading(false);
    }
  };

  const onSlide = (slide: Slide) => {
    const to: Target = { to: "/studio", search: slide.templateId ? { template: slide.templateId, sample: 1 } : { ai: 1 } };
    if (state.data?.signed_in) navigate(to);
    else if (state.data?.allow_demo) void demo(to);
    else toast.info("Sign in to run this workflow");
  };

  const s = state.data;
  return (
    <div className="flex min-h-screen bg-background">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-border bg-surface/40 p-10 xl:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-brand text-white">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <div className="text-base font-semibold tracking-tight">Reality Check</div>
            <div className="text-xs text-subtle">Evidence agents powered by SerpApi</div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-4xl">
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-2 text-3xl font-semibold tracking-tight">
            Verify before you trust, buy, invest or launch.
          </motion.h1>
          <p className="mb-6 max-w-2xl text-[15px] text-muted">
            Reusable agents, each backed by a live Google engine through SerpApi, composed into workflows you can see, cost and approve.
          </p>
          <BannerSlider onRun={onSlide} />
        </div>
        <div className="flex items-center gap-5 text-xs text-subtle">
          <span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" /> Argon2id, CSRF, strict cookies</span>
          <span className="inline-flex items-center gap-1.5"><Fingerprint className="size-3.5" /> Your SerpApi key stays server-side</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Rules decide, the LLM only explains</span>
        </div>
      </div>

      <div className="flex w-full items-center justify-center p-6 xl:w-[520px] xl:shrink-0">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 xl:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-brand text-white">
              <ShieldCheck className="size-5" />
            </span>
            <span className="text-base font-semibold">Reality Check</span>
          </div>
          {!s ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold tracking-tight">{s.needs_setup ? "Set up your workspace" : "Welcome back"}</h2>
              <p className="mb-7 mt-1.5 text-sm text-muted">
                {s.needs_setup ? "Create the first admin account. You can invite your team later." : "Sign in to your Reality Check workspace."}
              </p>
              {s.needs_setup ? <SetupForm onDone={() => finish({ to: "/connect" })} /> : <LoginForm onDone={() => finish()} />}

              {s.providers.length > 0 && !s.needs_setup && (
                <div className="mt-4 grid gap-2">
                  {s.providers.map((p) => (
                    <Button key={p} variant="secondary" asChild>
                      <a href={`/api/auth/oauth/${p}/start`}>
                        <Mail /> Continue with {p === "github" ? "GitHub" : "Google"}
                      </a>
                    </Button>
                  ))}
                </div>
              )}

              {s.allow_demo && (
                <>
                  <div className="my-6 flex items-center gap-3 text-xs text-subtle">
                    <Separator className="flex-1" /> or <Separator className="flex-1" />
                  </div>
                  <button
                    onClick={() => demo()}
                    disabled={demoLoading}
                    className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:border-brand-line hover:bg-brand-soft disabled:opacity-60"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warn-soft text-warn">
                      <FlaskConical className="size-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold">Try the demo workspace</span>
                      <span className="block text-xs text-muted">Recorded SerpApi evidence. No key, no sign-up, nothing spent.</span>
                    </span>
                    <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </button>
                </>
              )}
              <p className="mt-8 text-center text-[11px] leading-relaxed text-subtle">
                Reality Check reports evidence status, never accusations. Always confirm with official sources before acting.
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
