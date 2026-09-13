/**
 * The reading-progress rule under the header.
 *
 * A server component with no JavaScript at all. It runs on native CSS
 * scroll-driven animation — `animation-timeline: scroll()` — so the browser
 * drives it off the scroll offset directly, on the compositor.
 *
 * Before this existed, a progress bar meant a scroll listener recomputing
 * `scrollTop / scrollHeight` and writing a width on every frame: main-thread
 * work, layout reads during scroll, and the usual source of scroll jank.
 *
 * The rule lives in globals.css inside `@supports (animation-timeline:
 * scroll())`, so where it is unavailable this collapses to a 2px line at zero
 * width — invisible and harmless. Nothing load-bearing depends on it.
 */
export function ScrollProgress() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-[57px] z-30 h-0.5 w-full bg-transparent"
    >
      <div className="bk-progress h-full origin-left scale-x-0 bg-[linear-gradient(90deg,var(--bk-accent-deep),var(--bk-accent-bright))]" />
    </div>
  );
}
