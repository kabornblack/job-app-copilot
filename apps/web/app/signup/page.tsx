"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "../../lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (data.session) {
        router.replace("/");
        router.refresh();
        return;
      }
      // Email confirmation may be required in the Supabase project settings.
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
            Password (min 6 characters)
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: "0.5rem" }}
            />
          </label>
          {error ? <p style={{ color: "#a40", margin: 0 }}>{error}</p> : null}
          {info ? <p style={{ color: "#285", margin: 0 }}>{info}</p> : null}
          <button type="submit" disabled={submitting} style={{ padding: "0.6rem" }}>
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
