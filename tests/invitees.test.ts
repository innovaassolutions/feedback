import { describe, expect, it } from "vitest";
import { parseInvitee, splitPasted } from "@/lib/server/ops/roster";

describe("a pasted class list", () => {
  it("splits on lines and semicolons, and on commas only between addresses", () => {
    expect(splitPasted("Ada Lovelace <ada@example.com>\nGrace Hopper <grace@example.com>\r\n\nAlan <alan@example.com>")).toEqual([
      "Ada Lovelace <ada@example.com>",
      "Grace Hopper <grace@example.com>",
      "Alan <alan@example.com>",
    ]);
    expect(splitPasted("a@example.com, b@example.com; c@example.com")).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    expect(splitPasted("Lovelace, Ada <ada@example.com>")).toEqual(["Lovelace, Ada <ada@example.com>"]);
    expect(splitPasted("Ada <ada@example.com>, Grace <grace@example.com>")).toEqual(["Ada <ada@example.com>", "Grace <grace@example.com>"]);
  });

  it("reads a name and an address in the forms people paste", () => {
    expect(parseInvitee("Ada Lovelace <ADA@example.com>")).toEqual({ email: "ada@example.com", name: "Ada Lovelace" });
    expect(parseInvitee('"Lovelace, Ada" <ada@example.com>')).toEqual({ email: "ada@example.com", name: "Lovelace, Ada" });
    expect(parseInvitee("Lovelace, Ada <ada@example.com>")).toEqual({ email: "ada@example.com", name: "Lovelace, Ada" });
    // Two spreadsheet columns.
    expect(parseInvitee("Ada Lovelace\tada@example.com")).toEqual({ email: "ada@example.com", name: "Ada Lovelace" });
    expect(parseInvitee("grace.hopper@example.com")).toEqual({ email: "grace.hopper@example.com", name: "Grace Hopper" });
    expect(parseInvitee("not an address")).toBeNull();
    expect(parseInvitee("a@example.com b@example.com")).toBeNull();
  });

  it("keeps a long list as one entry per learner, so no entry is near the length limit", () => {
    const list = Array.from({ length: 40 }, (_, i) => `Learner Number${i} <learner.${i}@class.example>`).join("\n");
    expect(list.length).toBeGreaterThan(320);
    const entries = splitPasted(list);
    expect(entries).toHaveLength(40);
    expect(Math.max(...entries.map((e) => e.length))).toBeLessThan(80);
  });
});
