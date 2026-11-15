// How fast the voice agent spoke in recent calls, from Vocal Bridge's call log: words per minute for
// each line it spoke in full. The target for learners with English as a second language is a median
// of 150 or less. Calls Vocal Bridge's API (read only), so it isn't part of the tests.
//
//   npx tsx scripts/voice-pace.ts [number of calls, default 1]
import "./load-env";

const TARGET = 150;
const key = process.env.VOCAL_BRIDGE_API_KEY;
if (!key) throw new Error("VOCAL_BRIDGE_API_KEY isn't set");
const headers: Record<string, string> = { "X-API-Key": key };
if (process.env.VOCAL_BRIDGE_AGENT_ID) headers["X-Agent-Id"] = process.env.VOCAL_BRIDGE_AGENT_ID;
const base = process.env.VOCAL_BRIDGE_API_URL || "https://vocalbridgeai.com";

type Line = { type: string; role?: string; content?: unknown; started_at?: number; stopped_at?: number; interrupted?: boolean };
type Call = { id: string; started_at: string };

const calls = Number(process.argv[2] ?? 1);
const list = await (await fetch(`${base}/api/v1/logs?limit=${calls}`, { headers })).json();
const sessions: Call[] = (list.sessions ?? list.logs ?? list.data ?? list).slice(0, calls);
for (const call of sessions) {
  const detail = await (await fetch(`${base}/api/v1/logs/${call.id}`, { headers })).json();
  const lines: Line[] = (detail.session ?? detail).transcript ?? [];
  const rates: number[] = [];
  for (const l of lines) {
    if (l.type !== "message" || l.role !== "assistant" || l.interrupted || !l.started_at || !l.stopped_at) continue;
    const words = String(l.content).split(/\s+/).filter(Boolean).length;
    const seconds = l.stopped_at - l.started_at;
    // Short lines ("Thanks.") are too brief to time.
    if (words >= 8 && seconds > 0) rates.push(Math.round((words / seconds) * 60));
  }
  rates.sort((a, b) => a - b);
  const median = rates.length ? rates[Math.floor(rates.length / 2)] : null;
  const verdict = median === null ? "no lines long enough to time" : median <= TARGET ? `within the ${TARGET} target` : `over the ${TARGET} target`;
  console.log(`${call.started_at.slice(0, 16)} call ${call.id.slice(0, 8)}: median ${median ?? "–"} words a minute over ${rates.length} lines (${rates.join(", ")}), ${verdict}`);
}
