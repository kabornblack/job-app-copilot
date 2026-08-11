"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, getApiUrl } from "../../lib/api";
import { getHasProfileFlag, setHasProfileFlag } from "../../lib/profile-flag";
import ReviewQueue from "../components/ReviewQueue";
import type { JobSummary } from "../components/JobCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; jobs: JobSummary[] };

export default function HomePage() {
  const router = useRouter();
  const apiUrl = getApiUrl();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    apiFetch(`/applications/review-queue`)
      .then(async (response) => {
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load review queue");
        }
        return response.json();
      })
      .then((payload: { queue?: JobSummary[] }) => {
        if (cancelled) {
          return;
        }
        const jobs = payload.queue ?? [];

        // No evidence of a profile anywhere (empty queue, no local flag from
        // a prior search) — send the user to set one up. See lib/profile-flag.ts
        // for why this is a heuristic, not a real "does a profile exist" check.
        if (jobs.length === 0 && !getHasProfileFlag()) {
          router.replace("/profile");
          return;
        }
        if (jobs.length > 0) {
          setHasProfileFlag();
        }
        setState({ status: "ready", jobs });
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err.message || "Unable to load review queue",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">Loading review queue…</p>
    );
  }

  if (state.status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load the review queue</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  return <ReviewQueue apiUrl={apiUrl} initialJobs={state.jobs} />;
}
