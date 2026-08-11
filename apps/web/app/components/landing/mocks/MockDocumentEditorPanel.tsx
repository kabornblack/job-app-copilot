import MockWindowFrame from "./MockWindowFrame";

const toolbarButtons = ["H1", "H2", "Bold", "Italic", "Bullets"];

/** Decorative document-editor mockup — same Write/Preview + toolbar shape as the real editor. */
export default function MockDocumentEditorPanel({
  className,
}: {
  className?: string;
}) {
  return (
    <MockWindowFrame className={className}>
      <div className="space-y-2.5">
        <p className="text-xs font-medium text-muted-foreground">CV</p>
        <div className="flex gap-1">
          <span className="rounded-md border bg-background px-2.5 py-1 text-xs font-medium">
            Write
          </span>
          <span className="rounded-md px-2.5 py-1 text-xs text-muted-foreground">
            Preview
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {toolbarButtons.map((label) => (
            <span
              key={label}
              className="rounded-md border px-2 py-1 text-[10px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
        <div className="space-y-1 rounded-lg border bg-background p-2.5">
          <p className="text-sm font-semibold">Jordan Example</p>
          <p className="text-xs text-muted-foreground">
            Senior full-stack engineer with 8 years building React and
            Node.js products.
          </p>
          <p className="pt-1 text-xs font-semibold">Experience</p>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
            <li>Led migration to a BullMQ-based processing pipeline.</li>
            <li>Built a Next.js + Fastify job-matching platform end to end.</li>
          </ul>
        </div>
      </div>
    </MockWindowFrame>
  );
}
