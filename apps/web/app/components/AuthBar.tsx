"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function AuthBar() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        marginBottom: "1rem",
        fontSize: "0.95rem",
      }}
    >
      <span style={{ color: "#444" }}>{email ?? "Signed in"}</span>
      <button type="button" onClick={handleLogout} style={{ padding: "0.35rem 0.75rem" }}>
        Log out
      </button>
    </div>
  );
}
