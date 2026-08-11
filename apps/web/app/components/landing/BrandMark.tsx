import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
};

/**
 * Small solid-indigo logomark used next to the wordmark in LandingHeader and
 * LandingFooter. The check glyph is a deliberate nod to the product's core
 * promise — every document is human-reviewed before anything goes out.
 */
export default function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
        className,
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </span>
  );
}
