"use client";

import { useActionState, useMemo, useState } from "react";
import {
  approveListing,
  rejectListing,
  type AdminState,
} from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import {
  PROHIBITED_GOODS,
  isCompleteChecklist,
} from "@/lib/compliance/prohibited-goods";

export function ReviewForm({ listingId }: { listingId: string }) {
  const [checked, setChecked] = useState<string[]>([]);
  const complete = useMemo(() => isCompleteChecklist(checked), [checked]);

  const [approveState, approveAction, approving] = useActionState<
    AdminState,
    FormData
  >(approveListing, {});
  const [rejectState, rejectAction, rejecting] = useActionState<
    AdminState,
    FormData
  >(rejectListing, {});

  const error = approveState.error || rejectState.error;
  const busy = approving || rejecting;

  function toggle(id: string) {
    setChecked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">
          Prohibited-goods checklist
        </legend>
        <p className="text-muted-foreground text-xs leading-relaxed">
          From the implementation plan §2.5. Tick every row to record that you
          looked. Approving without a complete checklist is rejected on the
          server, not only in this form.
        </p>
        <ul className="mt-3 space-y-2">
          {PROHIBITED_GOODS.map((item) => (
            <li key={item.id}>
              <label className="flex items-start gap-2 text-sm leading-snug">
                <input
                  type="checkbox"
                  checked={checked.includes(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-1"
                />
                <span>Not {item.label.toLowerCase()}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <form action={approveAction} className="space-y-3">
        <input type="hidden" name="listingId" value={listingId} />
        {checked.map((id) => (
          <input key={id} type="hidden" name="checklist" value={id} />
        ))}
        <Button type="submit" disabled={busy || !complete} className="w-full">
          {approving ? "Approving…" : "Approve and go live"}
        </Button>
      </form>

      <form action={rejectAction} className="space-y-3 border-t pt-6">
        <input type="hidden" name="listingId" value={listingId} />
        <label htmlFor="reviewNote" className="text-sm font-medium">
          Rejection note
        </label>
        <textarea
          id="reviewNote"
          name="reviewNote"
          required
          minLength={8}
          maxLength={2000}
          rows={4}
          placeholder="The seller will see this."
          className="border-input bg-background focus-visible:ring-ring w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={busy}
          className="w-full"
        >
          {rejecting ? "Rejecting…" : "Reject"}
        </Button>
      </form>
    </div>
  );
}
