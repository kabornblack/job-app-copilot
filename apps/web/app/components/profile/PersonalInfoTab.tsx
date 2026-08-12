"use client";

import { useEffect, useState } from "react";
import {
  getPersonalDetails,
  putPersonalDetails,
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

export default function PersonalInfoTab() {
  const [form, setForm] = useState<PersonalDetailsInput>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"error" | "success">("success");

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
          Contact details and a short professional summary used when
          generating your CV and cover letter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
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
                onChange={(event) => updateField("linkedinUrl", event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="portfolioUrl">Portfolio</Label>
              <Input
                id="portfolioUrl"
                placeholder="yoursite.dev"
                value={form.portfolioUrl ?? ""}
                onChange={(event) => updateField("portfolioUrl", event.target.value)}
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
          <Button type="button" onClick={handleSave} disabled={saving} className="w-fit">
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
