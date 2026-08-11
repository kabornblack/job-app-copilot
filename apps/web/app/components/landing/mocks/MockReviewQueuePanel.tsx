import { Badge } from "@/components/ui/badge";
import MockWindowFrame from "./MockWindowFrame";

type MockRow = {
  title: string;
  company: string;
  location: string;
  status: string;
  score: number;
  tier: "success" | "warning" | "destructive";
  tierLabel: string;
};

const rows: MockRow[] = [
  {
    title: "Senior Frontend Engineer",
    company: "Northwind Labs",
    location: "Remote",
    status: "Found",
    score: 85,
    tier: "success",
    tierLabel: "Strong match",
  },
  {
    title: "Full-stack Developer",
    company: "Ferrovia",
    location: "Tallinn",
    status: "Shortlisted",
    score: 52,
    tier: "warning",
    tierLabel: "Possible match",
  },
  {
    title: "Platform Engineer",
    company: "Ebury",
    location: "Remote",
    status: "Applied",
    score: 78,
    tier: "success",
    tierLabel: "Strong match",
  },
];

/** Decorative review-queue mockup — same Badge/Card pieces as the real app. */
export default function MockReviewQueuePanel({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <MockWindowFrame className={className}>
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background">
            To review (2)
          </span>
          <span className="rounded-md px-2 py-1 text-xs text-muted-foreground">
            Applied (1)
          </span>
          <span className="rounded-md px-2 py-1 text-xs text-muted-foreground">
            Archived (0)
          </span>
        </div>
        <div className="space-y-2">
          {rows.slice(0, compact ? 2 : 3).map((row) => (
            <div
              key={row.title}
              className="rounded-lg border bg-background p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold leading-snug">
                    {row.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.company} · {row.location}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {row.status}
                  </Badge>
                  <Badge variant={row.tier} className="text-[10px]">
                    {row.score} · {row.tierLabel}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MockWindowFrame>
  );
}
