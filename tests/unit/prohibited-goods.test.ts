import { describe, it, expect } from "vitest";
import {
  PROHIBITED_GOODS,
  isCompleteChecklist,
} from "@/lib/compliance/prohibited-goods";

describe("prohibited-goods checklist", () => {
  it("covers every item from the plan §2.5 list", () => {
    const ids = PROHIBITED_GOODS.map((item) => item.id);
    expect(ids).toEqual([
      "weapons",
      "explosives",
      "narcotics",
      "wildlife",
      "counterfeit",
      "tobacco",
      "prescription",
      "antiquities",
      "maps",
      "adult",
      "stolen",
      "personal-data",
    ]);
  });

  it("is incomplete until every row is ticked", () => {
    expect(isCompleteChecklist([])).toBe(false);
    expect(isCompleteChecklist(PROHIBITED_GOODS.map((item) => item.id))).toBe(
      true,
    );
    expect(
      isCompleteChecklist(PROHIBITED_GOODS.slice(1).map((item) => item.id)),
    ).toBe(false);
  });
});
