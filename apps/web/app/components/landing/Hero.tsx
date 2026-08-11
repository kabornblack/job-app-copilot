"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import MockReviewQueuePanel from "./mocks/MockReviewQueuePanel";

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="landing-gradient absolute left-1/2 top-1/3 h-140 w-140 -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-br from-primary/25 via-primary/5 to-transparent blur-3xl" />
        <div className="landing-gradient absolute right-[8%] bottom-[10%] h-72 w-72 rounded-full bg-linear-to-br from-primary/15 via-primary/5 to-transparent blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:items-center lg:py-32">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="space-y-6"
        >
          <motion.p
            variants={itemVariants}
            className="text-xs font-semibold uppercase tracking-widest text-primary"
          >
            AI-powered job search
          </motion.p>
          <motion.h1
            variants={itemVariants}
            className="text-4xl font-bold tracking-tight text-balance sm:text-5xl"
          >
            Job matching, scored and drafted by AI — you&apos;re always the
            one who applies.
          </motion.h1>
          <motion.p
            variants={itemVariants}
            className="max-w-xl text-lg text-muted-foreground text-pretty"
          >
            We search job boards, score every listing against your profile
            with a clear explanation, draft a tailored CV and cover letter
            you can edit, and track each application through to offer.
          </motion.p>
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap items-center gap-3"
          >
            <motion.div
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              className="inline-block"
            >
              <Button asChild size="lg" className="shadow-lg shadow-primary/25">
                <Link href="/signup">Get started</Link>
              </Button>
            </motion.div>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">Log in</Link>
            </Button>
          </motion.div>
          <motion.p
            variants={itemVariants}
            className="text-sm text-muted-foreground"
          >
            No auto-submit · Human-reviewed · Free trial
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: "easeOut" }}
        >
          <MockReviewQueuePanel />
        </motion.div>
      </div>
    </section>
  );
}
