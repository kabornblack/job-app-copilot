"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createInvite,
  getAdminStatus,
  listAdminInvites,
  listAdminUsers,
  revokeInvite,
  type AdminUserOverview,
  type TrustedInvite,
} from "@/lib/admin-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

function formatEntry(label: string, entry: { used: number; limit: number }): string {
  return `${label}: ${entry.used}/${entry.limit}`;
}

/**
 * ADR-0006: this client-side isAdmin check + redirect is a courtesy gate
 * only. The real enforcement is requireAdmin on every /admin/* route
 * server-side - a non-admin who bypasses this redirect still gets a 403
 * from every data call this page makes.
 */
export default function AdminPage() {
  const router = useRouter();
  const [gateChecked, setGateChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [users, setUsers] = useState<AdminUserOverview[]>([]);
  const [invites, setInvites] = useState<TrustedInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteStatusTone, setInviteStatusTone] = useState<"error" | "success">("success");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdminStatus()
      .then(({ isAdmin }) => {
        if (cancelled) return;
        setAllowed(isAdmin);
        setGateChecked(true);
        if (!isAdmin) {
          router.replace("/dashboard");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGateChecked(true);
          router.replace("/dashboard");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userList, inviteList] = await Promise.all([
        listAdminUsers(),
        listAdminInvites(),
      ]);
      setUsers(userList);
      setInvites(inviteList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) {
      void loadData();
    }
  }, [allowed]);

  const handleCreateInvite = async () => {
    setInviting(true);
    setInviteStatus(null);
    setLastInviteLink(null);
    try {
      const invite = await createInvite(inviteEmail.trim());
      const link = `${window.location.origin}/invite/${invite.token}`;
      setLastInviteLink(link);
      setInviteStatusTone("success");
      setInviteStatus(`Invite created for ${invite.email}.`);
      setInviteEmail("");
      await loadData();
    } catch (err) {
      setInviteStatusTone("error");
      setInviteStatus(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeInvite(id);
      await loadData();
    } catch (err) {
      setInviteStatusTone("error");
      setInviteStatus(err instanceof Error ? err.message : "Failed to revoke invite");
    }
  };

  if (!gateChecked || !allowed) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const pendingInvites = invites.filter((i) => !i.acceptedAt && !i.revokedAt);

  return (
    <div className="grid gap-5">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Read-only. Plan and current usage vs. limit for each metric.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-3">
              {users.map((u) => (
                <div
                  key={u.userId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{u.email ?? u.userId}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatEntry("Search", u.quota.search)} ·{" "}
                      {formatEntry("CV", u.quota.cvGen)} ·{" "}
                      {formatEntry("Cover letter", u.quota.coverLetterGen)} ·{" "}
                      {formatEntry("Score calls", u.quota.scoreCalls)}
                    </p>
                  </div>
                  <Badge variant="outline">{u.quota.plan}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Send trusted invite</CardTitle>
          <CardDescription>
            The invited person must open the link while logged into the account matching
            this email. Invites cannot be sent to accounts already on the Pro plan, and
            expire after 7 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="inviteEmail">Email</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-64"
                />
              </div>
              <Button
                type="button"
                onClick={handleCreateInvite}
                disabled={inviting || !inviteEmail.trim()}
              >
                {inviting ? "Sending…" : "Create invite"}
              </Button>
            </div>
            {lastInviteLink ? (
              <p className="text-sm text-muted-foreground">
                Link: <code className="rounded bg-muted px-1 py-0.5">{lastInviteLink}</code>
              </p>
            ) : null}
            {inviteStatus ? (
              <Alert variant={inviteStatusTone === "error" ? "destructive" : "success"}>
                <AlertDescription>{inviteStatus}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Pending invites</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingInvites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invites.</p>
          ) : (
            <div className="grid gap-2">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="text-sm">
                    <p>{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevoke(invite.id)}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
