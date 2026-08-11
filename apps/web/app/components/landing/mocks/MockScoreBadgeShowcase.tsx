import { Badge } from "@/components/ui/badge";
import MockWindowFrame from "./MockWindowFrame";

const tiers = [
  {
    score: 85,
    tier: "success" as const,
    tierLabel: "Strong match",
    explanation:
      "Skills, seniority, and remote preference all line up closely with this role.",
  },
  {
    score: 52,
    tier: "warning" as const,
    tierLabel: "Possible match",
    explanation:
      "Core skills overlap, but the role leans more senior than your profile.",
  },
  {
    score: 24,
    tier: "destructive" as const,
    tierLabel: "Weak match",
    explanation: "Different tech stack and on-site only — probably skip.",
  },
];

/** Decorative close-up on the score badge system, with the "why" explanation. */
export default function MockScoreBadgeShowcase({
  className,
}: {
  className?: string;
}) {
  return (
    <MockWindowFrame className={className}>
      <div className="space-y-2.5">
        <p className="text-xs font-medium text-muted-foreground">
          Every match, scored and explained
        </p>
        {tiers.map((item) => (
          <div
            key={item.score}
            className="rounded-lg border bg-background p-2.5"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <Badge variant={item.tier} className="text-[10px]">
                {item.score} · {item.tierLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {item.explanation}
            </p>
          </div>
        ))}
      </div>
    </MockWindowFrame>
  );
}
