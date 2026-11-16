import type { Email } from "@/lib/server/email";
import { derived, type ApprovedFont, type Mode, type ModeTokens } from "@/lib/theme/tokens";
import type { EmailBrand } from "./brand";

// One layout for every email, drawn from the organization's live theme the way its pages are: a
// header band in the primary color carrying the logo, a card on the page background, and a button
// in the primary color. Mail apps don't support CSS variables, so the theme's values are written
// inline, and a dark-mode block repeats them from the theme's dark tokens for apps that follow it.

export type EmailBlock = string | { quote: string };

export type EmailContent = {
  /** Shown by mail apps next to the subject. */
  preview: string;
  heading: string;
  /** Paragraphs, and quotes such as a learner's words. Plain text; line breaks are kept. */
  body: EmailBlock[];
  button?: { label: string; url: string };
  /** Small print under the button. */
  note?: string;
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const SERIF: ReadonlySet<ApprovedFont> = new Set(["Merriweather", "Source Serif 4", "Lora"]);

/** The theme's font where the reader has it, then the closest fonts every mail app has. */
function fontStack(font: ApprovedFont): string {
  return SERIF.has(font)
    ? `'${font}', Georgia, 'Times New Roman', serif`
    : `'${font}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`;
}

function palette(t: ModeTokens, mode: Mode) {
  const d = derived(t, mode);
  return { ...t, onPrimary: d.on_primary, border: d.border, soft: d.primary_soft };
}

export function renderEmail(brand: EmailBrand, content: EmailContent): { html: string; text: string } {
  const light = palette(brand.tokens.light, "light");
  const dark = palette(brand.tokens.dark, "dark");
  const r = brand.tokens.radius;
  const heading = fontStack(brand.tokens.heading_font);
  const body = fontStack(brand.tokens.body_font);
  const para = (text: string, extra = "") =>
    `<p class="e-text" style="margin:0 0 16px;font-family:${body};font-size:16px;line-height:1.5;color:${light.text};${extra}">${esc(text).replace(/\n/g, "<br>")}</p>`;

  const blocks = content.body
    .map((block) =>
      typeof block === "string"
        ? para(block)
        : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>` +
          `<td class="e-quote" style="background-color:${light.soft};border-left:4px solid ${light.primary};border-radius:${Math.min(r, 8)}px;padding:12px 16px;">` +
          `<p class="e-text" style="margin:0;font-family:${body};font-size:16px;line-height:1.5;color:${light.text};">${esc(block.quote).replace(/\n/g, "<br>")}</p>` +
          `</td></tr></table>`,
    )
    .join("");

  const button = content.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>` +
      `<td class="e-button" style="background-color:${light.primary};border-radius:${r}px;">` +
      `<a class="e-button" href="${esc(content.button.url)}" style="display:inline-block;padding:12px 24px;font-family:${body};font-size:16px;font-weight:600;line-height:1.25;color:${light.onPrimary};text-decoration:none;border-radius:${r}px;">${esc(content.button.label)}</a>` +
      `</td></tr></table>` +
      `<p class="e-muted" style="margin:0 0 16px;font-family:${body};font-size:13px;line-height:1.5;color:${light.muted};">If the button doesn't work, copy this address into your browser:<br>` +
      `<a class="e-link" href="${esc(content.button.url)}" style="color:${light.primary};word-break:break-all;">${esc(content.button.url)}</a></p>`
    : "";

  const note = content.note
    ? `<p class="e-muted" style="margin:0;font-family:${body};font-size:13px;line-height:1.5;color:${light.muted};">${esc(content.note)}</p>`
    : "";

  // The logo sits on a small surface-colored plate, as it does in the organization's page header.
  const masthead = brand.logo
    ? `<img src="${esc(brand.logo.url)}" alt="${esc(brand.name)}" width="${brand.logo.width}" height="${brand.logo.height}" class="e-plate" ` +
      `style="display:block;width:${brand.logo.width}px;height:${brand.logo.height}px;border:0;outline:none;background-color:${light.surface};padding:2px;border-radius:${Math.min(r, 4)}px;">`
    : `<span class="e-head-text" style="font-family:${heading};font-size:18px;font-weight:600;line-height:1.3;color:${light.onPrimary};">${esc(brand.name)}</span>`;

  const footer = brand.organization ? `${brand.name} · Course Feedback Platform` : brand.name;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(content.heading)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .e-page { background-color: ${dark.background} !important; }
  .e-head { background-color: ${dark.primary} !important; }
  .e-head-text { color: ${dark.onPrimary} !important; }
  .e-plate { background-color: ${dark.surface} !important; }
  .e-card { background-color: ${dark.surface} !important; border-color: ${dark.border} !important; }
  .e-text { color: ${dark.text} !important; }
  .e-muted { color: ${dark.muted} !important; }
  .e-link { color: ${dark.primary} !important; }
  .e-button { background-color: ${dark.primary} !important; color: ${dark.onPrimary} !important; }
  .e-quote { background-color: ${dark.soft} !important; border-color: ${dark.primary} !important; }
}
</style>
</head>
<body class="e-page" style="margin:0;padding:0;background-color:${light.background};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(content.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-page" style="background-color:${light.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td class="e-head" style="background-color:${light.primary};border-radius:${r}px ${r}px 0 0;padding:14px 24px;">${masthead}</td></tr>
<tr><td class="e-card" style="background-color:${light.surface};border:1px solid ${light.border};border-top:0;border-radius:0 0 ${r}px ${r}px;padding:28px 24px;">
<h1 class="e-text" style="margin:0 0 16px;font-family:${heading};font-size:22px;font-weight:600;line-height:1.3;color:${light.text};">${esc(content.heading)}</h1>
${blocks}${button}${note}
</td></tr>
<tr><td style="padding:16px 24px;"><p class="e-muted" style="margin:0;font-family:${body};font-size:12px;line-height:1.5;color:${light.muted};">${esc(footer)}</p></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    ...content.body.map((block) => (typeof block === "string" ? block : block.quote)),
    ...(content.button ? [content.button.url] : []),
    ...(content.note ? [content.note] : []),
    `— ${brand.name}`,
  ].join("\n\n");

  return { html, text };
}

/** An email ready for the mailer, in the brand's look with a plain-text copy. */
export function brandedEmail(to: string, subject: string, brand: EmailBrand, content: EmailContent): Email {
  return { to, subject, ...renderEmail(brand, content) };
}
