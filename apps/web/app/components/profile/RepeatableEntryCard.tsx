"use client";

import { useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

type RepeatableEntryCardProps = {
  summaryTitle: ReactNode;
  summarySubtitle?: ReactNode;
  isEditing: boolean;
  saving?: boolean;
  error?: string | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => Promise<void>;
  deleteConfirmTitle: string;
  deleteConfirmDescription: string;
  children: ReactNode;
};

/**
 * Shared shell for the five 1:many profile-knowledge sections (work
 * experience, education, certifications, achievements, skills): a collapsed
 * summary row that expands to an edit form in place, plus a delete button
 * wrapping the same Dialog-based confirm pattern used for JobCard's "Skip"
 * button. Purely presentational — the actual API calls are owned by each
 * tab component and passed in as callbacks.
 */
export default function RepeatableEntryCard({
  summaryTitle,
  summarySubtitle,
  isEditing,
  saving = false,
  error,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  deleteConfirmTitle,
  deleteConfirmDescription,
  children,
}: RepeatableEntryCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      setDeleteDialogOpen(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeleting(false);
    }
  };

  if (!isEditing) {
    return (
      <Card size="sm">
        <CardContent className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold leading-snug">{summaryTitle}</p>
            {summarySubtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {summarySubtitle}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm">
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{deleteConfirmTitle}</DialogTitle>
                  <DialogDescription>{deleteConfirmDescription}</DialogDescription>
                </DialogHeader>
                {deleteError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{deleteError}</AlertDescription>
                  </Alert>
                ) : null}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDeleteDialogOpen(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        {children}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
