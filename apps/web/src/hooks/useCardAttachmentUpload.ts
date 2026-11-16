import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";
import { useCallback, useState } from "react";

import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // keep in sync with /api/upload/attachment

/** Gives pasted clipboard images (always named "image.png") a unique, readable name. */
const normaliseFilename = (file: File) => {
  if (file.name && file.name !== "image.png") return file.name;
  const extension = file.type.split("/")[1] ?? "png";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `pasted-${stamp}.${extension}`;
};

/**
 * Uploads one or more files as attachments of a card, then refreshes the card.
 */
export function useCardAttachmentUpload(cardPublicId: string) {
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const [uploading, setUploading] = useState(false);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const valid = files.filter((file) => file.size > 0);
      if (valid.length === 0 || !cardPublicId) return;

      const tooLarge = valid.filter((file) => file.size > MAX_SIZE_BYTES);
      const toUpload = valid.filter((file) => file.size <= MAX_SIZE_BYTES);

      if (tooLarge.length > 0) {
        showPopup({
          header: t`File too large`,
          message: t`Files must be smaller than 50MB: ${tooLarge
            .map((file) => file.name)
            .join(", ")}`,
          icon: "error",
        });
      }

      if (toUpload.length === 0) return;

      setUploading(true);
      const baseUrl = env("NEXT_PUBLIC_BASE_URL") ?? "";
      let failed = 0;

      // Sequential uploads keep activity order predictable and avoid rate limits
      for (const file of toUpload) {
        try {
          const response = await fetch(
            `${baseUrl}/api/upload/attachment?cardPublicId=${encodeURIComponent(cardPublicId)}`,
            {
              method: "POST",
              headers: {
                "Content-Type": file.type || "application/octet-stream",
                "x-original-filename": encodeURIComponent(
                  normaliseFilename(file),
                ),
              },
              body: file,
            },
          );
          if (!response.ok) failed++;
        } catch {
          failed++;
        }
      }

      try {
        await invalidateCard(utils, cardPublicId);
      } finally {
        setUploading(false);
      }

      const succeeded = toUpload.length - failed;

      if (failed > 0) {
        showPopup({
          header: t`Upload failed`,
          message:
            succeeded > 0
              ? t`${succeeded} file(s) uploaded, ${failed} failed. Please try again.`
              : t`Failed to upload attachment. Please try again.`,
          icon: "error",
        });
      } else {
        showPopup({
          header: t`Attachment uploaded`,
          message:
            succeeded > 1
              ? t`${succeeded} files have been uploaded successfully.`
              : t`Your file has been uploaded successfully.`,
          icon: "success",
        });
      }
    },
    [cardPublicId, showPopup, utils],
  );

  return { uploadFiles, uploading };
}
