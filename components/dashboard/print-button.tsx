"use client";
import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <div className="no-print">
      <Button variant="secondary" onClick={() => window.print()}>Print</Button>
    </div>
  );
}
