import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";
import { FileTable } from "./components/FileTable";
import { MetadataPreview } from "./components/MetadataPreview";
import { SearchModal } from "./components/SearchModal";
import { UploadZone } from "./components/UploadZone";
import { analyzeBrowserFiles, applyTagsInBrowser, runBrowserManualSearch } from "./lib/browserFileService";
import { isBrowserSimulationPath, mergeAppliedMetadata } from "./lib/tagging";
import type {
  AudioFileRecord,
  LookupPreference,
  ManualSearchInput,
  SearchResultPayload,
  SuggestedMetadata,
  TagFlowCapabilities,
  TagFlowMenuAction,
} from "./lib/types";

type Theme = "light" | "dark";

interface MenuItemConfig {
  label: string;
  action?: TagFlowMenuAction;
  disabled?: boolean;
  shortcut?: string;
  separator?: boolean;
}

interface MenuGroupConfig {
  label: string;
  items: MenuItemConfig[];
}

const THEME_STORAGE_KEY = "tagflow-theme";
const DEFAULT_CAPABILITIES: TagFlowCapabilities = {
  desktop: false,
  spotifyLookup: false,
  nativeMenu: false,
};

const LOOKUP_LABELS = {
  auto: "Auto",
  apple: "Apple Music",
  spotify: "Spotify",
} as const;

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

  return "light";
}

function lookupLabel(source: LookupPreference): string {
  return LOOKUP_LABELS[source];
}

function buildManualSearchInput(
  file: AudioFileRecord,
  source: LookupPreference,
): ManualSearchInput {
  return {
    artist:
      file.current.artist ||
      file.searchSeed.artist ||
      file.searchSeed.filenameGuess?.artistGuess ||
      "",
    title:
      file.current.title ||
      file.searchSeed.title ||
      file.searchSeed.filenameGuess?.titleGuess ||
      file.searchSeed.filenameGuess?.cleaned ||
      "",
    album: file.current.album || file.searchSeed.album || "",
    source,
  };
}

function resolveMatchStatus(suggestion: SuggestedMetadata | null): AudioFileRecord["status"] {
  if (!suggestion) {
    return "manual-review";
  }

  return suggestion.confidence.level === "high" ? "matched" : "manual-review";
}

function filterMatches(file: AudioFileRecord, filterQuery: string): boolean {
  const query = filterQuery.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    file.filename,
    file.current.artist,
    file.current.title,
    file.current.album,
    file.current.genre,
    file.current.year,
    file.bestSuggestion?.artist ?? "",
    file.bestSuggestion?.title ?? "",
    file.bestSuggestion?.album ?? "",
    file.bestSuggestion?.genre ?? "",
    file.bestSuggestion?.year ?? "",
    file.bestSuggestion?.lookupSource ?? "",
    file.lookupWarning ?? "",
    file.error ?? "",
  ]
    .join("\n")
    .toLowerCase();

  return haystack.includes(query);
}

function directoryLabel(file: AudioFileRecord | null, hasDesktopBridge: boolean): string {
  if (!file) {
    return hasDesktopBridge ? "No folder loaded" : "Browser import";
  }

  if (isBrowserSimulationPath(file.path)) {
    return "Browser import";
  }

  const normalized = file.path.replace(/\\/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  if (lastSlashIndex <= 0) {
    return normalized;
  }

  return normalized.slice(0, lastSlashIndex);
}

function menuGroups(
  selectedFile: AudioFileRecord | null,
  highConfidenceCount: number,
  spotifyLookupEnabled: boolean,
): MenuGroupConfig[] {
  return [
    {
      label: "File",
      items: [
        { label: "Open Files...", action: "file:open", shortcut: "Ctrl+O" },
        {
          label: "Save Tag",
          action: "file:apply-selected",
          shortcut: "Ctrl+S",
          disabled: !selectedFile?.bestSuggestion,
        },
        {
          label: "Save All High Confidence",
          action: "file:apply-high-confidence",
          shortcut: "Ctrl+Shift+S",
          disabled: highConfidenceCount === 0,
        },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", disabled: true },
        { label: "Redo", disabled: true },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Filter", action: "view:toggle-filter", shortcut: "F3" },
        { label: "Tag Panel", action: "view:toggle-tag-panel" },
        { label: "Toggle Theme", action: "view:toggle-theme" },
      ],
    },
    {
      label: "Convert",
      items: [
        { label: "Tag - Filename", disabled: true },
        { label: "Filename - Tag", disabled: true },
        { label: "Filename - Filename", disabled: true },
      ],
    },
    {
      label: "Actions",
      items: [
        { label: "Search Manually...", action: "actions:manual-search", shortcut: "Ctrl+M" },
        { label: "Skip Selected", action: "actions:skip-selected", shortcut: "Delete" },
      ],
    },
    {
      label: "Tag Sources",
      items: [
        { label: "Auto Lookup", action: "tags:auto", shortcut: "Ctrl+I" },
        { label: "Apple Music / iTunes", action: "tags:apple" },
        { label: "Spotify", action: "tags:spotify", disabled: !spotifyLookupEnabled },
      ],
    },
    {
      label: "Tools",
      items: [
        {
          label: spotifyLookupEnabled ? "Spotify Lookup Ready" : "Apple Lookup Only",
          disabled: true,
        },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "Project README", action: "help:readme" },
      ],
    },
  ];
}

export default function App() {
  const hasDesktopBridge = Boolean(window.tagFlow);
  const [files, setFiles] = useState<AudioFileRecord[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [modalFile, setModalFile] = useState<AudioFileRecord | null>(null);
  const [modalSource, setModalSource] = useState<LookupPreference>("auto");
  const [isImporting, setIsImporting] = useState(false);
  const [isApplyingBatch, setIsApplyingBatch] = useState(false);
  const [applyingFileId, setApplyingFileId] = useState<string | null>(null);
  const [searchingFileId, setSearchingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(resolveInitialTheme);
  const [filterQuery, setFilterQuery] = useState("");
  const [showFilterBar, setShowFilterBar] = useState(true);
  const [showTagPanel, setShowTagPanel] = useState(true);
  const [openMenuLabel, setOpenMenuLabel] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<TagFlowCapabilities>({
    ...DEFAULT_CAPABILITIES,
    desktop: hasDesktopBridge,
  });

  const filteredFiles = useMemo(
    () => files.filter((file) => filterMatches(file, filterQuery)),
    [files, filterQuery],
  );

  const selectedFile = useMemo(
    () =>
      filteredFiles.find((file) => file.id === selectedFileId) ??
      files.find((file) => file.id === selectedFileId) ??
      filteredFiles[0] ??
      files[0] ??
      null,
    [files, filteredFiles, selectedFileId],
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

  useEffect(() => {
    if (!window.tagFlow) {
      return;
    }

    void window.tagFlow
      .getCapabilities()
      .then(setCapabilities)
      .catch(() => {
        setCapabilities({
          ...DEFAULT_CAPABILITIES,
          desktop: true,
        });
      });
  }, []);

  useEffect(() => {
    if (filteredFiles.length === 0) {
      return;
    }

    if (!selectedFileId || !filteredFiles.some((file) => file.id === selectedFileId)) {
      setSelectedFileId(filteredFiles[0].id);
    }
  }, [filteredFiles, selectedFileId]);

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
      const result = window.tagFlow && !isBrowserSimulationPath(file.path)
        ? await window.tagFlow.applyTags(file, suggestion)
        : await applyTagsInBrowser(file, suggestion);
      setFiles((current) =>
        updateFile(current, file.id, (entry) => ({
          ...entry,
          current: result.success
            ? mergeAppliedMetadata(entry.current, result.appliedSuggestion ?? suggestion)
            : entry.current,
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

  async function handleLookup(
    file: AudioFileRecord,
    source: LookupPreference,
  ): Promise<void> {
    setSearchingFileId(file.id);
    setSelectedFileId(file.id);
    setError(null);

    try {
      const input = buildManualSearchInput(file, source);
      const payload = window.tagFlow
        ? await window.tagFlow.manualSearch(file, input)
        : await runBrowserManualSearch(file, input);
      const suggestion = payload.suggestions[0] ?? null;

      setFiles((current) =>
        updateFile(current, file.id, (entry) => ({
          ...entry,
          searchSeed: payload.searchSeed,
          suggestions: payload.suggestions,
          bestSuggestion: suggestion,
          status: resolveMatchStatus(suggestion),
          error:
            payload.suggestions.length === 0
              ? `No ${lookupLabel(source)} matches found for that query.`
              : null,
          lookupWarning: payload.warning,
          resolvedSources: payload.resolvedSources,
        })),
      );
    } catch (lookupError) {
      setFiles((current) =>
        updateFile(current, file.id, (entry) => ({
          ...entry,
          status: "manual-review",
          error: fileError(lookupError),
          lookupWarning: null,
          resolvedSources: [],
        })),
      );
    } finally {
      setSearchingFileId(null);
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
        lookupWarning: payload.warning,
        resolvedSources: payload.resolvedSources,
      })),
    );
    setModalFile(null);
  }

  const handleMenuAction = useEffectEvent(async (action: TagFlowMenuAction) => {
    switch (action) {
      case "file:open":
        if (window.tagFlow) {
          await handlePickFiles();
        }
        break;
      case "file:apply-selected":
        if (selectedFile?.bestSuggestion) {
          await handleApply(selectedFile, selectedFile.bestSuggestion);
        }
        break;
      case "file:apply-high-confidence":
        await handleApplyAllHighConfidence();
        break;
      case "actions:manual-search":
        if (selectedFile) {
          setModalSource("auto");
          setModalFile(selectedFile);
        }
        break;
      case "actions:skip-selected":
        if (selectedFile) {
          handleSkip(selectedFile.id);
        }
        break;
      case "view:toggle-filter":
        setShowFilterBar((current) => {
          const next = !current;
          if (!next) {
            setFilterQuery("");
          }
          return next;
        });
        break;
      case "view:toggle-tag-panel":
        setShowTagPanel((current) => !current);
        break;
      case "view:toggle-theme":
        setTheme((current) => (current === "light" ? "dark" : "light"));
        break;
      case "tags:auto":
        if (selectedFile) {
          await handleLookup(selectedFile, "auto");
        }
        break;
      case "tags:apple":
        if (selectedFile) {
          await handleLookup(selectedFile, "apple");
        }
        break;
      case "tags:spotify":
        if (selectedFile) {
          await handleLookup(selectedFile, "spotify");
        }
        break;
      case "help:readme":
        if (window.tagFlow) {
          await window.tagFlow.openReadme();
        }
        break;
    }
  });

  useEffect(() => {
    if (!window.tagFlow) {
      return;
    }

    return window.tagFlow.onMenuAction((action) => {
      void handleMenuAction(action);
    });
  }, [handleMenuAction]);

  const chromeMenus = menuGroups(
    selectedFile,
    highConfidenceFiles.length,
    capabilities.spotifyLookup,
  );

  return (
    <div className="app-shell">
      <div className="window-chrome">
        <nav className="menu-strip" onMouseLeave={() => setOpenMenuLabel(null)}>
          {chromeMenus.map((group) => (
            <div className="menu-group" key={group.label}>
              <button
                type="button"
                className={`menu-button ${openMenuLabel === group.label ? "is-open" : ""}`}
                onClick={() =>
                  setOpenMenuLabel((current) => (current === group.label ? null : group.label))
                }
              >
                {group.label}
              </button>
              {openMenuLabel === group.label ? (
                <div className="menu-popup">
                  {group.items.map((item, index) =>
                    item.separator ? (
                      <div key={`${group.label}-${index}`} className="menu-separator" />
                    ) : (
                      <button
                        key={`${group.label}-${item.label}`}
                        type="button"
                        className="menu-item"
                        disabled={item.disabled}
                        onClick={() => {
                          setOpenMenuLabel(null);
                          if (item.action) {
                            void handleMenuAction(item.action);
                          }
                        }}
                      >
                        <span>{item.label}</span>
                        <span>{item.shortcut ?? ""}</span>
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          ))}
          <div className="menu-caption">
            {capabilities.nativeMenu ? "Native menu mirrors this layout." : "Preview menu"}
          </div>
        </nav>

        <div className="toolbar-strip">
          <button
            type="button"
            className="toolbar-button toolbar-button-primary"
            onClick={() => {
              if (window.tagFlow) {
                void handlePickFiles();
              }
            }}
            disabled={!window.tagFlow || isImporting}
          >
            Open Files
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              if (selectedFile?.bestSuggestion) {
                void handleApply(selectedFile, selectedFile.bestSuggestion);
              }
            }}
            disabled={!selectedFile?.bestSuggestion || applyingFileId === selectedFile?.id}
          >
            Save Tag
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => void handleApplyAllHighConfidence()}
            disabled={highConfidenceFiles.length === 0 || isApplyingBatch}
          >
            Save All
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              if (selectedFile) {
                void handleLookup(selectedFile, "auto");
              }
            }}
            disabled={!selectedFile || searchingFileId === selectedFile?.id}
          >
            Auto Lookup
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              if (selectedFile) {
                void handleLookup(selectedFile, "spotify");
              }
            }}
            disabled={!selectedFile || !capabilities.spotifyLookup || searchingFileId === selectedFile?.id}
          >
            Spotify
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              if (selectedFile) {
                setModalSource("auto");
                setModalFile(selectedFile);
              }
            }}
            disabled={!selectedFile}
          >
            Manual Search
          </button>
          <div className="toolbar-spacer" />
          <span className="source-indicator">
            {capabilities.spotifyLookup ? "Spotify lookup ready" : "Apple lookup only"}
          </span>
          <button
            type="button"
            className="toolbar-button toolbar-button-quiet"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Dark Theme" : "Light Theme"}
          </button>
        </div>

        <div className="location-strip">
          <div className="location-field">
            <span>Directory</span>
            <strong>{directoryLabel(selectedFile, hasDesktopBridge)}</strong>
          </div>
          {showFilterBar ? (
            <label className="filter-field">
              <span>Filter</span>
              <input
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
                placeholder="Filter by file, artist, title, album, or source"
              />
            </label>
          ) : (
            <button
              type="button"
              className="inline-toggle"
              onClick={() => setShowFilterBar(true)}
            >
              Show Filter
            </button>
          )}
          <div className="queue-pill">
            <strong>{filteredFiles.length}</strong>
            <span>visible / {files.length} loaded</span>
          </div>
        </div>
      </div>

      {error ? <div className="global-alert">{error}</div> : null}

      <main className={`workspace ${showTagPanel ? "" : "workspace-wide"}`}>
        {showTagPanel ? (
          <MetadataPreview
            file={selectedFile}
            isApplying={applyingFileId === selectedFile?.id || isApplyingBatch}
            isSearching={searchingFileId === selectedFile?.id}
            spotifyLookupEnabled={capabilities.spotifyLookup}
            onApply={handleApply}
            onSkip={handleSkip}
            onLookup={handleLookup}
            onManualSearch={(file, source) => {
              setModalSource(source);
              setModalFile(file);
            }}
          />
        ) : null}

        <section className="list-pane">
          <UploadZone
            disabled={isImporting || isApplyingBatch}
            helperNote={
              hasDesktopBridge
                ? "Drop audio files into the list or use Open Files. Desktop tagging now writes in place."
                : "Drop audio files into the list or use Open Files. Browser preview downloads a tagged copy instead of overwriting the original."
            }
            useDesktopDialog={hasDesktopBridge}
            onPickFiles={handlePickFiles}
            onDropPaths={handleImport}
            onImportFiles={handleImportBrowserFiles}
          />

          <section className="table-card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">File List</span>
                <h1>Imported files</h1>
              </div>
              <span className="table-note">
                {isImporting
                  ? "Reading tags and querying sources..."
                  : "Select a row to review the tags before saving."}
              </span>
            </div>
            <FileTable
              files={filteredFiles}
              selectedFileId={selectedFile?.id ?? null}
              onSelect={setSelectedFileId}
            />
          </section>
        </section>
      </main>

      <footer className="status-strip">
        <span>{files.length} file(s)</span>
        <span>{filteredFiles.length} visible</span>
        <span>{highConfidenceFiles.length} ready to save</span>
        <span>
          {selectedFile
            ? `${selectedFile.filename} · ${
                selectedFile.bestSuggestion
                  ? lookupLabel(selectedFile.bestSuggestion.lookupSource)
                  : "No lookup match"
              }`
            : "No file selected"}
        </span>
      </footer>

      <SearchModal
        file={modalFile}
        defaultSource={modalSource}
        spotifyLookupEnabled={capabilities.spotifyLookup}
        onClose={() => setModalFile(null)}
        onSelectMatch={handleSelectManualMatch}
      />
    </div>
  );
}
