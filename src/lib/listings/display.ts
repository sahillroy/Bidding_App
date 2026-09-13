/**
 * Display constants and public listing types.
 *
 * Safe to import from Client Components. Keep server/Supabase imports out.
 */

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
};

export const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  for_parts: "For parts",
};
