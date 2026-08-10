"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
        <h1>Log in</h1>
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
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ padding: "0.5rem" }}
            />
          </label>
          {error ? <p style={{ color: "#a40", margin: 0 }}>{error}</p> : null}
          <button type="submit" disabled={submitting} style={{ padding: "0.6rem" }}>
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p style={{ marginTop: "1rem" }}>
          No account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
