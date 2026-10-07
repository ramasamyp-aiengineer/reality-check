import Autoplay from "embla-carousel-autoplay";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, Sparkles, Zap } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NodeLive } from "@/lib/sse";
import { cn, prefersReducedMotion } from "@/lib/utils";
import { WorkflowCanvas } from "./flow/WorkflowCanvas";
import { SLIDE_AGENTS, SLIDES, type Slide } from "./slides";
import { Button } from "./ui/button";

function topoOrder(slide: Slide): string[][] {
  const indeg: Record<string, number> = {};
  slide.graph.nodes.forEach((n) => (indeg[n.id] = 0));
  slide.graph.edges.forEach((e) => (indeg[e.target] += 1));
  const levels: string[][] = [];
  let frontier = Object.keys(indeg).filter((k) => indeg[k] === 0);
  const seen = new Set<string>();
  while (frontier.length) {
    levels.push(frontier);
    frontier.forEach((f) => seen.add(f));
    const next: string[] = [];
    slide.graph.edges.forEach((e) => {
      if (frontier.includes(e.source)) {
        indeg[e.target] -= 1;
        if (indeg[e.target] === 0 && !seen.has(e.target)) next.push(e.target);
      }
    });
    frontier = Array.from(new Set(next));
  }
  return levels;
}

function useSimulatedRun(slide: Slide, active: boolean): Record<string, NodeLive> | undefined {
  const levels = useMemo(() => topoOrder(slide), [slide]);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    setStep(0);
    const id = window.setInterval(() => setStep((s) => (s + 1) % (levels.length * 2 + 3)), 650);
    return () => window.clearInterval(id);
  }, [active, levels]);
  if (!active || prefersReducedMotion()) return undefined;
  const live: Record<string, NodeLive> = {};
  levels.forEach((lvl, i) => {
    const state = step >= i * 2 + 2 ? "done" : step >= i * 2 + 1 ? "running" : "waiting";
    lvl.forEach((id) => (live[id] = { state, searches: 0, evidence: 0, engines: [] }));
  });
  return live;
}

function SlideCard({ slide, active, onRun, onOpen }: { slide: Slide; active: boolean; onRun: (s: Slide) => void; onOpen?: (s: Slide) => void }) {
  const { t } = useTranslation();
  const live = useSimulatedRun(slide, active);
  return (
    <div className="relative grid h-full min-h-[280px] grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface lg:grid-cols-[1.05fr_1fr]">
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full opacity-[0.13]" style={{ background: slide.accent }} />
      <div className="relative z-10 flex flex-col justify-center gap-4 p-7 lg:p-9">
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={slide.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: slide.accent, borderColor: `${slide.accent}55`, background: `${slide.accent}14` }}
              >
                {slide.key === "ai" ? <Sparkles className="size-3" /> : <Zap className="size-3" />}
                {slide.eyebrow}
              </span>
              <h2 className="max-w-xl text-[26px] font-semibold leading-[1.15] tracking-tight lg:text-[30px]">{t(`slides.${slide.key}.title`)}</h2>
              <p className="max-w-lg text-[14px] leading-relaxed text-muted">{t(`slides.${slide.key}.sub`)}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="lg" onClick={() => onRun(slide)} style={{ background: slide.accent }} className="text-white hover:opacity-90">
                  {slide.key === "ai" ? "Describe a workflow" : t("common.tryDemo")}
                  <ArrowRight />
                </Button>
                {onOpen && slide.templateId && (
                  <Button size="lg" variant="ghost" onClick={() => onOpen(slide)}>
                    Open in Studio
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="relative hidden border-l border-border bg-surface-2/50 lg:block">
        <div className="absolute left-4 right-4 top-3 z-10 flex items-center justify-between text-[11px] text-subtle">
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: slide.accent }} />
              <span className="relative inline-flex size-2 rounded-full" style={{ background: slide.accent }} />
            </span>
            Live workflow preview
          </span>
          <span className="tabular">~{slide.searches} SerpApi searches</span>
        </div>
        <div className="absolute inset-0 pt-8">
          <WorkflowCanvas workflow={slide.graph} agents={SLIDE_AGENTS} variant="mini" live={live} />
        </div>
      </div>
    </div>
  );
}

export function BannerSlider({ onRun, onOpen, className }: { onRun: (s: Slide) => void; onOpen?: (s: Slide) => void; className?: string }) {
  const autoplay = useMemo(
    () => Autoplay({ delay: 6000, stopOnInteraction: false, stopOnMouseEnter: true, playOnInit: !prefersReducedMotion() }),
    [],
  );
  const [emblaRef, embla] = useEmblaCarousel({ loop: true, duration: 28 }, [autoplay]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(!prefersReducedMotion());

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setIndex(embla.selectedScrollSnap());
    embla.on("select", onSelect);
    onSelect();
    return () => {
      embla.off("select", onSelect);
    };
  }, [embla]);

  const go = useCallback((i: number) => embla?.scrollTo(i), [embla]);
  const toggle = () => {
    const plugin = embla?.plugins().autoplay;
    if (!plugin) return;
    if (plugin.isPlaying()) plugin.stop();
    else plugin.play();
    setPlaying(plugin.isPlaying());
  };

  return (
    <section
      className={cn("relative", className)}
      aria-roledescription="carousel"
      aria-label="Featured workflows"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") embla?.scrollPrev();
        if (e.key === "ArrowRight") embla?.scrollNext();
      }}
    >
      <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
        <div className="flex">
          {SLIDES.map((s, i) => (
            <div key={s.key} className="min-w-0 flex-[0_0_100%] pr-px" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${SLIDES.length}`}>
              <SlideCard slide={s} active={i === index} onRun={onRun} onOpen={onOpen} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5" role="tablist">
          {SLIDES.map((s, i) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              className={cn("h-1.5 rounded-full transition-all duration-300", i === index ? "w-7" : "w-1.5 bg-border-strong hover:bg-subtle")}
              style={i === index ? { background: s.accent } : undefined}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={playing ? "Pause slides" : "Play slides"}>
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => embla?.scrollPrev()} aria-label="Previous slide">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => embla?.scrollNext()} aria-label="Next slide">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
