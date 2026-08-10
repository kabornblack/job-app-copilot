"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { getApiUrl } from "../../lib/api";
import { validatePassword, type PasswordStrength } from "../../lib/password";
import { createClient } from "../../lib/supabase/client";

const strengthColor: Record<PasswordStrength, string> = {
  weak: "#b45309",
  medium: "#a16207",
  strong: "#15803d",
};

const strengthWidth: Record<PasswordStrength, string> = {
  weak: "33%",
  medium: "66%",
  strong: "100%",
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
        router.replace("/");
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
    <main
      style={{
        padding: "2rem",
        fontFamily: "sans-serif",
        background: "#f5f7fb",
        minHeight: "100vh",
      }}
    >
      <div style={{ maxWidth: 420, margin: "4rem auto" }}>
        <h1>Sign up</h1>
        <p style={{ color: "#555" }}>Job Application Copilot</p>
        <form
          onSubmit={handleSubmit}
          style={{
            display: "grid",
            gap: "0.75rem",
            marginTop: "1.5rem",
            padding: "1.25rem",
            background: "#fff",
            border: "1px solid #ddd",
          }}
        >
          <label style={{ display: "grid", gap: "0.35rem" }}>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ padding: "0.5rem" }}
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            Password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: "0.5rem" }}
            />
          </label>
          {password.length > 0 ? (
            <div
              data-testid="password-strength"
              style={{ display: "grid", gap: "0.35rem" }}
            >
              <div
                style={{
                  height: 8,
                  background: "#e5e7eb",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: strengthWidth[passwordCheck.strength],
                    background: strengthColor[passwordCheck.strength],
                    transition: "width 120ms ease",
                  }}
                />
              </div>
              <p
                data-testid="password-strength-label"
                style={{
                  margin: 0,
                  fontSize: "0.9rem",
                  color: strengthColor[passwordCheck.strength],
                  textTransform: "capitalize",
                }}
              >
                Strength: {passwordCheck.strength}
              </p>
              {!passwordCheck.ok ? (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "1.1rem",
                    color: "#6b7280",
                    fontSize: "0.85rem",
                  }}
                >
                  {passwordCheck.errors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <label style={{ display: "grid", gap: "0.35rem" }}>
            Confirm password
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={{ padding: "0.5rem" }}
            />
          </label>
          {confirmError ? (
            <p style={{ color: "#a40", margin: 0 }}>{confirmError}</p>
          ) : null}
          {error ? <p style={{ color: "#a40", margin: 0 }}>{error}</p> : null}
          {info ? <p style={{ color: "#285", margin: 0 }}>{info}</p> : null}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{ padding: "0.6rem" }}
          >
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p style={{ marginTop: "1rem" }}>
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
