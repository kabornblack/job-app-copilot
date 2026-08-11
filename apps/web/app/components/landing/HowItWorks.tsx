"use client";

import { motion } from "framer-motion";
import { FileText, MousePointerClick, Search, Sparkles } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Search",
    description:
      "Set your skills, target roles, locations, and salary range. We pull fresh listings from job boards daily.",
  },
  {
    icon: Sparkles,
    title: "AI scoring",
    description:
      "Every listing is scored against your profile with a plain-language explanation of why it's a match.",
  },
  {
    icon: FileText,
    title: "Tailored documents",
    description:
      "Generate a draft CV and cover letter per job, then edit them yourself in a rich text editor.",
  },
  {
    icon: MousePointerClick,
    title: "You review & apply",
    description:
      "Nothing is ever auto-submitted. You click Apply on the company's own site, when you're ready.",
  },
];

export default function HowItWorks() {
  return (
    <section className="border-t bg-muted/20 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-12 max-w-2xl"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            The pipeline
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-muted-foreground">
            The same pipeline, every time — nothing skipped, nothing
            automated past the point of your review.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{
                  duration: 0.45,
                  ease: "easeOut",
                  delay: index * 0.1,
                }}
                className="relative rounded-xl border bg-card p-5"
              >
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <Icon className="size-4.5" />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    Step {index + 1}
                  </span>
                </div>
                <h3 className="text-base font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
