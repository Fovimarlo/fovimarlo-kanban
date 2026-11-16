import { t } from "@lingui/core/macro";
import { useRef } from "react";
import { HiOutlinePaperClip } from "react-icons/hi";
import { HiCheckBadge } from "react-icons/hi2";

import Button from "~/components/Button";
import { useCardAttachmentUpload } from "~/hooks/useCardAttachmentUpload";
import { useModal } from "~/providers/modal";
import { CardFileDropZone } from "./CardFileDropZone";

export function AttachmentUpload({ cardPublicId }: { cardPublicId: string }) {
  const { openModal } = useModal();
  const { uploadFiles, uploading } = useCardAttachmentUpload(cardPublicId);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset input so selecting the same file again still triggers onChange
    event.target.value = "";
    if (files.length > 0) void uploadFiles(files);
  };

  return (
    <div className="mb-6">
      {/* Drop files anywhere in the window, or paste images, to attach them */}
      <CardFileDropZone
        onFiles={(files) => void uploadFiles(files)}
        disabled={uploading}
      />
      <input
        ref={inputRef}
        type="file"
        id="attachment-upload"
        className="hidden"
        multiple
        onChange={handleFileSelect}
        disabled={uploading}
      />
      <div className="flex flex-wrap items-center gap-2 p-2">
        <Button
          type="button"
          variant="secondary"
          iconLeft={
            <HiCheckBadge className="h-4 w-4 text-light-950 dark:text-dark-950" />
          }
          size="sm"
          onClick={() => openModal("ADD_CHECKLIST")}
        >
          {t`New checklist`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          iconLeft={
            <HiOutlinePaperClip className="h-4 w-4 text-light-950 dark:text-dark-950" />
          }
          isLoading={uploading}
          disabled={uploading}
          size="sm"
          onClick={() => inputRef.current?.click()}
        >
          {t`Add attachment`}
        </Button>
        <span className="hidden text-xs text-light-800 dark:text-dark-800 md:inline">
          {t`or drop files anywhere / paste an image`}
        </span>
      </div>
    </div>
  );
}
