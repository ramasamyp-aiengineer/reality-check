import { X } from "lucide-react";
import { Dialog as RDialog, DropdownMenu as RMenu, Select as RSelect, Tabs as RTabs, Tooltip as RTooltip } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = RDialog.Root;
export const DialogTrigger = RDialog.Trigger;
export const DialogClose = RDialog.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  wide,
  ...props
}: React.ComponentProps<typeof RDialog.Content> & { title: string; description?: string; wide?: boolean }) {
  return (
    <RDialog.Portal>
      <RDialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
      <RDialog.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl outline-none",
          wide ? "max-w-3xl" : "max-w-lg",
          className,
        )}
        {...props}
      >
        <div className="mb-4 pr-8">
          <RDialog.Title className="text-lg font-semibold tracking-tight">{title}</RDialog.Title>
          {description ? (
            <RDialog.Description className="mt-1 text-sm text-muted">{description}</RDialog.Description>
          ) : (
            <RDialog.Description className="sr-only">{title}</RDialog.Description>
          )}
        </div>
        {children}
        <RDialog.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Close">
          <X className="size-4" />
        </RDialog.Close>
      </RDialog.Content>
    </RDialog.Portal>
  );
}

export const TooltipProvider = RTooltip.Provider;

export function Tip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  if (!content) return <>{children}</>;
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-md border border-border bg-surface-3 px-2.5 py-1.5 text-xs text-foreground shadow-lg"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export const Menu = RMenu.Root;
export const MenuTrigger = RMenu.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof RMenu.Content>) {
  return (
    <RMenu.Portal>
      <RMenu.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-xl border border-border bg-surface p-1 shadow-xl", className)}
        {...props}
      />
    </RMenu.Portal>
  );
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof RMenu.Item>) {
  return (
    <RMenu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof RMenu.Label>) {
  return <RMenu.Label className={cn("px-2.5 py-1.5 text-xs text-subtle", className)} {...props} />;
}

export function MenuSeparator() {
  return <RMenu.Separator className="my-1 h-px bg-border" />;
}

export const Tabs = RTabs.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof RTabs.List>) {
  return <RTabs.List className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = RTabs.Content;

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
}: {
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RSelect.Trigger
        className={cn(
          "inline-flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm outline-none focus:border-brand data-[placeholder]:text-subtle disabled:opacity-60",
          className,
        )}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon>
          <ChevronDown className="size-4 text-muted" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={6} className="z-[60] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl">
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-surface-2"
              >
                <RSelect.ItemIndicator className="absolute left-2.5">
                  <Check className="size-4 text-brand" />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
