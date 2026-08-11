import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MockWindowFrameProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Shared "browser window" chrome for the decorative product mockups used on
 * the landing page (Hero + Showcase carousel). Purely presentational — no
 * real screenshots, just the actual design-system pieces (Card/Badge/etc.)
 * arranged to read as a product moment, wrapped so it visually reads as a
 * window rather than a raw content block. Internal spacing is tuned to
 * match the real (compacted) dashboard density.
 */
export default function MockWindowFrame({
  children,
  className,
}: MockWindowFrameProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-xl ring-1 ring-foreground/5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
        <span className="size-2.5 rounded-full bg-destructive/40" />
        <span className="size-2.5 rounded-full bg-warning/40" />
        <span className="size-2.5 rounded-full bg-success/40" />
        <span className="ml-2 flex-1 truncate rounded-sm bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
          app.jobapplicationcopilot.com/dashboard
        </span>
      </div>
      <div className="p-3.5 sm:p-4">{children}</div>
    </div>
  );
}
