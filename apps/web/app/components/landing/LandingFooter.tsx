import Link from "next/link";
import BrandMark from "./BrandMark";

const year = new Date().getFullYear();

/**
 * Placeholder contact — feedback@example.com is intentionally fake.
 * Swap for a real address before this page goes live.
 */
export default function LandingFooter() {
  return (
    <footer className="border-t py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6 sm:text-left">
        <span className="flex items-center gap-2 font-semibold tracking-wide text-foreground">
          <BrandMark />
          JOB APPLICATION COPILOT
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>© {year}</span>
          <Link href="/login" className="hover:text-foreground">
            Log in
          </Link>
          <Link href="/signup" className="hover:text-foreground">
            Sign up
          </Link>
          <a href="mailto:feedback@example.com" className="hover:text-foreground">
            Feedback
          </a>
        </div>
      </div>
    </footer>
  );
}
