import { t } from "@lingui/core/macro";
import { useState } from "react";

import Button from "~/components/Button";
import { formatDuration, parseDuration } from "../utils";

export interface WorkLogFormValues {
  content: string;
  durationMinutes: number | null;
  boardPublicId: string | null;
}

const fieldClassName =
  "block w-full rounded-md border-0 bg-white/5 px-3 py-1.5 text-sm text-neutral-900 shadow-sm ring-1 ring-inset ring-light-600 placeholder:text-light-800 focus:ring-2 focus:ring-inset focus:ring-light-700 focus-visible:outline-none dark:text-dark-1000 dark:ring-dark-700 dark:placeholder:text-dark-800 dark:focus:ring-dark-700";

export function WorkLogEntryForm({
  boards,
  initialValues,
  isSubmitting,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  boards: { publicId: string; name: string }[];
  initialValues?: WorkLogFormValues;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: WorkLogFormValues) => Promise<unknown>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [content, setContent] = useState(initialValues?.content ?? "");
  const [duration, setDuration] = useState(
    initialValues?.durationMinutes
      ? formatDuration(initialValues.durationMinutes)
      : "",
  );
  const [boardPublicId, setBoardPublicId] = useState(
    initialValues?.boardPublicId ?? "",
  );

  const parsedDuration = parseDuration(duration);
  const durationInvalid = parsedDuration === undefined;
  const canSubmit = content.trim().length > 0 && !durationInvalid;

  const submit = async () => {
    if (!canSubmit || isSubmitting) return;
    try {
      await onSubmit({
        content: content.trim(),
        durationMinutes: parsedDuration ?? null,
        boardPublicId: boardPublicId || null,
      });
      if (!initialValues) {
        // Keep the brand selected so consecutive entries are quicker to add
        setContent("");
        setDuration("");
      }
    } catch {
      // Errors are surfaced by the mutation's onError popup
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3"
    >
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape" && onCancel) onCancel();
        }}
        rows={3}
        autoFocus={autoFocus}
        maxLength={5000}
        placeholder={t`What did you work on?`}
        aria-label={t`What did you work on?`}
        className={`${fieldClassName} resize-y`}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <select
          value={boardPublicId}
          onChange={(e) => setBoardPublicId(e.target.value)}
          aria-label={t`Brand / board`}
          className={`${fieldClassName} sm:w-56`}
        >
          <option value="">{t`No brand / board`}</option>
          {boards.map((board) => (
            <option key={board.publicId} value={board.publicId}>
              {board.name}
            </option>
          ))}
        </select>
        <div className="flex flex-col gap-1 sm:w-40">
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={t`Duration (e.g. 1h 30m)`}
            aria-label={t`Duration`}
            aria-invalid={durationInvalid}
            className={`${fieldClassName} ${durationInvalid ? "ring-red-500 dark:ring-red-500" : ""}`}
          />
          {durationInvalid && (
            <span className="text-xs text-red-500">{t`Use e.g. 45m, 2h or 1:30`}</span>
          )}
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCancel}
            >
              {t`Cancel`}
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            isLoading={isSubmitting}
            disabled={!canSubmit || isSubmitting}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
