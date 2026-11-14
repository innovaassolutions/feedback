import sharp from "sharp";
import { rgbToHsl, toHex } from "@/lib/theme/color";

export type Swatch = { hex: string; share: number; saturation: number; lightness: number; hue: number };

/** The main colors in a logo, most prominent first. Transparent and near-white pixels are skipped. */
export async function logoPalette(bytes: Uint8Array): Promise<Swatch[]> {
  const { data, info } = await sharp(Buffer.from(bytes), { density: 150 })
    .resize(96, 96, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    if (r > 240 && g > 240 && b > 240) continue;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n++;
    buckets.set(key, bucket);
    total++;
  }
  return [...buckets.values()]
    .map((b) => {
      const rgb = { r: b.r / b.n, g: b.g / b.n, b: b.b / b.n };
      const hsl = rgbToHsl(rgb);
      return { hex: toHex(rgb), share: b.n / Math.max(total, 1), saturation: hsl.s, lightness: hsl.l, hue: hsl.h };
    })
    .sort((a, b) => b.share - a.share)
    .slice(0, 8);
}

/** The most likely brand color: prominent and saturated. */
export function brandColor(palette: Swatch[]): Swatch | null {
  const colorful = palette.filter((s) => s.saturation > 0.25 && s.lightness > 0.12 && s.lightness < 0.88);
  return [...colorful].sort((a, b) => b.share * (0.5 + b.saturation) - a.share * (0.5 + a.saturation))[0] ?? palette[0] ?? null;
}
