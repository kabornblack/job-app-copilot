"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

const points = [
  {
    title: "You approve every document",
    description:
      "Generated CVs and cover letters go into a review queue. Nothing downloads or sends until you've read it.",
  },
  {
    title: "You click Apply, always",
    description:
      "We link straight to the job on the company's own site. There is no \"auto-apply\" button anywhere in this product.",
  },
  {
    title: "No employer spam, ever",
    description:
      "A lot of AI job tools quietly blast applications on your behalf. This one architecturally can't — that's not a setting, it's how it's built.",
  },
];

export default function TrustSection() {
  return (
    <section className="border-y bg-primary-subtle py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            How we&apos;re different
          </p>
          <div className="mt-2 mb-10 flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                You&apos;re always the one who hits Apply
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                This is a deliberate design decision, not a missing
                feature — every application still needs a real click from
                you, every time.
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {points.map((point) => (
              <div
                key={point.title}
                className="rounded-xl border-l-2 border-primary bg-card p-5 shadow-sm"
              >
                <h3 className="text-sm font-semibold">{point.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {point.description}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
