import { describe, expect, it } from "vitest";
import { signInRedirect } from "@/lib/auth";

describe("magic link redirect", () => {
  it("lands on the confirm route of the address the person used, carrying where to go next", () => {
    expect(signInRedirect("http://teaching-laptop.local:3000", "/streamspace/ime-engineering/sessions/1/interview")).toBe(
      "http://teaching-laptop.local:3000/auth/confirm?next=%2Fstreamspace%2Fime-engineering%2Fsessions%2F1%2Finterview",
    );
  });

  it("never sends the person to another site afterwards", () => {
    expect(signInRedirect("http://localhost:3000", "//elsewhere.example/steal")).toBe("http://localhost:3000/auth/confirm?next=%2F");
    expect(signInRedirect("http://localhost:3000", "https://elsewhere.example/steal")).toBe("http://localhost:3000/auth/confirm?next=%2Fsteal");
  });
});
