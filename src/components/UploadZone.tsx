import { useRef, useState } from "react";

interface UploadZoneProps {
  disabled?: boolean;
  helperNote: string;
  useDesktopDialog: boolean;
  onPickFiles: () => void;
  onDropPaths: (paths: string[]) => void;
  onImportFiles: (files: File[]) => void;
}

function getDroppedPaths(files: FileList): string[] {
  if (!window.tagFlow) {
    return [];
  }

  return Array.from(files)
    .map((file) => {
      try {
        // Electron 32+ removed File.path; resolve dropped files via preload instead.
        return window.tagFlow.getPathForFile(file);
      } catch {
        return "";
      }
    })
    .filter((value): value is string => Boolean(value));
}

export function UploadZone({
  disabled,
  helperNote,
  useDesktopDialog,
  onPickFiles,
  onDropPaths,
  onImportFiles,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <section
      className={`upload-zone ${isDragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) {
          setIsDragging(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);

        if (disabled) {
          return;
        }

        const droppedFiles = Array.from(event.dataTransfer.files);
        const paths = getDroppedPaths(event.dataTransfer.files);
        if (paths.length > 0) {
          onDropPaths(paths);
          return;
        }

        if (droppedFiles.length > 0) {
          onImportFiles(droppedFiles);
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.m4a,.flac"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) {
            onImportFiles(files);
          }
          event.target.value = "";
        }}
      />
      <span className="eyebrow">Import</span>
      <h2>Drop local tracks into the file list.</h2>
      <p>{helperNote}</p>
      <div className="upload-actions">
        <button
          className="button button-primary"
          onClick={() => {
            if (useDesktopDialog) {
              onPickFiles();
              return;
            }

            inputRef.current?.click();
          }}
          disabled={disabled}
        >
          Choose Files
        </button>
        <span className="upload-note">
          TagFlow reads existing tags, cleans weak filenames, and compares lookup matches before saving.
        </span>
      </div>
    </section>
  );
}
