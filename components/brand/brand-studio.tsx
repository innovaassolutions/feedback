"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/client/api";
import { APPROVED_FONTS, MIN_CONTRAST, contrastPairs, previewCss, type ModeTokens, type ThemeTokens } from "@/lib/theme/tokens";
import { Badge, Button, Card, Field, Notice, cx, inputClass } from "@/components/ui";
import { SpreadChart } from "@/components/dashboard/charts";

type Theme = { id: string; status: string; tokens: ThemeTokens; created_at: string; approved_at: string | null; source: string; logo_url: string | null };

const COLOR_TOKENS: Array<keyof Omit<ModeTokens, "chart">> = ["primary", "accent", "background", "surface", "text", "muted"];

function Preview({ tokens, mode, logoUrl, name }: { tokens: ThemeTokens; mode: "light" | "dark"; logoUrl: string | null; name: string }) {
  const selector = `[data-preview="${mode}"]`;
  return (
    <div data-preview={mode} data-testid={`preview-${mode}`} className="overflow-hidden rounded-theme border border-border bg-background text-text">
      <style dangerouslySetInnerHTML={{ __html: previewCss(tokens, mode, selector) }} />
      <div className="flex items-center gap-3 bg-primary px-4 py-3 text-on-primary" data-testid="preview-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-auto rounded-sm bg-surface p-0.5" /> : null}
        <span className="font-heading font-semibold">{name}</span>
        <span className="ml-auto text-sm">Sessions · Dashboard</span>
      </div>
      <div className="space-y-4 p-4" style={{ fontFamily: "var(--t-font-body)" }}>
        <p className="text-xs uppercase tracking-wide text-muted">{mode === "light" ? "Light mode" : "Dark mode"}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-theme border border-border bg-surface p-3" data-testid="preview-tile">
            <p className="text-sm text-muted">Able to apply</p>
            <p className="text-2xl font-semibold">5 of 7</p>
          </div>
          <div className="space-y-2 rounded-theme border border-border bg-surface p-3" data-testid="preview-chat">
            <div className="ml-auto w-fit rounded-theme bg-primary px-3 py-1 text-sm text-on-primary">About right</div>
            <div className="w-fit rounded-theme border border-border bg-background px-3 py-1 text-sm">What was most useful?</div>
          </div>
        </div>
        <SpreadChart id={`preview-${mode}`} title="Pace" data={[{ label: "Too slow", count: 1 }, { label: "About right", count: 4 }, { label: "Too fast", count: 2 }]} color={1} />
        <div className="flex gap-2">
          <span className="rounded-theme bg-primary px-3 py-1.5 text-sm text-on-primary">Give feedback</span>
          <span className="rounded-theme bg-accent px-3 py-1.5 text-sm text-on-accent">Highlight</span>
          <a className="text-sm">A link</a>
        </div>
      </div>
    </div>
  );
}

export function BrandStudio({ organizationId, orgName, logoUrl, live, proposal, history }: { organizationId: string; orgName: string; logoUrl: string | null; live: Theme | null; proposal: Theme | null; history: Theme[] }) {
  const router = useRouter();
  const start = proposal ?? live;
  const [editing, setEditing] = useState<{ id: string; tokens: ThemeTokens; logo_url: string | null } | null>(start ? { id: start.id, tokens: start.tokens, logo_url: start.logo_url } : null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pairs = useMemo(() => (editing ? contrastPairs(editing.tokens) : []), [editing]);
  const failing = pairs.filter((p) => p.ratio < MIN_CONTRAST);

  async function upload(form: FormData) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await api<{ theme: { id: string; tokens: ThemeTokens; logo_path: string } }>("POST", `/api/organizations/${organizationId}/themes`, form);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${res.data.theme.logo_path}`;
    setEditing({ id: res.data.theme.id, tokens: res.data.theme.tokens, logo_url: url });
    setMessage("The Brand designer proposed this theme. Check the preview, adjust anything, then approve it.");
    router.refresh();
  }

  async function approve(id: string, tokens: ThemeTokens) {
    setBusy(true);
    setError(null);
    const res = await api("POST", `/api/themes/${id}/approval`, { tokens });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMessage("The theme is live. Every page in the organization uses it from the next page load.");
    router.refresh();
  }

  function setColor(mode: "light" | "dark", token: string, value: string, chartIndex?: number) {
    setEditing((e) => {
      if (!e) return e;
      const next: ThemeTokens = JSON.parse(JSON.stringify(e.tokens));
      if (chartIndex !== undefined) next[mode].chart[chartIndex] = value;
      else (next[mode] as unknown as Record<string, string>)[token] = value;
      return { ...e, tokens: next };
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Logo</h2>
        <form action={upload} className="flex flex-wrap items-end gap-3">
          <Field label="Logo file" hint="PNG or SVG, up to 2 MB">
            <input name="logo" type="file" accept=".png,.svg,image/png,image/svg+xml" required className={inputClass} />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? "Working…" : "Propose a theme from this logo"}</Button>
        </form>
      </Card>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}

      {editing ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2" data-testid="theme-preview">
            <Preview tokens={editing.tokens} mode="light" logoUrl={editing.logo_url ?? logoUrl} name={orgName} />
            <Preview tokens={editing.tokens} mode="dark" logoUrl={editing.logo_url ?? logoUrl} name={orgName} />
          </div>
          <Card className="space-y-4">
            <h2 className="text-lg font-semibold">Adjust</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {(["light", "dark"] as const).map((mode) => (
                <fieldset key={mode} className="space-y-2">
                  <legend className="font-medium">{mode === "light" ? "Light" : "Dark"}</legend>
                  {COLOR_TOKENS.map((token) => (
                    <label key={token} className="flex items-center gap-2 text-sm">
                      <input type="color" aria-label={`${mode} ${token}`} value={editing.tokens[mode][token]} onChange={(e) => setColor(mode, token, e.target.value)} />
                      <span className="w-24">{token}</span>
                      <code className="text-muted">{editing.tokens[mode][token]}</code>
                    </label>
                  ))}
                  <div className="flex items-center gap-1 text-sm">
                    <span className="w-24">charts</span>
                    {editing.tokens[mode].chart.map((c, i) => (
                      <input key={i} type="color" aria-label={`${mode} chart ${i + 1}`} value={c} onChange={(e) => setColor(mode, "chart", e.target.value, i)} />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Corner radius">
                <input type="range" min={0} max={16} value={editing.tokens.radius} onChange={(e) => setEditing({ ...editing, tokens: { ...editing.tokens, radius: Number(e.target.value) } })} />
              </Field>
              <Field label="Heading font">
                <select className={inputClass} value={editing.tokens.heading_font} onChange={(e) => setEditing({ ...editing, tokens: { ...editing.tokens, heading_font: e.target.value as ThemeTokens["heading_font"] } })}>
                  {APPROVED_FONTS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="Body font">
                <select className={inputClass} value={editing.tokens.body_font} onChange={(e) => setEditing({ ...editing, tokens: { ...editing.tokens, body_font: e.target.value as ThemeTokens["body_font"] } })}>
                  {APPROVED_FONTS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </Field>
            </div>
            <details>
              <summary className="cursor-pointer text-sm">Contrast checks ({pairs.length - failing.length} of {pairs.length} pass)</summary>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2" data-testid="contrast-checks">
                {pairs.map((p) => (
                  <li key={`${p.mode}-${p.foreground}-${p.background}`} className={cx(p.ratio < MIN_CONTRAST && "text-danger")}>
                    {p.mode}: {p.foreground} on {p.background} — {p.ratio.toFixed(2)}:1 {p.ratio < MIN_CONTRAST ? "fails" : "passes"}
                  </li>
                ))}
              </ul>
            </details>
            {failing.length ? <Notice tone="danger">{failing.length} text and background pairs are under 4.5:1. Fix them before approving.</Notice> : null}
            <Button onClick={() => approve(editing.id, editing.tokens)} disabled={busy}>Approve and make live</Button>
          </Card>
        </>
      ) : null}

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Theme history</h2>
        <ul className="divide-y divide-border" data-testid="theme-history">
          {history.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-2">
                <span className="inline-flex gap-0.5" aria-hidden>
                  {[t.tokens.light.primary, t.tokens.light.accent, ...t.tokens.light.chart.slice(1, 3)].map((c, i) => (
                    <span key={i} className="h-4 w-4 rounded-sm border border-border" style={{ background: c }} />
                  ))}
                </span>
                <span className="text-sm">{new Date(t.approved_at ?? t.created_at).toLocaleString("en-GB")}</span>
                <Badge tone={t.status === "live" ? "success" : "neutral"}>{t.status === "live" ? "Live" : t.status === "proposed" ? "Proposed" : "Earlier"}</Badge>
              </span>
              {t.status === "archived" ? <Button variant="secondary" onClick={() => approve(t.id, t.tokens)}>Restore</Button> : null}
              {t.status === "proposed" ? <Button variant="ghost" onClick={() => setEditing({ id: t.id, tokens: t.tokens, logo_url: t.logo_url })}>Review</Button> : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
