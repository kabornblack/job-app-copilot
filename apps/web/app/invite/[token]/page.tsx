"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  acceptInvite,
  getInviteStatus,
  type AcceptInviteResponse,
  type InviteStatusResponse,
} from "@/lib/admin-api";
import AuthCard from "../../components/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * ADR-0006: this page is deliberately outside the (app) route group's
 * TopBar/nav chrome - it's a one-off landing, not part of normal app
 * navigation. Reachable only by a logged-in user - middleware.ts redirects
 * anyone without a session to /login first (this route isn't in its public
 * path list), matching the "must be logged into their real account" spec.
 *
 * Deliberately never auto-accepts on load: only the GET status check runs
 * on mount, the actual accept only fires on an explicit button click - see
 * lib/invites.ts's routes/invites.ts comment for why (email
 * link-scanners/prefetchers following a bare GET could otherwise burn the
 * invite before the real recipient opens it).
 */
export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [status, setStatus] = useState<InviteStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accepting, setAccepting] = useState(false);
  const [result, setResult] = useState<AcceptInviteResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInviteStatus(token)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load invite");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const response = await acceptInvite(token);
      setResult(response);
    } catch (err) {
      setResult({
        ok: false,
        reason: "error",
        message: err instanceof Error ? err.message : "Failed to accept invite",
      });
    } finally {
      setAccepting(false);
    }
  };

  let body: ReactNode;
  if (loading) {
    body = <p className="text-sm text-muted-foreground">Checking invite…</p>;
  } else if (loadError) {
    body = (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  } else if (result) {
    body = result.ok ? (
      <Alert variant="success">
        <AlertDescription>
          You're now on the Trusted plan. Head back to the dashboard to keep going.
        </AlertDescription>
      </Alert>
    ) : (
      <Alert variant="destructive">
        <AlertDescription>{result.message}</AlertDescription>
      </Alert>
    );
  } else if (status?.status === "valid") {
    body = (
      <div className="grid gap-3">
        <p className="text-sm">
          This invite grants the Trusted plan to <strong>{status.email}</strong>.
        </p>
        <Button type="button" onClick={handleAccept} disabled={accepting}>
          {accepting ? "Accepting…" : "Accept invite"}
        </Button>
      </div>
    );
  } else if (status?.status === "expired") {
    body = (
      <Alert variant="destructive">
        <AlertDescription>
          This invite has expired — ask an admin to send a new one.
        </AlertDescription>
      </Alert>
    );
  } else if (status?.status === "accepted") {
    body = (
      <Alert variant="destructive">
        <AlertDescription>This invite has already been used.</AlertDescription>
      </Alert>
    );
  } else if (status?.status === "revoked") {
    body = (
      <Alert variant="destructive">
        <AlertDescription>This invite has been revoked.</AlertDescription>
      </Alert>
    );
  } else {
    body = (
      <Alert variant="destructive">
        <AlertDescription>This invite link isn't valid.</AlertDescription>
      </Alert>
    );
  }

  return (
    <AuthCard title="Trusted plan invite" description="" footer={null}>
      {body}
    </AuthCard>
  );
}
