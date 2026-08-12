"use client";
import { useState, type FormEvent } from "react";
import { apiFetch } from "../../lib/api";
import { extractErrorMessage } from "../../lib/error-message";
import { setHasProfileFlag } from "../../lib/profile-flag";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ProfileFormProps = {
  onSearchComplete: () => void;
};

type SearchRunResponse = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  stats?: {
    jobsSeen?: number;
    matchesCreated?: number;
    matchesReused?: number;
    applicationsCreated?: number;
    claudeCalls?: number;
    scoreJobsEnqueued?: number;
    scoreJobsFinished?: number;
  };
  error?: string | null;
};

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export default function ProfileForm({ onSearchComplete }: ProfileFormProps) {
  const [skills, setSkills] = useState("");
  const [targetRoles, setTargetRoles] = useState("");
  const [locations, setLocations] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [remotePref, setRemotePref] = useState("any");
  const [resumeSummary, setResumeSummary] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<
    "info" | "error" | "warning" | "success"
  >("info");
  const [submitting, setSubmitting] = useState(false);

  const parseList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const formatRunProgress = (run: SearchRunResponse) => {
    const stats = run.stats ?? {};
    const finished = stats.scoreJobsFinished ?? 0;
    const enqueued = stats.scoreJobsEnqueued ?? 0;
    if (run.status === "queued") {
      return "Search queued…";
    }
    if (enqueued > 0) {
      return `Searching… scoring ${finished}/${enqueued} jobs (seen ${stats.jobsSeen ?? 0})`;
    }
    return "Searching… fetching jobs";
  };

  const pollSearchRun = async (runId: string): Promise<SearchRunResponse> => {
    for (;;) {
      const response = await apiFetch(`/search-runs/${runId}`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to load search run status");
      }
      const run = (await response.json()) as SearchRunResponse;
      if (run.status === "completed" || run.status === "failed") {
        return run;
      }
      setStatusTone("info");
      setStatus(formatRunProgress(run));
      await sleep(1500);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatusTone("info");
    setStatus("Searching…");

    const profile = {
      skills: parseList(skills),
      targetRoles: parseList(targetRoles),
      locations: parseList(locations),
      salaryMin: salaryMin ? Number(salaryMin) : undefined,
      salaryMax: salaryMax ? Number(salaryMax) : undefined,
      currency: "EUR",
      remotePref: remotePref as "remote" | "hybrid" | "onsite" | "any",
      resumeSummary: resumeSummary || undefined,
    };

    try {
      const response = await apiFetch(`/jobs/search`, {
        method: "POST",
        body: JSON.stringify({ profile }),
      });

      if (response.status !== 202) {
        const rawBody = await response.text();
        const message = extractErrorMessage(rawBody, "Something went wrong.");
        if (response.status === 429) {
          setStatusTone("warning");
          setStatus(message);
        } else {
          setStatusTone("error");
          setStatus(`Search failed: ${message}`);
        }
        return;
      }

      const started = await response.json();
      setStatus("Search queued…");
      const run = await pollSearchRun(started.runId);

      if (run.status === "failed") {
        setStatusTone("error");
        setStatus(`Search failed: ${run.error ?? "Unknown error"}`);
        return;
      }

      const stats = run.stats ?? {};
      setStatusTone("success");
      setStatus(
        `Search complete — ${stats.jobsSeen ?? 0} jobs seen, ${stats.matchesCreated ?? 0} new matches, ${stats.matchesReused ?? 0} reused. Taking you to the review queue…`,
      );
      setHasProfileFlag();
      onSearchComplete();
    } catch (error) {
      setStatusTone("error");
      setStatus(`Search failed: ${error}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Tell us what you&apos;re looking for. Running a search creates or
          updates your profile and pulls in new matches.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="skills">Skills</Label>
            <Input
              id="skills"
              value={skills}
              onChange={(event) => setSkills(event.target.value)}
              placeholder="React, TypeScript, SQL"
              required
            />
            <p className="text-xs text-muted-foreground">Comma separated.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="targetRoles">Target roles</Label>
            <Input
              id="targetRoles"
              value={targetRoles}
              onChange={(event) => setTargetRoles(event.target.value)}
              placeholder="Frontend Engineer, Full-stack Developer"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="locations">Locations</Label>
            <Input
              id="locations"
              value={locations}
              onChange={(event) => setLocations(event.target.value)}
              placeholder="Tallinn, remote"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="salaryMin">Salary min</Label>
              <Input
                id="salaryMin"
                type="number"
                value={salaryMin}
                onChange={(event) => setSalaryMin(event.target.value)}
                placeholder="3000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="salaryMax">Salary max</Label>
              <Input
                id="salaryMax"
                type="number"
                value={salaryMax}
                onChange={(event) => setSalaryMax(event.target.value)}
                placeholder="5000"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="remotePref">Remote preference</Label>
            <Select value={remotePref} onValueChange={setRemotePref}>
              <SelectTrigger id="remotePref" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="onsite">Onsite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="resumeSummary">Resume summary</Label>
            <Textarea
              id="resumeSummary"
              value={resumeSummary}
              onChange={(event) => setResumeSummary(event.target.value)}
              placeholder="Experienced full-stack engineer with strong React and Node.js skills."
              rows={4}
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-fit">
            {submitting ? "Searching…" : "Search jobs"}
          </Button>
          {status ? (
            <Alert
              variant={
                statusTone === "error"
                  ? "destructive"
                  : statusTone === "warning"
                    ? "warning"
                    : statusTone === "success"
                      ? "success"
                      : "default"
              }
            >
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
