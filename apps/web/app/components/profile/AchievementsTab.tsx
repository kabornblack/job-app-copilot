"use client";

import { useEffect, useState } from "react";
import {
  createAchievement,
  deleteAchievement,
  listAchievements,
  updateAchievement,
  type Achievement,
  type AchievementInput,
} from "@/lib/profile-knowledge-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MonthYearFields from "./MonthYearFields";
import RepeatableEntryCard from "./RepeatableEntryCard";

type Draft = {
  title: string;
  description: string;
  month: number | null;
  year: number | null;
};

type EntryState = {
  key: string;
  saved: Achievement | null;
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
  return { title: "", description: "", month: null, year: null };
}

function toDraft(row: Achievement): Draft {
  return {
    title: row.title,
    description: row.description ?? "",
    month: row.month,
    year: row.year,
  };
}

function draftToInput(draft: Draft): AchievementInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    month: draft.month,
    year: draft.year,
  };
}

export default function AchievementsTab() {
  const [entries, setEntries] = useState<EntryState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAchievements()
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
          setLoadError(err.message || "Failed to load achievements");
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
        ? await updateAchievement(entry.saved.id, input)
        : await createAchievement(input);
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
    await deleteAchievement(entry.saved.id);
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
        const date = entry.saved
          ? formatMonthYear(entry.saved.month, entry.saved.year)
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
            deleteConfirmTitle="Delete this achievement?"
            deleteConfirmDescription={`This removes "${entry.saved?.title ?? "this entry"}" permanently.`}
            summaryTitle={entry.saved ? entry.saved.title : ""}
            summarySubtitle={entry.saved ? date ?? undefined : ""}
          >
            <div className="grid gap-1.5">
              <Label htmlFor={`${entry.key}-title`}>Title</Label>
              <Input
                id={`${entry.key}-title`}
                value={entry.draft.title}
                onChange={(event) => updateDraft(entry.key, { title: event.target.value })}
              />
            </div>
            <MonthYearFields
              idPrefix={`${entry.key}-date`}
              label="Date"
              month={entry.draft.month}
              year={entry.draft.year}
              onMonthChange={(month) => updateDraft(entry.key, { month })}
              onYearChange={(year) => updateDraft(entry.key, { year })}
            />
            <div className="grid gap-1.5">
              <Label htmlFor={`${entry.key}-description`}>Description</Label>
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
        + Add achievement
      </Button>
    </div>
  );
}
