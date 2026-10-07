import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Dialog as RDialog } from "radix-ui";
import { Activity, Languages, Moon, Play, Plus, Search, Sparkles, Sun, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, setLanguage } from "@/lib/i18n";
import { useRuns, useWorkflows } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { Kbd } from "../ui/primitives";
import { NAV_GROUPS } from "./nav";

function Item({ onSelect, icon, children, hint }: { onSelect: () => void; icon: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted"
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {hint}
    </Command.Item>
  );
}

const groupClass =
  "px-1 py-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [theme, setTheme] = useTheme();
  const workflows = useWorkflows();
  const runs = useRuns(8);
  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const all = [...(workflows.data?.templates ?? []), ...(workflows.data?.saved ?? [])];

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
        <RDialog.Content className="fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl outline-none">
          <RDialog.Title className="sr-only">Command palette</RDialog.Title>
          <RDialog.Description className="sr-only">Search pages, workflows, runs and actions</RDialog.Description>
          <Command loop className="flex flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-muted" />
              <Command.Input autoFocus placeholder="Search pages, workflows, runs, actions..." className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[56vh] overflow-y-auto p-1">
              <Command.Empty className="py-10 text-center text-sm text-muted">No results.</Command.Empty>
              <Command.Group heading="Actions" className={groupClass}>
                <Item icon={<Plus />} onSelect={() => go(() => navigate({ to: "/studio" }))}>
                  New workflow in Studio
                </Item>
                <Item icon={<Sparkles />} onSelect={() => go(() => navigate({ to: "/studio", search: { ai: 1 } }))}>
                  Build a workflow with AI
                </Item>
                <Item icon={theme === "dark" ? <Sun /> : <Moon />} onSelect={() => go(() => setTheme(theme === "dark" ? "light" : "dark"))}>
                  Switch to {theme === "dark" ? "light" : "dark"} theme
                </Item>
                {LANGUAGES.map((l) => (
                  <Item key={l.code} icon={<Languages />} onSelect={() => go(() => setLanguage(l.code))}>
                    Language: {l.label}
                  </Item>
                ))}
              </Command.Group>
              <Command.Group heading="Pages" className={groupClass}>
                {NAV_GROUPS.flatMap((g) => g.items).map((item) => (
                  <Item
                    key={item.to}
                    icon={<item.icon />}
                    onSelect={() => go(() => navigate({ to: item.to }))}
                    hint={item.shortcut ? <span className="flex gap-1">{item.shortcut.split(" ").map((k) => <Kbd key={k}>{k}</Kbd>)}</span> : undefined}
                  >
                    {t(`nav.${item.key}`)}
                  </Item>
                ))}
              </Command.Group>
              {all.length > 0 && (
                <Command.Group heading="Workflows" className={groupClass}>
                  {all.map((w) => (
                    <Item key={w.id} icon={<Workflow />} onSelect={() => go(() => navigate({ to: "/studio", search: { template: w.id } }))} hint={<span className="text-xs text-subtle">~{w.estimate?.total ?? 0} searches</span>}>
                      {w.name}
                    </Item>
                  ))}
                  {all
                    .filter((w) => w.featured)
                    .map((w) => (
                      <Item key={`demo-${w.id}`} icon={<Play />} onSelect={() => go(() => navigate({ to: "/studio", search: { template: w.id, sample: 1 } }))}>
                        Run sample: {w.name}
                      </Item>
                    ))}
                </Command.Group>
              )}
              {(runs.data?.length ?? 0) > 0 && (
                <Command.Group heading="Recent runs" className={groupClass}>
                  {runs.data!.map((r) => (
                    <Item key={r.id} icon={<Activity />} onSelect={() => go(() => navigate({ to: "/runs/$runId", params: { runId: r.id } }))} hint={<span className="text-xs text-subtle">{r.verdict_status?.replace("_", " ").toLowerCase() ?? r.status}</span>}>
                      {r.workflow_name}
                    </Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
