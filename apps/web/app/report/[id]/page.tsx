import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportView } from "@/components/ReportView";

export const metadata: Metadata = { title: "OT report · AgeProof AI" };

/** The report reads the result from the browser's sessionStorage, so the page is a client view. */
export default function ReportPage() {
  return (
    <Suspense fallback={<p className="p-10 text-muted">Loading…</p>}>
      <ReportView />
    </Suspense>
  );
}
