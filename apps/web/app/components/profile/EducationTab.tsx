"use client";

import { useEffect, useState } from "react";
import {
  createEducation,
  deleteEducation,
  listEducation,
  updateEducation,
  type Education,
  type EducationInput,
} from "@/lib/profile-knowledge-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MonthYearFields from "./MonthYearFields";
import RepeatableEntryCard from "./RepeatableEntryCard";

type Draft = {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  description: string;
};

type EntryState = {
  key: string;
  saved: Education | null;
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
    institution: "",
    degree: "",
    fieldOfStudy: "",
    startMonth: null,
    startYear: null,
    endMonth: null,
    endYear: null,
    description: "",
  };
}

function toDraft(row: Education): Draft {
  return {
    institution: row.institution,
    degree: row.degree,
    fieldOfStudy: row.fieldOfStudy ?? "",
    startMonth: row.startMonth,
    startYear: row.startYear,
    endMonth: row.endMonth,
    endYear: row.endYear,
    description: row.description ?? "",
  };
}

function draftToInput(draft: Draft): EducationInput {
  return {
    institution: draft.institution.trim(),
    degree: draft.degree.trim(),
    fieldOfStudy: draft.fieldOfStudy.trim() || null,
    startMonth: draft.startMonth ?? 1,
    startYear: draft.startYear ?? new Date().getFullYear(),
    endMonth: draft.endMonth,
    endYear: draft.endYear,
    description: draft.description.trim() || null,
  };
}

export default function EducationTab() {
  const [entries, setEntries] = useState<EntryState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEducation()
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
          setLoadError(err.message || "Failed to load education");
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
        ? await updateEducation(entry.saved.id, input)
        : await createEducation(input);
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
    await deleteEducation(entry.saved.id);
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
        const dateRange = entry.saved
          ? `${formatMonthYear(entry.saved.startMonth, entry.saved.startYear)} – ${
              formatMonthYear(entry.saved.endMonth, entry.saved.endYear) ?? "Present"
            }`
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
            deleteConfirmTitle="Delete this education entry?"
            deleteConfirmDescription={`This removes "${entry.saved?.degree ?? "this entry"}" at ${entry.saved?.institution ?? ""} permanently.`}
            summaryTitle={entry.saved ? entry.saved.degree : ""}
            summarySubtitle={
              entry.saved
                ? `${entry.saved.institution}${entry.saved.fieldOfStudy ? ` · ${entry.saved.fieldOfStudy}` : ""} · ${dateRange}`
                : ""
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${entry.key}-institution`}>Institution</Label>
                <Input
                  id={`${entry.key}-institution`}
                  value={entry.draft.institution}
                  onChange={(event) =>
                    updateDraft(entry.key, { institution: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${entry.key}-degree`}>Degree</Label>
                <Input
                  id={`${entry.key}-degree`}
                  value={entry.draft.degree}
                  onChange={(event) => updateDraft(entry.key, { degree: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${entry.key}-fieldOfStudy`}>Field of study</Label>
              <Input
                id={`${entry.key}-fieldOfStudy`}
                value={entry.draft.fieldOfStudy}
                onChange={(event) =>
                  updateDraft(entry.key, { fieldOfStudy: event.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MonthYearFields
                idPrefix={`${entry.key}-start`}
                label="Start date"
                month={entry.draft.startMonth}
                year={entry.draft.startYear}
                onMonthChange={(month) => updateDraft(entry.key, { startMonth: month })}
                onYearChange={(year) => updateDraft(entry.key, { startYear: year })}
              />
              <MonthYearFields
                idPrefix={`${entry.key}-end`}
                label="End date"
                month={entry.draft.endMonth}
                year={entry.draft.endYear}
                onMonthChange={(month) => updateDraft(entry.key, { endMonth: month })}
                onYearChange={(year) => updateDraft(entry.key, { endYear: year })}
                hint="Leave blank if ongoing."
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${entry.key}-description`}>Notes</Label>
              <Textarea
                id={`${entry.key}-description`}
                rows={3}
                value={entry.draft.description}
                onChange={(event) =>
                  updateDraft(entry.key, { description: event.target.value })
                }
              />
            </div>
          </RepeatableEntryCard>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={handleAddNew}>
        + Add education
      </Button>
    </div>
  );
}
