"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cross-fades through a listing's photographs while the pointer is over it.
 *
 * This is the answer to "can we have video on the tiles". We have no footage,
 * stock costs money and carries licence terms, and a 1080p loop is several
 * megabytes that would wreck load time on the mobile networks this product is
 * aimed at. But Phase 3 gave every listing up to eight real photographs of the
 * actual item — so hovering cycles those instead.
 *
 * It is better than video here, not merely cheaper: a bidder hovering a lot
 * wants to see the item from several angles, which is exactly what this shows
 * and what a stock clip never could.
 *
 * Behaviour:
 *   - Nothing happens until the pointer arrives. No timers run on a page of
 *     forty tiles; only the hovered one ticks.
 *   - Images after the first are fetched on first hover, not on page load, so
 *     the grid still costs one image per tile.
 *   - Returns to the cover image on leave, so the grid looks the same at rest.
 *   - Inert under prefers-reduced-motion and on coarse pointers, where there
 *     is no hover to respond to.
 */
export function PhotoCycler({
  images,
  alt,
  className = "",
  intervalMs = 1100,
}: {
  images: string[];
  alt: string;
  className?: string;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const canCycle = images.length > 1;

  useEffect(() => {
    if (!armed || !canCycle) return;

    timer.current = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, intervalMs);

    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [armed, canCycle, images.length, intervalMs]);

  function start() {
    if (!canCycle) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    setArmed(true);
  }

  function stop() {
    setArmed(false);
    setIndex(0);
  }

  return (
    <div
      className={`relative ${className}`}
      onPointerEnter={start}
      onPointerLeave={stop}
    >
      {/*
        Only the cover is in the DOM until a pointer actually arrives.

        These started out all mounted with loading="lazy" on the extras, which
        does not do what it looks like: lazy defers to the VIEWPORT, not to
        hover. So the rail downloaded every variant of every card the moment it
        scrolled into view — several images per tile, including on touch
        devices where cycling can never start at all. Mounting on demand is the
        only thing that genuinely defers them.
      */}
      {(armed ? images : images.slice(0, 1)).map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          // Only the cover carries the description. The rest are additional
          // views of the same object, so announcing each one would just repeat
          // the title to a screen reader three more times.
          alt={i === 0 ? alt : ""}
          aria-hidden={i === 0 ? undefined : true}
          // The first image is part of the initial paint; the others are only
          // ever seen after a deliberate hover.
          loading={i === 0 ? "eager" : "lazy"}
          decoding="async"
          className={[
            "absolute inset-0 h-full w-full object-cover",
            "transition-opacity duration-[420ms] ease-[var(--bk-ease)]",
            "motion-reduce:transition-none",
            i === index ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
      ))}

      {canCycle && (
        <div
          aria-hidden="true"
          className="absolute right-2.5 bottom-2.5 z-[6] flex gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        >
          {images.map((src, i) => (
            <span
              key={src}
              className={[
                "h-[3px] w-3.5 rounded-full transition-colors duration-300",
                i === index ? "bg-white/90" : "bg-white/25",
              ].join(" ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
