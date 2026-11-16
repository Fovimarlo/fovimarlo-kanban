import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { HiOutlineCloudArrowUp } from "react-icons/hi2";

const hasFiles = (dataTransfer: DataTransfer | null) =>
  !!dataTransfer && Array.from(dataTransfer.types).includes("Files");

/**
 * Lets the user drop files anywhere in the browser window (or paste images
 * from the clipboard) to attach them to the open card.
 *
 * Listeners run in the capture phase so the drop never reaches the rich-text
 * editor or the browser's default "open the file in this tab" behaviour.
 */
export function CardFileDropZone({
  onFiles,
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const reset = () => {
      dragDepth.current = 0;
      setIsDragging(false);
    };

    const handleDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      // Required for the drop event to fire instead of navigating to the file
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setIsDragging(false);
    };

    const handleDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      reset();
      if (disabled) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) onFilesRef.current(files);
    };

    const handlePaste = (e: ClipboardEvent) => {
      if (disabled) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      // Office apps put a picture of the selection next to the text; when the
      // user is pasting into a text field, keep the text paste.
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA");
      if (isEditable && e.clipboardData?.getData("text/plain").trim()) return;
      // Pasted files (e.g. screenshots) become attachments; plain text paste is untouched
      e.preventDefault();
      e.stopPropagation();
      onFilesRef.current(files);
    };

    window.addEventListener("dragenter", handleDragEnter, true);
    window.addEventListener("dragover", handleDragOver, true);
    window.addEventListener("dragleave", handleDragLeave, true);
    window.addEventListener("drop", handleDrop, true);
    window.addEventListener("dragend", reset, true);
    window.addEventListener("paste", handlePaste, true);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter, true);
      window.removeEventListener("dragover", handleDragOver, true);
      window.removeEventListener("dragleave", handleDragLeave, true);
      window.removeEventListener("drop", handleDrop, true);
      window.removeEventListener("dragend", reset, true);
      window.removeEventListener("paste", handlePaste, true);
    };
  }, [disabled]);

  if (!isDragging || disabled) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-light-50/80 p-6 backdrop-blur-sm dark:bg-dark-50/80">
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-light-700 dark:border-dark-700">
        <HiOutlineCloudArrowUp className="h-12 w-12 text-light-900 dark:text-dark-900" />
        <p className="text-lg font-semibold text-light-1000 dark:text-dark-1000">
          {t`Drop files to attach them to this card`}
        </p>
        <p className="text-sm text-light-900 dark:text-dark-900">
          {t`Images and other files up to 50MB`}
        </p>
      </div>
    </div>
  );
}
