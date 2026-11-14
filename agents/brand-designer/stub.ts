import type { StubCall, StubReply } from "@/lib/server/ai/stub-model";
import { hslToRgb, mix, toHex } from "@/lib/theme/color";

// The Brand designer's stand-in: builds tokens from the palette code extracted from the logo.

type Swatch = { hex: string; hue: number; saturation: number; lightness: number };

export function brandDesignerStub(call: StubCall): StubReply {
  const palette = (call.context.palette as Swatch[]) ?? [];
  const brand = (call.context.brand as Swatch | null) ?? palette[0] ?? { hex: "#336699", hue: 210, saturation: 0.5, lightness: 0.4 };
  const second = palette.find((s) => Math.abs(s.hue - brand.hue) > 40 && s.saturation > 0.25);
  const hue = brand.hue;
  const hsl = (h: number, s: number, l: number) => toHex(hslToRgb(h, s, l));
  const accentHue = second?.hue ?? (hue + 150) % 360;
  const chartHues = [hue, (hue + 60) % 360, (hue + 150) % 360, (hue + 210) % 360, (hue + 290) % 360];
  const tokens = {
    light: {
      primary: brand.hex,
      accent: hsl(accentHue, 0.6, 0.35),
      background: mix("#ffffff", brand.hex, 0.03),
      surface: "#ffffff",
      text: hsl(hue, 0.25, 0.12),
      muted: hsl(hue, 0.12, 0.38),
      chart: chartHues.map((h, i) => (i === 0 ? brand.hex : hsl(h, 0.55, 0.45))),
    },
    dark: {
      primary: hsl(hue, Math.min(0.9, brand.saturation + 0.1), 0.72),
      accent: hsl(accentHue, 0.6, 0.7),
      background: hsl(hue, 0.25, 0.07),
      surface: hsl(hue, 0.2, 0.12),
      text: hsl(hue, 0.15, 0.92),
      muted: hsl(hue, 0.1, 0.7),
      chart: chartHues.map((h) => hsl(h, 0.6, 0.68)),
    },
    radius: 8,
    heading_font: "Inter",
    body_font: "Inter",
  };
  return { text: JSON.stringify(tokens) };
}
