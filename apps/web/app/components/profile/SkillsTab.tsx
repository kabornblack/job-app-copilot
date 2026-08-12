"use client";

import { useEffect, useState } from "react";
import {
  createSkill,
  deleteSkill,
  listSkills,
  updateSkill,
  type Skill,
  type SkillInput,
} from "@/lib/profile-knowledge-api";
import {
  COMMON_SKILLS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_BY_NAME,
} from "@/lib/common-skills";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RepeatableEntryCard from "./RepeatableEntryCard";

type Draft = {
  name: string;
  category: string;
};

type EntryState = {
  key: string;
  saved: Skill | null;
  isEditing: boolean;
  draft: Draft;
  saving: boolean;
  error: string | null;
};

function emptyDraft(): Draft {
  return { name: "", category: "" };
}

function toDraft(row: Skill): Draft {
  return { name: row.name, category: row.category ?? "" };
}

function draftToInput(draft: Draft): SkillInput {
  return {
    name: draft.name.trim(),
    category: draft.category.trim() || null,
  };
}

export default function SkillsTab() {
  const [entries, setEntries] = useState<EntryState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSkills()
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
          setLoadError(err.message || "Failed to load skills");
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
      prev.map((entry) => {
        if (entry.key !== key) {
          return entry;
        }
        const draft = { ...entry.draft, ...patch };
        // Auto-suggest: if the name now matches a known skill and the user
        // hasn't already typed a category of their own, pre-fill it. Still
        // fully editable/overridable afterward — this never overwrites a
        // category the user already entered.
        if (patch.name !== undefined && !entry.draft.category.trim()) {
          const known = SKILL_CATEGORY_BY_NAME[patch.name.trim().toLowerCase()];
          if (known) {
            draft.category = known;
          }
        }
        return { ...entry, draft };
      }),
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
        ? await updateSkill(entry.saved.id, input)
        : await createSkill(input);
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
    await deleteSkill(entry.saved.id);
    setEntries((prev) => prev.filter((item) => item.key !== key));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-3">
      {/* Shared by every entry's Skill input via list="common-skills-list".
          Native <datalist> gives suggest-as-you-type with zero API calls
          and zero added dependencies, while still allowing freeform text
          for anything not in COMMON_SKILLS. */}
      <datalist id="common-skills-list">
        {COMMON_SKILLS.map((skill) => (
          <option key={skill} value={skill} />
        ))}
      </datalist>
      {/* Same pattern for Category: suggest the canonical set, but a plain
          text input underneath still accepts anything freeform. */}
      <datalist id="common-skill-categories-list">
        {SKILL_CATEGORIES.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {entries.map((entry) => (
        <RepeatableEntryCard
          key={entry.key}
          isEditing={entry.isEditing}
          saving={entry.saving}
          error={entry.error}
          onEdit={() => handleEdit(entry.key)}
          onCancel={() => handleCancel(entry.key)}
          onSave={() => handleSave(entry.key)}
          onDelete={() => handleDelete(entry.key)}
          deleteConfirmTitle="Delete this skill?"
          deleteConfirmDescription={`This removes "${entry.saved?.name ?? "this entry"}" permanently.`}
          summaryTitle={
            entry.saved ? (
              <>
                {entry.saved.name}
                {entry.saved.category ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {entry.saved.category}
                  </span>
                ) : null}
              </>
            ) : (
              ""
            )
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${entry.key}-name`}>Skill</Label>
              <Input
                id={`${entry.key}-name`}
                list="common-skills-list"
                autoComplete="off"
                value={entry.draft.name}
                onChange={(event) => updateDraft(entry.key, { name: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${entry.key}-category`}>Category</Label>
              <Input
                id={`${entry.key}-category`}
                list="common-skill-categories-list"
                autoComplete="off"
                placeholder="Languages, Tools, ..."
                value={entry.draft.category}
                onChange={(event) => updateDraft(entry.key, { category: event.target.value })}
              />
            </div>
          </div>
        </RepeatableEntryCard>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={handleAddNew}>
        + Add skill
      </Button>
    </div>
  );
}
