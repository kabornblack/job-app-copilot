"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { getApiUrl } from "../../lib/api";
import { validatePassword, type PasswordStrength } from "../../lib/password";
import { createClient } from "../../lib/supabase/client";
import AuthCard from "../components/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const strengthTextClass: Record<PasswordStrength, string> = {
  weak: "text-destructive",
  medium: "text-warning",
  strong: "text-success",
};

const strengthBarClass: Record<PasswordStrength, string> = {
  weak: "w-1/3 bg-destructive",
  medium: "w-2/3 bg-warning",
  strong: "w-full bg-success",
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordCheck = useMemo(() => validatePassword(password), [password]);
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;
  const confirmError =
    confirmPassword.length > 0 && password !== confirmPassword
      ? "Passwords do not match"
      : null;
  const canSubmit =
    email.trim().length > 0 &&
    passwordCheck.ok &&
    passwordsMatch &&
    !submitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);

    const clientCheck = validatePassword(password);
    if (!clientCheck.ok) {
      setError(clientCheck.errors.join(". "));
      setSubmitting(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        details?: string[];
        session?: { access_token: string; refresh_token: string } | null;
      };

      if (!response.ok) {
        const detail =
          payload.details && payload.details.length > 0
            ? payload.details.join(". ")
            : null;
        setError(detail ?? payload.error ?? "Sign up failed");
        return;
      }

      if (payload.session?.access_token && payload.session.refresh_token) {
        const supabase = createClient();
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: payload.session.access_token,
          refresh_token: payload.session.refresh_token,
        });
        if (sessionError) {
          setError(sessionError.message);
          return;
        }
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setInfo(
        "Account created. If email confirmation is enabled, check your inbox; otherwise try logging in.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Sign up"
      description="Create an account to start tracking applications."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {password.length > 0 ? (
          <div data-testid="password-strength" className="grid gap-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-150",
                  strengthBarClass[passwordCheck.strength],
                )}
              />
            </div>
            <p
              data-testid="password-strength-label"
              className={cn(
                "m-0 text-sm capitalize",
                strengthTextClass[passwordCheck.strength],
              )}
            >
              Strength: {passwordCheck.strength}
            </p>
            {!passwordCheck.ok ? (
              <ul className="m-0 list-disc pl-5 text-sm text-muted-foreground">
                {passwordCheck.errors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {confirmError ? (
          <Alert variant="destructive">
            <AlertDescription>{confirmError}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {info ? (
          <Alert variant="success">
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={!canSubmit} className="w-full">
          {submitting ? "Creating account…" : "Sign up"}
        </Button>
      </form>
    </AuthCard>
  );
}
