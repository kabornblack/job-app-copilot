"use client";
import { useState } from "react";
import GeneratedTextPanel from "./GeneratedTextPanel";
import type { TipTapDoc } from "./DocumentEditor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type JobSummary = {
  applicationId: string;
  jobId: string;
  title: string;
  company: string;
  location?: string | null;
  remoteType?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  url: string;
  score: number;
  explanation: string;
  status: string;
  generatedCV?: string | null;
  generatedCoverLetter?: string | null;
  generatedCVJson?: TipTapDoc | null;
  generatedCoverLetterJson?: TipTapDoc | null;
};

export type GeneratedDocumentResult = {
  content: string | null;
  contentJson: TipTapDoc | null;
};

const PRE_APPLICATION_STATUSES = new Set(["found", "reviewing", "tailored"]);
const POST_APPLICATION_STATUSES = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
] as const;

const STATUS_LABELS: Record<string, string> = {
  found: "Found",
  reviewing: "Shortlisted",
  tailored: "Tailored",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Score tiers for the review-queue badge — 0-39 weak, 40-69 possible, 70-100 strong. */
function scoreTier(score: number): {
  variant: "destructive" | "warning" | "success";
  label: string;
} {
  if (score >= 70) {
    return { variant: "success", label: "Strong match" };
  }
  if (score >= 40) {
    return { variant: "warning", label: "Possible match" };
  }
  return { variant: "destructive", label: "Weak match" };
}

type JobCardProps = {
  job: JobSummary;
  apiUrl: string;
  onGenerate: (
    applicationId: string,
    docType: "cv" | "cover_letter",
  ) => Promise<GeneratedDocumentResult | null>;
  onStatusChange: (applicationId: string, status: string) => Promise<void>;
};

export default function JobCard({
  job,
  apiUrl,
  onGenerate,
  onStatusChange,
}: JobCardProps) {
  const [loadingGenerate, setLoadingGenerate] = useState<
    "cv" | "cover_letter" | null
  >(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [generatedCV, setGeneratedCV] = useState<string | null>(
    job.generatedCV ?? null,
  );
  const [generatedCoverLetter, setGeneratedCoverLetter] = useState<
    string | null
  >(job.generatedCoverLetter ?? null);
  const [generatedCVJson, setGeneratedCVJson] = useState<TipTapDoc | null>(
    job.generatedCVJson ?? null,
  );
  const [generatedCoverLetterJson, setGeneratedCoverLetterJson] =
    useState<TipTapDoc | null>(job.generatedCoverLetterJson ?? null);
  const [status, setStatus] = useState(job.status);

  const hasDocuments = Boolean(generatedCVJson || generatedCoverLetterJson);
  const isPreApplication = PRE_APPLICATION_STATUSES.has(status);
  const isPostApplication = !isPreApplication;
  const tier = scoreTier(job.score);

  const handleGenerate = async (docType: "cv" | "cover_letter") => {
    setLoadingGenerate(docType);
    setGenerateError(null);
    try {
      const result = await onGenerate(job.applicationId, docType);
      if (result) {
        if (docType === "cv") {
          setGeneratedCV(result.content);
          setGeneratedCVJson(result.contentJson);
        } else {
          setGeneratedCoverLetter(result.content);
          setGeneratedCoverLetterJson(result.contentJson);
        }
      }
    } catch (error) {
      const label = docType === "cv" ? "CV" : "cover letter";
      setGenerateError(
        error instanceof Error
          ? error.message
          : `Failed to generate ${label}. Try again.`,
      );
    } finally {
      setLoadingGenerate(null);
    }
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (newStatus === status) {
      return;
    }
    setLoadingStatus(true);
    setStatusError(null);
    try {
      await onStatusChange(job.applicationId, newStatus);
      setStatus(newStatus);
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Failed to update status.",
      );
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleSkipConfirm = async () => {
    await handleStatusUpdate("rejected");
    setSkipDialogOpen(false);
  };

  return (
    <Card className={isPostApplication ? "bg-muted/40" : undefined}>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold leading-snug">
              {job.title}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {job.company} · {job.location ?? "Location unknown"} ·{" "}
              {job.remoteType ?? "Remote info unknown"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge variant={isPostApplication ? "secondary" : "outline"}>
              {STATUS_LABELS[status] ?? status}
            </Badge>
            <Badge variant={tier.variant}>
              {job.score.toFixed(0)} · {tier.label}
            </Badge>
          </div>
        </div>

        <p className="text-sm">
          <span className="font-medium">Why match: </span>
          {job.explanation}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              Apply on {job.company}&apos;s site
            </a>
          </Button>

          {isPreApplication ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleGenerate("cv")}
                disabled={loadingGenerate !== null}
              >
                {loadingGenerate === "cv"
                  ? "Generating CV…"
                  : generatedCVJson
                    ? "Regenerate CV"
                    : "Generate CV"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleGenerate("cover_letter")}
                disabled={loadingGenerate !== null}
              >
                {loadingGenerate === "cover_letter"
                  ? "Generating cover letter…"
                  : generatedCoverLetterJson
                    ? "Regenerate cover letter"
                    : "Generate cover letter"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleStatusUpdate("reviewing")}
                disabled={loadingStatus}
              >
                Shortlist
              </Button>
              <Dialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={loadingStatus}
                  >
                    Skip
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Skip this job?</DialogTitle>
                    <DialogDescription>
                      This marks &quot;{job.title}&quot; as rejected and moves
                      it to the Archived tab. You can change its status back
                      later if you change your mind.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSkipDialogOpen(false)}
                      disabled={loadingStatus}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleSkipConfirm}
                      disabled={loadingStatus}
                    >
                      {loadingStatus ? "Skipping…" : "Skip job"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {hasDocuments ? (
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  onClick={() => handleStatusUpdate("applied")}
                  disabled={loadingStatus}
                >
                  Mark as applied
                </Button>
              ) : null}
            </>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Status</span>
              <Select
                value={status}
                onValueChange={handleStatusUpdate}
                disabled={loadingStatus}
              >
                <SelectTrigger size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POST_APPLICATION_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
        </div>

        {generateError ? (
          <Alert variant="destructive">
            <AlertDescription>{generateError}</AlertDescription>
          </Alert>
        ) : null}
        {statusError ? (
          <Alert variant="destructive">
            <AlertDescription>{statusError}</AlertDescription>
          </Alert>
        ) : null}

        <GeneratedTextPanel
          applicationId={job.applicationId}
          apiUrl={apiUrl}
          generatedCV={generatedCV}
          generatedCoverLetter={generatedCoverLetter}
          generatedCVJson={generatedCVJson}
          generatedCoverLetterJson={generatedCoverLetterJson}
          onDocumentSaved={(docType, payload) => {
            if (docType === "cv") {
              setGeneratedCV(payload.content);
              setGeneratedCVJson(payload.contentJson);
            } else {
              setGeneratedCoverLetter(payload.content);
              setGeneratedCoverLetterJson(payload.contentJson);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
