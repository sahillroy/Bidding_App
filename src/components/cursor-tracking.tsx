"use client";

import { useEffect } from "react";

/**
 * Pointer tracking for the card hover: 3D tilt, the spotlight that follows the
 * cursor, and the parallax drift of the artwork against it.
 *
 * This is the ONLY JavaScript in the visual direction. Every other layer — the
 * border, the glow, the corner brackets, the lift, the reveal, the shine sweep
 * and every scroll effect — is pure CSS.
 *
 * Why it is shaped the way it is:
 *
 *   - ONE delegated listener on the document, not one per card. A grid of 40
 *     cards would otherwise mean 120 listeners.
 *   - The card's rect is measured once on `pointerover`, when the pointer
 *     first enters a card, and cached. Measuring inside the move handler would
 *     force a synchronous layout on every mouse movement — the classic cause
 *     of a janky hover.
 *   - Movements are coalesced into a single `requestAnimationFrame`, so the
 *     browser does at most one style update per frame regardless of how fast
 *     the pointer reports.
 *   - The handler only ever writes CSS custom properties. It never reads
 *     layout, never touches className, and never triggers React.
 *
 * Mount it once, high in the tree. It does nothing until a pointer enters a
 * `[data-tilt]` element, and it removes itself cleanly.
 */
export function CursorTracking() {
  useEffect(() => {
    // Anyone who has asked their system to reduce motion gets none of this.
    // The colour changes still happen — they are CSS — so the card is still
    // obviously interactive. The movement simply does not occur.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches) return;

    // A coarse pointer is a finger. There is no hover to track, and the rect
    // work would be wasted on every tap.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let active: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    let frame = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      frame = 0;
      if (!active || !rect) return;

      const px = (x - rect.left) / rect.width;
      const py = (y - rect.top) / rect.height;

      // Spotlight centre.
      active.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
      active.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);

      // Tilt. Capped at 3.6 degrees: past roughly four, it stops reading as a
      // physical object responding and starts reading as a gimmick.
      active.style.setProperty("--rx", `${((0.5 - py) * 3.6).toFixed(2)}deg`);
      active.style.setProperty("--ry", `${((px - 0.5) * 3.6).toFixed(2)}deg`);

      // The artwork drifts AGAINST the cursor, so it reads as sitting behind
      // the frame rather than being painted onto it.
      active.style.setProperty("--px", `${((0.5 - px) * 10).toFixed(1)}px`);
      active.style.setProperty("--py", `${((0.5 - py) * 10).toFixed(1)}px`);
    };

    const clear = (el: HTMLElement) => {
      for (const prop of ["--rx", "--ry", "--px", "--py"]) {
        el.style.removeProperty(prop);
      }
    };

    const onOver = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.(
        "[data-tilt]",
      ) as HTMLElement | null;

      if (card === active) return;
      if (active) clear(active);

      active = card;
      // Measured once, here — never in the move handler.
      rect = card ? card.getBoundingClientRect() : null;
    };

    const onMove = (event: PointerEvent) => {
      if (!active) return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onLeave = () => {
      if (active) clear(active);
      active = null;
      rect = null;
    };

    // A scroll invalidates the cached rect.
    //
    // This comment used to say it was cheaper to drop the effect than to
    // re-measure, and then the code re-measured — synchronously, on every
    // scroll event, which is the forced layout the rest of this file goes out
    // of its way to avoid.
    //
    // Dropping it is what the comment always claimed. As far as the tilt is
    // concerned the pointer has left the card, and the next pointermove
    // re-arms it through pointerover anyway.
    const onScroll = () => {
      if (!active) return;
      clear(active);
      active = null;
      rect = null;
    };

    document.addEventListener("pointerover", onOver, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (active) clear(active);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
