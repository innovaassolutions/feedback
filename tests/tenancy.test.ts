import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seeded, signInAs, sql, userId, type UserClient } from "./support/db";
import { fillEveryTable } from "./support/fill";

let ids: Awaited<ReturnType<typeof seeded>>;
let tables: string[];

beforeAll(async () => {
  ids = await seeded();
  await fillEveryTable(ids.streamspace, ids.ime, await userId("aisha"), 90);
  await fillEveryTable(ids.northwind, ids.nwCourse, await userId("isla"), 90);
  const rows = await sql()`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`;
  tables = rows.map((r) => r.relname as string);
});

afterAll(async () => {
  await sql()`delete from public.sessions where number = 90`;
  await sql()`delete from public.documentation_sources where url like 'https://docs.fixture.example/%'`;
  await sql()`delete from public.agent_runs where agent_version = 'fixture'`;
  await sql()`delete from public.quality_checks where agent_version = 'fixture'`;
  await sql()`delete from public.jobs where kind = 'fixture'`;
});

async function visibleRows(client: UserClient, table: string, orgId: string) {
  // Table names come from the catalog, so the client can't type them.
  const { data, error } = await (client.from as (t: string) => ReturnType<UserClient["from"]>)(table)
    .select("organization_id")
    .eq("organization_id", orgId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data?.length ?? 0;
}

describe("tenancy", () => {
  it("has a row for both organizations in every table, so the checks below mean something", async () => {
    expect(tables.length).toBeGreaterThanOrEqual(22);
    for (const table of tables) {
      for (const org of [ids.streamspace, ids.northwind]) {
        const [row] = await sql().unsafe(`select count(*)::int as n from public.${table} where organization_id = $1`, [org]);
        expect(row.n, `${table} has no row for ${org}`).toBeGreaterThan(0);
      }
    }
  });

  it("a Northwind learner reads zero Streamspace rows from every table", async () => {
    const isla = await signInAs("isla");
    for (const table of tables) expect(await visibleRows(isla, table, ids.streamspace), table).toBe(0);
  });

  it("a Streamspace learner reads zero Northwind rows from every table", async () => {
    const aisha = await signInAs("aisha");
    for (const table of tables) expect(await visibleRows(aisha, table, ids.northwind), table).toBe(0);
  });

  it("holds for instructors and organization admins too", async () => {
    const owen = await signInAs("owen");
    const dana = await signInAs("dana");
    for (const table of tables) {
      expect(await visibleRows(owen, table, ids.streamspace), `owen ${table}`).toBe(0);
      expect(await visibleRows(dana, table, ids.northwind), `dana ${table}`).toBe(0);
    }
  });

  it("still lets a learner read their own organization's course", async () => {
    const aisha = await signInAs("aisha");
    expect(await visibleRows(aisha, "courses", ids.streamspace)).toBe(1);
    expect(await visibleRows(aisha, "organizations", ids.streamspace)).toBe(1);
  });
});
