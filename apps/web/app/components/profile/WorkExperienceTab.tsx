"use client";

import { useEffect, useState } from "react";
import {
  createWorkExperience,
  deleteWorkExperience,
  listWorkExperience,
  updateWorkExperience,
  type WorkExperience,
  type WorkExperienceInput,
} from "@/lib/profile-knowledge-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MonthYearFields from "./MonthYearFields";
import RepeatableEntryCard from "./RepeatableEntryCard";

type Draft = {
  company: string;
  title: string;
  location: string;
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  bulletsText: string;
};

type EntryState = {
  key: string;
  saved: WorkExperience | null;
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
    company: "",
    title: "",
    location: "",
    startMonth: null,
    startYear: null,
    endMonth: null,
    endYear: null,
    bulletsText: "",
  };
}

function toDraft(row: WorkExperience): Draft {
  return {
    company: row.company,
    title: row.title,
    location: row.location ?? "",
    startMonth: row.startMonth,
    startYear: row.startYear,
    endMonth: row.endMonth,
    endYear: row.endYear,
    bulletsText: row.bullets.join("\n"),
  };
}

function draftToInput(draft: Draft): WorkExperienceInput {
  return {
    company: draft.company.trim(),
    title: draft.title.trim(),
    location: draft.location.trim() || null,
    startMonth: draft.startMonth ?? 1,
    startYear: draft.startYear ?? new Date().getFullYear(),
    endMonth: draft.endMonth,
    endYear: draft.endYear,
    bullets: draft.bulletsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

export default function WorkExperienceTab() {
  const [entries, setEntries] = useState<EntryState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listWorkExperience()
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
          setLoadError(err.message || "Failed to load work experience");
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
        ? await updateWorkExperience(entry.saved.id, input)
        : await createWorkExperience(input);
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
    await deleteWorkExperience(entry.saved.id);
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
            deleteConfirmTitle="Delete this work experience entry?"
            deleteConfirmDescription={`This removes "${entry.saved?.title ?? "this entry"}" at ${entry.saved?.company ?? ""} permanently.`}
            summaryTitle={entry.saved ? `${entry.saved.title}` : ""}
            summarySubtitle={
              entry.saved ? `${entry.saved.company}${entry.saved.location ? ` · ${entry.saved.location}` : ""} · ${dateRange}` : ""
            }
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${entry.key}-company`}>Company</Label>
                <Input
                  id={`${entry.key}-company`}
                  value={entry.draft.company}
                  onChange={(event) => updateDraft(entry.key, { company: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${entry.key}-title`}>Title</Label>
                <Input
                  id={`${entry.key}-title`}
                  value={entry.draft.title}
                  onChange={(event) => updateDraft(entry.key, { title: event.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${entry.key}-location`}>Location</Label>
              <Input
                id={`${entry.key}-location`}
                value={entry.draft.location}
                onChange={(event) => updateDraft(entry.key, { location: event.target.value })}
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
                hint="Leave blank if this is your current role."
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${entry.key}-bullets`}>Highlights</Label>
              <Textarea
                id={`${entry.key}-bullets`}
                rows={4}
                placeholder={"One highlight per line."}
                value={entry.draft.bulletsText}
                onChange={(event) =>
                  updateDraft(entry.key, { bulletsText: event.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">One highlight per line.</p>
            </div>
          </RepeatableEntryCard>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={handleAddNew}>
        + Add work experience
      </Button>
    </div>
  );
}
