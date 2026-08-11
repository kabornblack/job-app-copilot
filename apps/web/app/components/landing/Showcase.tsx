"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import MockReviewQueuePanel from "./mocks/MockReviewQueuePanel";
import MockScoreBadgeShowcase from "./mocks/MockScoreBadgeShowcase";
import MockDocumentEditorPanel from "./mocks/MockDocumentEditorPanel";

// Only one slide is ever visible at a time in this carousel, so the ring
// accent below is a static "you're looking at the product" treatment, not
// tied to which slide is active — there's nothing to visually compare it
// against.
const MOCK_RING = "ring-2 ring-primary/15";

const slides = [
  {
    caption: "Every match lands in one queue, ready to review",
    render: () => <MockReviewQueuePanel className={MOCK_RING} />,
  },
  {
    caption: "See exactly why it's a match — not just a number",
    render: () => <MockScoreBadgeShowcase className={MOCK_RING} />,
  },
  {
    caption: "Edit before you send — nothing goes out unreviewed",
    render: () => <MockDocumentEditorPanel className={MOCK_RING} />,
  },
];

export default function Showcase() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => setCurrent(api.selectedScrollSnap()));
  }, [api]);

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-10 max-w-2xl"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Product tour
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            See it in action
          </h2>
          <p className="mt-3 text-muted-foreground">
            Real product moments — no fake reviews, just the actual review
            queue, scoring, and document editor.
          </p>
        </motion.div>

        <div className="mx-auto max-w-xl px-8 sm:px-12">
          <Carousel
            setApi={setApi}
            opts={{ loop: true }}
            plugins={[
              Autoplay({ delay: 4500, stopOnInteraction: false, stopOnMouseEnter: true }),
            ]}
          >
            <CarouselContent>
              {slides.map((slide) => (
                <CarouselItem key={slide.caption}>
                  <div className="space-y-4">
                    {slide.render()}
                    <p className="text-center text-sm text-muted-foreground">
                      {slide.caption}
                    </p>
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="hidden sm:flex" />
            <CarouselNext className="hidden sm:flex" />
          </Carousel>

          <div className="mt-4 flex items-center justify-center gap-1.5">
            {slides.map((slide, index) => (
              <span
                key={slide.caption}
                aria-hidden="true"
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === current
                    ? "w-5 bg-primary"
                    : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
