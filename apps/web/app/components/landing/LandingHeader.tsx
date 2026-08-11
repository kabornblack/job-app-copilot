import Link from "next/link";
import { Button } from "@/components/ui/button";
import BrandMark from "./BrandMark";

/** Public-facing header for the landing page — no auth state, unlike TopBar. */
export default function LandingHeader() {
  return (
    <header className="border-b bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-wide text-foreground"
        >
          <BrandMark />
          JOB APPLICATION COPILOT
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
