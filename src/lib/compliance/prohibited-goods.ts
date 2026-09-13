/**
 * The moderation checklist, from implementationplan.md §2.5 and
 * docs/COMPLIANCE.md §6.
 *
 * These are the goods a listing must not be. The admin ticks each row to
 * record that they looked. Ticking is not a legal determination and the
 * Server Action still requires the complete set — a crafted POST that skips
 * the boxes is rejected the same way.
 */

export const PROHIBITED_GOODS = [
  {
    id: "weapons",
    label: "Weapons and ammunition",
  },
  {
    id: "explosives",
    label: "Explosives and hazardous chemicals",
  },
  {
    id: "narcotics",
    label: "Narcotics (NDPS Act 1985)",
  },
  {
    id: "wildlife",
    label: "Wildlife products (Wildlife Protection Act 1972 / CITES)",
  },
  {
    id: "counterfeit",
    label: "Counterfeit and IP-infringing goods",
  },
  {
    id: "tobacco",
    label: "Tobacco, e-cigarettes, or vaping products (banned nationwide since 2019)",
  },
  {
    id: "prescription",
    label: "Prescription drugs and medical devices",
  },
  {
    id: "antiquities",
    label: "Antiquities (Antiquities and Art Treasures Act 1972)",
  },
  {
    id: "maps",
    label: "Maps that misrepresent India’s borders",
  },
  {
    id: "adult",
    label: "Adult content",
  },
  {
    id: "stolen",
    label: "Stolen goods",
  },
  {
    id: "personal-data",
    label: "Personal data or databases",
  },
] as const;

export type ProhibitedGoodId = (typeof PROHIBITED_GOODS)[number]["id"];

export function isCompleteChecklist(checked: readonly string[]): boolean {
  const set = new Set(checked);
  return PROHIBITED_GOODS.every((item) => set.has(item.id));
}
