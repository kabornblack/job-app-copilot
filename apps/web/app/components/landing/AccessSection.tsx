"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function AccessSection() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center sm:p-12"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Getting started
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Early access
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Job Application Copilot is in active development. Create a free
            trial account today — daily search and generation limits apply
            while we scale up. Have feedback or want a higher-limit account?
            Reach out, we&apos;d love to hear from you.
          </p>
          <div className="mt-6">
            <Button asChild size="lg">
              <Link href="/signup">Create your account</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
