import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";
import { useRef, useState } from "react";
import { HiOutlinePhoto, HiXMark } from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // keep in sync with /api/upload/board-background
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function BoardBackgroundForm({
  boardPublicId,
  backgroundImageUrl,
}: {
  boardPublicId: string;
  backgroundImageUrl: string | null;
}) {
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const refresh = async () => {
    await Promise.all([
      utils.board.byId.invalidate({ boardPublicId }),
      utils.board.all.invalidate(),
    ]);
  };

  const removeBackground = api.board.removeBackgroundImage.useMutation({
    onSuccess: async () => {
      await refresh();
      showPopup({
        header: t`Brand image removed`,
        message: t`The board background has been removed.`,
        icon: "success",
      });
    },
    onError: () => {
      showPopup({
        header: t`Unable to remove image`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
  });

  const uploadFile = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      showPopup({
        header: t`Unsupported file`,
        message: t`Please choose a JPG, PNG, WEBP or GIF image.`,
        icon: "error",
      });
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      showPopup({
        header: t`File too large`,
        message: t`The image must be smaller than 10MB.`,
        icon: "error",
      });
      return;
    }

    setUploading(true);
    try {
      const baseUrl = env("NEXT_PUBLIC_BASE_URL") ?? "";
      const response = await fetch(
        `${baseUrl}/api/upload/board-background?boardPublicId=${encodeURIComponent(boardPublicId)}`,
        {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        },
      );

      if (!response.ok) throw new Error("Upload failed");

      await refresh();
      showPopup({
        header: t`Brand image updated`,
        message: t`The board background has been updated.`,
        icon: "success",
      });
      closeModal();
    } catch {
      showPopup({
        header: t`Upload failed`,
        message: t`Failed to upload the image. Please try again.`,
        icon: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !uploading) void uploadFile(file);
  };

  return (
    <div>
      <div className="px-5 pt-5">
        <div className="flex w-full items-center justify-between pb-4">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
            {t`Brand image`}
          </h2>
          <button
            type="button"
            className="rounded p-1 hover:bg-light-200 focus:outline-none dark:hover:bg-dark-300"
            onClick={closeModal}
            aria-label={t`Close`}
          >
            <HiXMark size={18} className="text-light-900 dark:text-dark-900" />
          </button>
        </div>

        <p className="pb-4 text-sm text-light-900 dark:text-dark-900">
          {t`Add the brand's logo or a background image. It is shown behind the board and on the boards overview.`}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadFile(file);
          }}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          disabled={uploading}
          className={twMerge(
            "relative flex h-40 w-full items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-light-400 bg-light-100 bg-cover bg-center text-sm text-light-900 transition-colors hover:border-light-600 dark:border-dark-400 dark:bg-dark-100 dark:text-dark-900 dark:hover:border-dark-600",
            isDragging && "border-light-800 dark:border-dark-800",
          )}
          style={
            backgroundImageUrl
              ? { backgroundImage: `url("${backgroundImageUrl}")` }
              : undefined
          }
        >
          <span
            className={twMerge(
              "flex items-center gap-2 rounded-md px-3 py-1.5",
              backgroundImageUrl &&
                "bg-light-50/90 text-light-1000 dark:bg-dark-50/90 dark:text-dark-1000",
            )}
          >
            <HiOutlinePhoto className="h-5 w-5" />
            {uploading
              ? t`Uploading...`
              : backgroundImageUrl
                ? t`Click or drop to replace`
                : t`Click or drop an image here`}
          </span>
        </button>
        <p className="pt-2 text-xs text-light-800 dark:text-dark-800">
          {t`JPG, PNG, WEBP or GIF, up to 10MB.`}
        </p>
      </div>
      <div className="mt-8 flex items-center justify-end gap-2 border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        {backgroundImageUrl && (
          <Button
            variant="secondary"
            onClick={() => removeBackground.mutate({ boardPublicId })}
            isLoading={removeBackground.isPending}
            disabled={removeBackground.isPending || uploading}
          >
            {t`Remove image`}
          </Button>
        )}
        <Button
          onClick={() => inputRef.current?.click()}
          isLoading={uploading}
          disabled={uploading}
        >
          {backgroundImageUrl ? t`Replace image` : t`Upload image`}
        </Button>
      </div>
    </div>
  );
}
