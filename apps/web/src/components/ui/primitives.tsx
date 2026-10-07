import { cva, type VariantProps } from "class-variance-authority";
import { Label as RLabel, Progress as RProgress, Separator as RSeparator, Switch as RSwitch } from "radix-ui";
import * as React from "react";
import { cn, TONE_CLASSES, type Tone } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-[13px] text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3", {
  variants: {
    tone: {
      ok: `${TONE_CLASSES.ok.bg} ${TONE_CLASSES.ok.text} ${TONE_CLASSES.ok.border}`,
      bad: `${TONE_CLASSES.bad.bg} ${TONE_CLASSES.bad.text} ${TONE_CLASSES.bad.border}`,
      warn: `${TONE_CLASSES.warn.bg} ${TONE_CLASSES.warn.text} ${TONE_CLASSES.warn.border}`,
      na: `${TONE_CLASSES.na.bg} ${TONE_CLASSES.na.text} ${TONE_CLASSES.na.border}`,
      brand: `${TONE_CLASSES.brand.bg} ${TONE_CLASSES.brand.text} ${TONE_CLASSES.brand.border}`,
      neutral: "bg-surface-2 text-muted border-border",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-lg border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-subtle transition-colors outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground placeholder:text-subtle outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/25",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.ComponentProps<typeof RLabel.Root>) {
  return <RLabel.Root className={cn("text-[13px] font-medium text-foreground", className)} {...props} />;
}

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  const autoId = React.useId();
  const child = React.Children.count(children) === 1 && React.isValidElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>(children) ? children : null;
  const controlId = child?.props.id ?? `${autoId}-control`;
  const noteId = `${autoId}-note`;
  const note = error || hint;
  const control = child
    ? React.cloneElement(child, {
        id: controlId,
        "aria-describedby": cn(child.props["aria-describedby"], note && noteId) || undefined,
        "aria-invalid": error ? true : child.props["aria-invalid"],
      })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={child ? controlId : undefined}>{label}</Label>
      {control}
      {error ? <p id={noteId} className="text-xs text-bad">{error}</p> : hint ? <p id={noteId} className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof RSwitch.Root>) {
  return (
    <RSwitch.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-surface-3 transition-colors data-[state=checked]:bg-brand disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <RSwitch.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  );
}

export function Progress({ value, tone = "brand", className }: { value: number; tone?: Tone; className?: string }) {
  return (
    <RProgress.Root className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} value={value}>
      <RProgress.Indicator
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out", TONE_CLASSES[tone].solid)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </RProgress.Root>
  );
}

export function Separator({ className, ...props }: React.ComponentProps<typeof RSeparator.Root>) {
  return <RSeparator.Root className={cn("shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:h-full", className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[10px] text-muted", className)}>
      {children}
    </kbd>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between text-[12px] font-medium uppercase tracking-wide text-subtle">
        {label}
        {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular tracking-tight", tone && TONE_CLASSES[tone].text)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong bg-surface/50 px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-xl bg-surface-2 text-muted [&_svg]:size-5">{icon}</div>}
      <div className="text-sm font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-sm text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-subtle">{children}</h2>
      {action}
    </div>
  );
}
