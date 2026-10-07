import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Mail, Radar, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { keys } from "@/lib/queries";
import type { RunInput, Workflow } from "@/lib/types";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/overlays";
import { Field, Input, Switch } from "./ui/primitives";
import { cn } from "@/lib/utils";

const INTERVALS = [
  { minutes: 60, label: "Hourly" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 1440, label: "Daily" },
  { minutes: 10080, label: "Weekly" },
];

export function WatchDialog({
  open,
  onOpenChange,
  workflow,
  input,
  defaultName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workflow: Workflow | null;
  input: RunInput;
  defaultName?: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(defaultName ?? "");
  const [interval, setFrequency] = useState(10080);
  const [telegram, setTelegram] = useState(false);
  const [email, setEmail] = useState(false);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!workflow) return;
    setSaving(true);
    try {
      await api.post("/watches", {
        name: name || defaultName || workflow.name,
        workflow,
        input,
        interval_minutes: interval,
        channels: [telegram && "telegram", email && "email"].filter(Boolean),
        run_now: true,
      });
      await qc.invalidateQueries({ queryKey: keys.watches });
      toast.success("Watch created", { description: "The first run started now. You will see changes after the next scheduled run." });
      onOpenChange(false);
      navigate({ to: "/watches" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not create the watch");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Watch this" description="Re-run this workflow on a schedule. We diff the evidence each time and alert you when something changes.">
        <div className="space-y-4">
          <Field label="Watch name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName || workflow?.name} />
          </Field>
          <div>
            <div className="mb-1.5 text-[13px] font-medium">Frequency</div>
            <div className="grid grid-cols-4 gap-2">
              {INTERVALS.map((i) => (
                <button
                  key={i.minutes}
                  onClick={() => setFrequency(i.minutes)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-[13px] transition-colors",
                    interval === i.minutes ? "border-brand bg-brand-soft text-foreground" : "border-border text-muted hover:border-border-strong",
                  )}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="text-[13px] font-medium">Alert channels</div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={telegram} onCheckedChange={setTelegram} />
              <Send className="size-4 text-muted" /> Telegram
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={email} onCheckedChange={setEmail} />
              <Mail className="size-4 text-muted" /> Email
            </label>
            <p className="text-xs text-subtle">Set the chat ID and email address in Settings → Alerts.</p>
          </div>
          <p className="text-xs text-muted">
            Each run spends about {workflow ? "the same searches as one manual run" : "-"}. Background runs use the workspace key, so an admin must store it encrypted (or set SERPAPI_API_KEY).
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={saving} disabled={!workflow}>
              <Radar /> Create watch
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
