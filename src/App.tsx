import { useEffect, useMemo, useState } from "react";
import { FileTable } from "./components/FileTable";
import { MetadataPreview } from "./components/MetadataPreview";
import { SearchModal } from "./components/SearchModal";
import { UploadZone } from "./components/UploadZone";
import { analyzeBrowserFiles, applyTagsInBrowser } from "./lib/browserFileService";
import { mergeAppliedMetadata } from "./lib/tagging";
import type { AudioFileRecord, SearchResultPayload, SuggestedMetadata } from "./lib/types";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "tagflow-theme";

function mergeFiles(current: AudioFileRecord[], incoming: AudioFileRecord[]): AudioFileRecord[] {
  const next = new Map(current.map((file) => [file.path, file]));
  for (const file of incoming) {
    next.set(file.path, file);
  }
  return Array.from(next.values());
}

function fileError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function updateFile(
  files: AudioFileRecord[],
  fileId: string,
  update: (file: AudioFileRecord) => AudioFileRecord,
): AudioFileRecord[] {
  return files.map((file) => (file.id === fileId ? update(file) : file));
}

function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function App() {
  const hasDesktopBridge = Boolean(window.tagFlow);
  const [files, setFiles] = useState<AudioFileRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [modalFile, setModalFile] = useState<AudioFileRecord | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);
  const [applyingFileId, setApplyingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? files[0] ?? null,
    [files, selectedFileId],
  );

  const highConfidenceFiles = files.filter(
    (file) =>
      file.writeSupported &&
      file.bestSuggestion?.confidence.level === "high" &&
      file.status !== "applied" &&
      file.status !== "skipped",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  async function handleImport(paths: string[]): Promise<void> {
    if (paths.length === 0 || !window.tagFlow) {
      return;
    }

    setError(null);
    setIsImporting(true);

    try {
      const analysed = await window.tagFlow.analyzeFiles(paths);
      setFiles((current) => mergeFiles(current, analysed));
      setSelectedFileId(analysed[0]?.id ?? null);
    } catch (importError) {
      setError(fileError(importError));
    } finally {
      setIsImporting(false);
    }
  }

  async function handleImportBrowserFiles(importFiles: File[]): Promise<void> {
    if (importFiles.length === 0) {
      return;
    }

    setError(null);
    setIsImporting(true);

    try {
      const analysed = await analyzeBrowserFiles(importFiles);
      setFiles((current) => mergeFiles(current, analysed));
      setSelectedFileId(analysed[0]?.id ?? null);
    } catch (importError) {
      setError(fileError(importError));
    } finally {
      setIsImporting(false);
    }
  }

  async function handlePickFiles(): Promise<void> {
    if (!window.tagFlow) {
      return;
    }

    const paths = await window.tagFlow.openFileDialog();
    await handleImport(paths);
  }

  async function handleApply(
    file: AudioFileRecord,
    suggestion: SuggestedMetadata,
  ): Promise<void> {
    setApplyingFileId(file.id);
    setError(null);

    try {
      const result = window.tagFlow
        ? await window.tagFlow.applyTags(file, suggestion)
        : await applyTagsInBrowser(file, suggestion);
      setFiles((current) =>
        updateFile(current, file.id, (entry) => ({
          ...entry,
          current: result.success ? mergeAppliedMetadata(entry.current, suggestion) : entry.current,
          status: result.success ? "applied" : "error",
          error: result.error,
          backupPath: result.backupPath,
        })),
      );
    } catch (applyError) {
      setFiles((current) =>
        updateFile(current, file.id, (entry) => ({
          ...entry,
          status: "error",
          error: fileError(applyError),
        })),
      );
    } finally {
      setApplyingFileId(null);
    }
  }

  function handleSkip(fileId: string): void {
    setFiles((current) =>
      updateFile(current, fileId, (entry) => ({
        ...entry,
        status: "skipped",
      })),
    );
  }

  async function handleApplyAllHighConfidence(): Promise<void> {
    if (highConfidenceFiles.length === 0) {
      return;
    }

    setIsApplyingBatch(true);
    setError(null);

    try {
      for (const file of highConfidenceFiles) {
        if (!file.bestSuggestion) {
          continue;
        }
        await handleApply(file, file.bestSuggestion);
      }
    } finally {
      setIsApplyingBatch(false);
    }
  }

  function handleSelectManualMatch(
    fileId: string,
    payload: SearchResultPayload,
    suggestion: SuggestedMetadata,
  ): void {
    setFiles((current) =>
      updateFile(current, fileId, (file) => ({
        ...file,
        searchSeed: payload.searchSeed,
        suggestions: payload.suggestions,
        bestSuggestion: suggestion,
        status: suggestion.confidence.level === "high" ? "matched" : "manual-review",
        error: null,
      })),
    );
    setModalFile(null);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="eyebrow">TagFlow</span>
          <h1>Local music tagging without blind overwrites.</h1>
        </div>
        <div className="header-actions">
          <div className="theme-switcher" role="group" aria-label="Theme switcher">
            <button
              type="button"
              className={`theme-option ${theme === "light" ? "is-active" : ""}`}
              aria-pressed={theme === "light"}
              onClick={() => setTheme("light")}
            >
              Light
            </button>
            <button
              type="button"
              className={`theme-option ${theme === "dark" ? "is-active" : ""}`}
              aria-pressed={theme === "dark"}
              onClick={() => setTheme("dark")}
            >
              Dark
            </button>
          </div>
          <div className="header-stats">
            <strong>{files.length}</strong>
            <span>files queued</span>
          </div>
          <div className="header-stats">
            <strong>{highConfidenceFiles.length}</strong>
            <span>high confidence</span>
          </div>
          <button
            className="button button-primary"
            disabled={highConfidenceFiles.length === 0 || isApplyingBatch}
            onClick={handleApplyAllHighConfidence}
          >
            {isApplyingBatch ? "Applying..." : "Apply All High Confidence"}
          </button>
        </div>
      </header>

      {error ? <div className="global-alert">{error}</div> : null}

      <main className="app-layout">
        <div className="left-column">
          <UploadZone
            disabled={isImporting || isApplyingBatch}
            helperNote={
              hasDesktopBridge
                ? "Desktop write support: MP3, M4A, and FLAC. The browser preview can also export tagged copies by download."
                : "Browser preview: metadata, search, and tag export work here. Applying tags downloads a tagged copy instead of overwriting the original file."
            }
            useDesktopDialog={hasDesktopBridge}
            onPickFiles={handlePickFiles}
            onDropPaths={handleImport}
            onImportFiles={handleImportBrowserFiles}
          />
          <section className="table-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Queue</span>
                <h2>Imported files</h2>
              </div>
              <span className="table-note">
                {isImporting ? "Scanning metadata and searching iTunes..." : "Click a row to inspect it."}
              </span>
            </div>
            <FileTable
              files={files}
              selectedFileId={selectedFile?.id ?? null}
              onSelect={setSelectedFileId}
            />
          </section>
        </div>

        <div className="right-column">
          <MetadataPreview
            file={selectedFile}
            isApplying={applyingFileId === selectedFile?.id || isApplyingBatch}
            onApply={handleApply}
            onSkip={handleSkip}
            onManualSearch={setModalFile}
          />
        </div>
      </main>

      <SearchModal
        file={modalFile}
        onClose={() => setModalFile(null)}
        onSelectMatch={handleSelectManualMatch}
      />
    </div>
  );
}
