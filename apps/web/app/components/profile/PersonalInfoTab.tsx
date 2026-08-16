"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  deleteCvUpload,
  getCvUpload,
  getPersonalDetails,
  putCvUpload,
  putPersonalDetails,
  type CvUpload,
  type PersonalDetailsInput,
} from "@/lib/profile-knowledge-api";
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
import { Textarea } from "@/components/ui/textarea";

const emptyForm: PersonalDetailsInput = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedinUrl: "",
  portfolioUrl: "",
  professionalSummary: "",
};

const EXTRACTION_STATUS_LABEL: Record<string, string> = {
  ok: "Text extracted",
  empty: "No readable text found — try re-exporting as a text-based PDF",
  failed: "Could not read this file — try re-uploading",
};

export default function PersonalInfoTab() {
  const [form, setForm] = useState<PersonalDetailsInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"error" | "success">("success");

  const [cvUpload, setCvUpload] = useState<CvUpload | null>(null);
  const [cvLoading, setCvLoading] = useState(true);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvStatus, setCvStatus] = useState<string | null>(null);
  const [cvStatusTone, setCvStatusTone] = useState<"error" | "success">(
    "success",
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getPersonalDetails()
      .then((details) => {
        if (cancelled || !details) {
          return;
        }
        setForm({
          fullName: details.fullName ?? "",
          email: details.email ?? "",
          phone: details.phone ?? "",
          location: details.location ?? "",
          linkedinUrl: details.linkedinUrl ?? "",
          portfolioUrl: details.portfolioUrl ?? "",
          professionalSummary: details.professionalSummary ?? "",
        });
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setStatusTone("error");
          setStatus(err.message || "Failed to load personal details");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCvUpload()
      .then((upload) => {
        if (!cancelled) {
          setCvUpload(upload);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setCvStatusTone("error");
          setCvStatus(err.message || "Failed to load CV");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCvLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCvFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setCvUploading(true);
    setCvStatus(null);
    try {
      const uploaded = await putCvUpload(file);
      setCvUpload(uploaded);
      setCvStatusTone("success");
      setCvStatus("CV uploaded.");
    } catch (err) {
      setCvStatusTone("error");
      setCvStatus(err instanceof Error ? err.message : "Failed to upload CV");
    } finally {
      setCvUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCvDelete = async () => {
    setCvUploading(true);
    setCvStatus(null);
    try {
      await deleteCvUpload();
      setCvUpload(null);
      setCvStatusTone("success");
      setCvStatus("CV removed.");
    } catch (err) {
      setCvStatusTone("error");
      setCvStatus(err instanceof Error ? err.message : "Failed to remove CV");
    } finally {
      setCvUploading(false);
    }
  };

  const updateField = (field: keyof PersonalDetailsInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await putPersonalDetails({
        fullName: form.fullName || null,
        email: form.email || null,
        phone: form.phone || null,
        location: form.location || null,
        linkedinUrl: form.linkedinUrl || null,
        portfolioUrl: form.portfolioUrl || null,
        professionalSummary: form.professionalSummary || null,
      });
      setStatusTone("success");
      setStatus("Saved.");
    } catch (err) {
      setStatusTone("error");
      setStatus(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Personal Info</CardTitle>
        <CardDescription>
          Contact details and a short professional summary used when generating
          your CV and cover letter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          <div className="grid gap-1.5 rounded-md border p-3">
            <Label>
              Uploaded CV{" "}
              <span className="font-normal text-muted-foreground">
                (If present, it's used as the authoritative source for CV/cover
                letter generation; profile data below only fills gaps it doesn't
                cover)
              </span>
            </Label>
            {cvLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : cvUpload ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm">
                  <p>{cvUpload.originalFilename ?? "cv.pdf"}</p>
                  <p className="text-muted-foreground">
                    Uploaded{" "}
                    {new Date(cvUpload.uploadedAt).toLocaleDateString()} —{" "}
                    {EXTRACTION_STATUS_LABEL[cvUpload.extractionStatus] ??
                      cvUpload.extractionStatus}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cvUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cvUploading}
                  onClick={handleCvDelete}
                >
                  Delete
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={cvUploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-fit"
              >
                {cvUploading ? "Uploading…" : "Upload CV (PDF)"}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleCvFileChange}
            />
            {cvStatus ? (
              <Alert
                variant={cvStatusTone === "error" ? "destructive" : "success"}
              >
                <AlertDescription>{cvStatus}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={form.fullName ?? ""}
              onChange={(event) => updateField("fullName", event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email ?? ""}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone ?? ""}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="Tallinn, Estonia"
              value={form.location ?? ""}
              onChange={(event) => updateField("location", event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="linkedinUrl">LinkedIn</Label>
              <Input
                id="linkedinUrl"
                placeholder="linkedin.com/in/..."
                value={form.linkedinUrl ?? ""}
                onChange={(event) =>
                  updateField("linkedinUrl", event.target.value)
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="portfolioUrl">Portfolio</Label>
              <Input
                id="portfolioUrl"
                placeholder="yoursite.dev"
                value={form.portfolioUrl ?? ""}
                onChange={(event) =>
                  updateField("portfolioUrl", event.target.value)
                }
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="professionalSummary">Professional summary</Label>
            <Textarea
              id="professionalSummary"
              rows={4}
              placeholder="A short pitch — who you are and what you're looking for."
              value={form.professionalSummary ?? ""}
              onChange={(event) =>
                updateField("professionalSummary", event.target.value)
              }
            />
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-fit"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {status ? (
            <Alert variant={statusTone === "error" ? "destructive" : "success"}>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
