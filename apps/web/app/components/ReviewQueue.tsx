"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import JobCard, {
  type GeneratedDocumentResult,
  type JobSummary,
} from "./JobCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ReviewQueueProps = {
  apiUrl: string;
  initialJobs: JobSummary[];
};

type QueueTab = "to_review" | "applied" | "archived";

const TAB_STATUSES: Record<QueueTab, Set<string>> = {
  to_review: new Set(["found", "reviewing", "tailored"]),
  applied: new Set(["applied", "interviewing"]),
  archived: new Set(["offer", "rejected", "withdrawn"]),
};

const TAB_LABELS: Record<QueueTab, string> = {
  to_review: "To review",
  applied: "Applied",
  archived: "Archived",
};

/**
 * Renders the tabbed queue. Fetching + loading/error states now live in the
 * parent page (app/(app)/page.tsx) since it also needs the same data to
 * decide the /profile redirect — this component just owns the list itself.
 */
export default function ReviewQueue({ apiUrl, initialJobs }: ReviewQueueProps) {
  const [jobs, setJobs] = useState<JobSummary[]>(initialJobs);
  const [activeTab, setActiveTab] = useState<QueueTab>("to_review");

  const updateJob = (applicationId: string, update: Partial<JobSummary>) => {
    setJobs((previous) =>
      previous.map((job) =>
        job.applicationId === applicationId ? { ...job, ...update } : job,
      ),
    );
  };

  const handleGenerate = async (
    applicationId: string,
    docType: "cv" | "cover_letter",
  ): Promise<GeneratedDocumentResult | null> => {
    const response = await apiFetch(
      `/applications/${applicationId}/generate`,
      {
        method: "POST",
        body: JSON.stringify({ type: docType }),
      },
    );

    if (!response.ok) {
      let message = await response.text();
      try {
        const parsed = JSON.parse(message) as { error?: string };
        if (parsed.error) {
          message = parsed.error;
        }
      } catch {
        // keep raw body
      }
      throw new Error(message || "Failed to generate text");
    }

    const generated = await response.json();
    const content = generated.content ?? null;
    const contentJson = generated.contentJson ?? null;
    updateJob(
      applicationId,
      docType === "cv"
        ? { generatedCV: content, generatedCVJson: contentJson }
        : {
            generatedCoverLetter: content,
            generatedCoverLetterJson: contentJson,
          },
    );
    return { content, contentJson };
  };

  const handleStatusChange = async (applicationId: string, status: string) => {
    const response = await apiFetch(
      `/applications/${applicationId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    );

    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to update status");
    }

    const updated = await response.json();
    updateJob(applicationId, { status: updated.status });
  };

  const counts = useMemo(() => {
    const result: Record<QueueTab, number> = {
      to_review: 0,
      applied: 0,
      archived: 0,
    };
    for (const job of jobs) {
      if (TAB_STATUSES.to_review.has(job.status)) {
        result.to_review += 1;
      } else if (TAB_STATUSES.applied.has(job.status)) {
        result.applied += 1;
      } else if (TAB_STATUSES.archived.has(job.status)) {
        result.archived += 1;
      }
    }
    return result;
  }, [jobs]);

  const filteredJobs = jobs.filter((job) =>
    TAB_STATUSES[activeTab].has(job.status),
  );

  if (jobs.length === 0) {
    return (
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Review queue</h1>
        <Card className="mt-3">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No jobs in the review queue yet. Set up your profile and run a
              search to get started.
            </p>
            <Button asChild size="sm">
              <Link href="/profile">Go to profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Review queue</h1>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as QueueTab)}>
        <TabsList>
          {(Object.keys(TAB_LABELS) as QueueTab[]).map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {TAB_LABELS[tab]} ({counts[tab]})
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={activeTab} className="mt-3 space-y-3">
          {filteredJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No jobs in &ldquo;{TAB_LABELS[activeTab]}&rdquo; right now.
            </p>
          ) : (
            filteredJobs.map((job) => (
              <JobCard
                key={job.applicationId}
                job={job}
                apiUrl={apiUrl}
                onGenerate={handleGenerate}
                onStatusChange={handleStatusChange}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
