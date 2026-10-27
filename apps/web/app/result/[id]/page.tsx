import { Suspense } from "react";
import { ResultView } from "@/components/ResultView";

/** The result lives in the browser's sessionStorage, so the page is a client view. */
export default function ResultPage() {
  return (
    <Suspense fallback={<p className="p-10 text-muted">Loading…</p>}>
      <ResultView />
    </Suspense>
  );
}
