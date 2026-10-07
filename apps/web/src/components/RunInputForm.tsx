import { Field, Input, Textarea } from "@/components/ui/primitives";
import type { Profile, RunInput } from "@/lib/types";

export function inputIsEmpty(input: RunInput, kind: string): boolean {
  if (kind === "profile") return !input.profile?.topic;
  return !input.text?.trim() && !input.image_url;
}

export function RunInputForm({
  kind,
  value,
  onChange,
  placeholder,
  showImage,
  compact,
}: {
  kind: string;
  value: RunInput;
  onChange: (v: RunInput) => void;
  placeholder?: string;
  showImage?: boolean;
  compact?: boolean;
}) {
  if (kind === "profile") {
    const p: Profile = value.profile ?? {};
    const set = (k: keyof Profile, v: unknown) => onChange({ ...value, profile: { ...p, [k]: v } });
    const competitors = Array.isArray(p.competitors) ? p.competitors.join(", ") : (p.competitors ?? "");
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Business name" className="col-span-2 sm:col-span-1">
          <Input value={p.business_name ?? ""} onChange={(e) => set("business_name", e.target.value)} placeholder="VoltRide Motors" />
        </Field>
        <Field label="Product or topic" className="col-span-2 sm:col-span-1">
          <Input value={p.topic ?? ""} onChange={(e) => set("topic", e.target.value)} placeholder="electric scooter" />
        </Field>
        <Field label="City">
          <Input value={p.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Bengaluru" />
        </Field>
        <Field label="Your price (Rs)">
          <Input
            inputMode="numeric"
            value={p.price == null ? "" : String(p.price)}
            onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, "") || null)}
            placeholder="109999"
          />
        </Field>
        {!compact && (
          <>
            <Field label="Selling point" className="col-span-2">
              <Input value={p.usp ?? ""} onChange={(e) => set("usp", e.target.value)} placeholder="150 km real range with doorstep service" />
            </Field>
            <Field label="Audience" className="col-span-2 sm:col-span-1">
              <Input value={p.audience ?? ""} onChange={(e) => set("audience", e.target.value)} placeholder="daily commuters" />
            </Field>
          </>
        )}
        <Field label="Competitors" hint="Comma separated, up to 5" className={compact ? "col-span-2" : "col-span-2 sm:col-span-1"}>
          <Input value={competitors} onChange={(e) => set("competitors", e.target.value)} placeholder="Ola Electric, Ather" />
        </Field>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Field label="Message, link or claim">
        <Textarea rows={compact ? 3 : 5} value={value.text ?? ""} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder={placeholder || "Paste the message to check"} />
      </Field>
      {showImage && (
        <Field label="Public image URL" hint="We only accept public http(s) addresses.">
          <Input value={value.image_url ?? ""} onChange={(e) => onChange({ ...value, image_url: e.target.value || null })} placeholder="https://..." />
        </Field>
      )}
    </div>
  );
}

export function normalizeInput(input: RunInput, kind: string): RunInput {
  if (kind !== "profile") return { text: input.text ?? "", image_url: input.image_url || null };
  const p = { ...(input.profile ?? {}) };
  if (typeof p.competitors === "string") p.competitors = p.competitors.split(",").map((c) => c.trim()).filter(Boolean);
  if (p.price === "" || p.price === undefined) p.price = null;
  else if (p.price !== null) p.price = Number(p.price);
  return { text: input.text ?? "", profile: p };
}
