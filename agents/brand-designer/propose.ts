import { generateText, Output } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import sharp from "sharp";
import { errorName } from "@/lib/server/ai/runs";
import type { ThemeTokens } from "@/lib/theme/tokens";
import { brandColor, logoPalette, type Swatch } from "@/lib/server/brand/palette";
import { proposalSchema } from "./schema";

export type ProposalRun = { usage?: { inputTokens?: number; outputTokens?: number }; providerMetadata?: unknown; latencyMs: number; outcome: "ok" | "validation_failed"; error?: string };

/** One structured call with the logo and the palette code found in it. */
export async function proposeFromLogo(
  deps: { model: LanguageModelV4; instructions: string },
  bytes: Uint8Array,
): Promise<{ tokens: ThemeTokens | null; palette: Swatch[]; run: ProposalRun }> {
  const palette = await logoPalette(bytes);
  const brand = brandColor(palette);
  // The model sees a PNG either way; SVG logos are rasterized first.
  const png = await sharp(Buffer.from(bytes), { density: 150 }).resize(512, 512, { fit: "inside" }).png().toBuffer();
  const started = performance.now();
  try {
    const result = await generateText({
      model: deps.model,
      instructions: deps.instructions,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Propose the theme for this logo.\n\n<context>${JSON.stringify({ task: "propose_theme", palette, brand })}</context>` },
            { type: "file", data: new Uint8Array(png), mediaType: "image/png" },
          ],
        },
      ],
      output: Output.object({ schema: proposalSchema }),
      maxOutputTokens: 1200,
    });
    const tokens = proposalSchema.parse(result.output);
    return { tokens, palette, run: { usage: result.usage, providerMetadata: result.providerMetadata, latencyMs: performance.now() - started, outcome: "ok" } };
  } catch (err) {
    return { tokens: null, palette, run: { latencyMs: performance.now() - started, outcome: "validation_failed", error: errorName(err) } };
  }
}
