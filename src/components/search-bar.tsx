"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";

/**
 * Search box.
 *
 * Submits as a GET form to a URL query parameter rather than holding results in
 * client state. That means a search is a real, shareable, bookmarkable URL that
 * renders on the server — which matters here because the whole point of Phase 2
 * is that the catalogue works, and is crawlable, without an account.
 *
 * The term is never interpolated into SQL. It is passed as an RPC argument to
 * `search_listings`, which Supabase parameterises, and `websearch_to_tsquery`
 * on the other side does not raise on malformed input — so a stray quote or a
 * lone operator is a zero-result search, not an error page.
 */
export function SearchBar({
  placeholder = "Search listings",
}: {
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [value, setValue] = useState(params.get("q") ?? "");

  function submit(term: string) {
    const next = new URLSearchParams(params.toString());
    const trimmed = term.trim();

    if (trimmed) {
      next.set("q", trimmed);
    } else {
      next.delete("q");
    }
    // Any new search starts at the first page; keeping the old offset would
    // silently show page 3 of a 1-page result set, which looks like "no results".
    next.delete("page");

    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      className="relative w-full"
    >
      <label htmlFor="listing-search" className="sr-only">
        Search listings
      </label>

      <Search
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />

      <input
        id="listing-search"
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-lg border border-border bg-[#0E1116] py-2 pr-9 pl-9 text-sm outline-none transition-colors duration-200 placeholder:text-[var(--bk-subtle)] focus-visible:border-[rgba(62,123,250,0.6)] focus-visible:ring-2 focus-visible:ring-[var(--bk-accent)]/40"
      />

      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            submit("");
          }}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
        >
          <X className="size-4" />
        </button>
      )}

      {pending && (
        <span className="sr-only" role="status">
          Searching
        </span>
      )}
    </form>
  );
}
