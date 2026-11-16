import sharp from "sharp";
import type { AdminClient } from "@/lib/server/supabase-admin";

// Organization logos for email. Gmail and Outlook don't show SVG, so every logo is served to email
// as a PNG at twice the height it's shown, from /api/email-logo/<slug>.png.

/** The height a logo is shown at in an email, in CSS pixels. */
export const EMAIL_LOGO_HEIGHT = 40;

export type EmailLogo = { png: Buffer; width: number; height: number };

const rendered = new Map<string, Promise<EmailLogo | null>>();

async function render(admin: AdminClient, logoPath: string): Promise<EmailLogo | null> {
  // Only files in the logos bucket. A logo path that is a web address is never fetched from here.
  if (/^https?:\/\//.test(logoPath)) return null;
  try {
    const { data, error } = await admin.storage.from("logos").download(logoPath);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    const target = EMAIL_LOGO_HEIGHT * 2;
    // Rasterize an SVG at the density that gives the target height, so a large drawing doesn't
    // become a huge bitmap first. PNGs ignore density.
    const meta = await sharp(bytes).metadata();
    const density = meta.format === "svg" && meta.height ? Math.min(600, Math.max(36, (72 * target) / meta.height)) : undefined;
    const { data: png, info } = await sharp(bytes, density ? { density } : {})
      .resize({ height: target, withoutEnlargement: meta.format !== "svg" })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { png, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

/** The logo as a PNG, rendered once per logo file while the server runs. */
export function emailLogo(admin: AdminClient, logoPath: string): Promise<EmailLogo | null> {
  let logo = rendered.get(logoPath);
  if (!logo) {
    if (rendered.size > 100) rendered.clear();
    logo = render(admin, logoPath).then((result) => {
      if (!result) rendered.delete(logoPath);
      return result;
    });
    rendered.set(logoPath, logo);
  }
  return logo;
}
