"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { getAdminStatus } from "@/lib/admin-api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const baseNavItems = [
  { href: "/dashboard", label: "Review queue" },
  { href: "/profile", label: "Profile" },
] as const;

/** Slim app chrome shown on every authenticated screen. */
export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
    // Backend requireAdmin on the actual admin routes is the real gate -
    // this only controls whether the nav link is shown, good practice on
    // top of the real enforcement, not the enforcement itself.
    getAdminStatus()
      .then(({ isAdmin: admin }) => setIsAdmin(admin))
      .catch(() => setIsAdmin(false));
  }, []);

  const navItems = isAdmin
    ? [...baseNavItems, { href: "/admin", label: "Admin" } as const]
    : baseNavItems;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-wide text-foreground"
          >
            JOB APPLICATION COPILOT
          </Link>
          <nav className="flex items-center gap-4">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm transition-colors hover:text-foreground",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {email ?? "Signed in"}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
