"use client";

import { useEffect, useState } from "react";
import {
  createCertification,
  deleteCertification,
  listCertifications,
  updateCertification,
  type Certification,
  type CertificationInput,
} from "@/lib/profile-knowledge-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MonthYearFields from "./MonthYearFields";
import RepeatableEntryCard from "./RepeatableEntryCard";

type Draft = {
  name: string;
  issuer: string;
  issueMonth: number | null;
  issueYear: number | null;
  expirationMonth: number | null;
  expirationYear: number | null;
  credentialId: string;
  credentialUrl: string;
};

type EntryState = {
  key: string;
  saved: Certification | null;
  isEditing: boolean;
  draft: Draft;
  saving: boolean;
  error: string | null;
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonthYear(month: number | null, year: number | null): string | null {
  if (!month || !year) {
    return null;
  }
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function emptyDraft(): Draft {
  return {
    name: "",
    issuer: "",
    issueMonth: null,
    issueYear: null,
    expirationMonth: null,
    expirationYear: null,
    credentialId: "",
    credentialUrl: "",
  };
}

function toDraft(row: Certification): Draft {
  return {
    name: row.name,
    issuer: row.issuer,
    issueMonth: row.issueMonth,
    issueYear: row.issueYear,
    expirationMonth: row.expirationMonth,
    expirationYear: row.expirationYear,
    credentialId: row.credentialId ?? "",
    credentialUrl: row.credentialUrl ?? "",
  };
}

function draftToInput(draft: Draft): CertificationInput {
  return {
    name: draft.name.trim(),
    issuer: draft.issuer.trim(),
    issueMonth: draft.issueMonth,
    issueYear: draft.issueYear,
    expirationMonth: draft.expirationMonth,
    expirationYear: draft.expirationYear,
    credentialId: draft.credentialId.trim() || null,
    credentialUrl: draft.credentialUrl.trim() || null,
  };
}

export default function CertificationsTab() {
  const [entries, setEntries] = useState<EntryState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCertifications()
      .then((rows) => {
        if (cancelled) {
          return;
        }
        setEntries(
          rows.map((row) => ({
            key: row.id,
            saved: row,
            isEditing: false,
            draft: toDraft(row),
            saving: false,
            error: null,
          })),
        );
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadError(err.message || "Failed to load certifications");
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

  const updateEntry = (key: string, patch: Partial<EntryState>) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
    );
  };

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.key === key ? { ...entry, draft: { ...entry.draft, ...patch } } : entry,
      ),
    );
  };

  const handleAddNew = () => {
    setEntries((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        saved: null,
        isEditing: true,
        draft: emptyDraft(),
        saving: false,
        error: null,
      },
    ]);
  };

  const handleEdit = (key: string) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.key === key
          ? { ...entry, isEditing: true, draft: entry.saved ? toDraft(entry.saved) : entry.draft }
          : entry,
      ),
    );
  };

  const handleCancel = (key: string) => {
    setEntries((prev) =>
      prev
        .filter((entry) => entry.key !== key || entry.saved !== null)
        .map((entry) =>
          entry.key === key ? { ...entry, isEditing: false, error: null } : entry,
        ),
    );
  };

  const handleSave = async (key: string) => {
    const entry = entries.find((item) => item.key === key);
    if (!entry) {
      return;
    }
    updateEntry(key, { saving: true, error: null });
    try {
      const input = draftToInput(entry.draft);
      const saved = entry.saved
        ? await updateCertification(entry.saved.id, input)
        : await createCertification(input);
      updateEntry(key, { saved, isEditing: false, saving: false, draft: toDraft(saved) });
    } catch (err) {
      updateEntry(key, {
        saving: false,
        error: err instanceof Error ? err.message : "Failed to save",
      });
    }
  };

  const handleDelete = async (key: string) => {
    const entry = entries.find((item) => item.key === key);
    if (!entry?.saved) {
      return;
    }
    await deleteCertification(entry.saved.id);
    setEntries((prev) => prev.filter((item) => item.key !== key));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {entries.map((entry) => {
        const issued = entry.saved
          ? formatMonthYear(entry.saved.issueMonth, entry.saved.issueYear)
          : null;
        const expires = entry.saved
          ? formatMonthYear(entry.saved.expirationMonth, entry.saved.expirationYear)
          : null;

        return (
          <RepeatableEntryCard
            key={entry.key}
            isEditing={entry.isEditing}
            saving={entry.saving}
            error={entry.error}
            onEdit={() => handleEdit(entry.key)}
            onCancel={() => handleCancel(entry.key)}
            onSave={() => handleSave(entry.key)}
            onDelete={() => handleDelete(entry.key)}
            deleteConfirmTitle="Delete this certification?"
            deleteConfirmDescription={`This removes "${entry.saved?.name ?? "this entry"}" permanently.`}
            summaryTitle={entry.saved ? entry.saved.name : ""}
            summarySubtitle={
              entry.saved
                ? `${entry.saved.issuer}${issued ? ` · Issued ${issued}` : ""}${expires ? ` · Expires ${expires}` : ""}`
                : ""
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${entry.key}-name`}>Certification name</Label>
                <Input
                  id={`${entry.key}-name`}
                  value={entry.draft.name}
                  onChange={(event) => updateDraft(entry.key, { name: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${entry.key}-issuer`}>Issuer</Label>
                <Input
                  id={`${entry.key}-issuer`}
                  value={entry.draft.issuer}
                  onChange={(event) => updateDraft(entry.key, { issuer: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MonthYearFields
                idPrefix={`${entry.key}-issue`}
                label="Issue date"
                month={entry.draft.issueMonth}
                year={entry.draft.issueYear}
                onMonthChange={(month) => updateDraft(entry.key, { issueMonth: month })}
                onYearChange={(year) => updateDraft(entry.key, { issueYear: year })}
              />
              <MonthYearFields
                idPrefix={`${entry.key}-expiration`}
                label="Expiration date"
                month={entry.draft.expirationMonth}
                year={entry.draft.expirationYear}
                onMonthChange={(month) => updateDraft(entry.key, { expirationMonth: month })}
                onYearChange={(year) => updateDraft(entry.key, { expirationYear: year })}
                hint="Leave blank if it doesn't expire."
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${entry.key}-credentialId`}>Credential ID</Label>
                <Input
                  id={`${entry.key}-credentialId`}
                  value={entry.draft.credentialId}
                  onChange={(event) =>
                    updateDraft(entry.key, { credentialId: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${entry.key}-credentialUrl`}>Credential URL</Label>
                <Input
                  id={`${entry.key}-credentialUrl`}
                  value={entry.draft.credentialUrl}
                  onChange={(event) =>
                    updateDraft(entry.key, { credentialUrl: event.target.value })
                  }
                />
              </div>
            </div>
          </RepeatableEntryCard>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={handleAddNew}>
        + Add certification
      </Button>
    </div>
  );
}
