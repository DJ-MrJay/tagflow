import { isBrowserSimulationPath } from "../lib/tagging";
import type {
  AudioFileRecord,
  LookupPreference,
  SuggestedMetadata,
} from "../lib/types";

interface MetadataPreviewProps {
  file: AudioFileRecord | null;
  isApplying: boolean;
  isSearching: boolean;
  spotifyLookupEnabled: boolean;
  onApply: (file: AudioFileRecord, suggestion: SuggestedMetadata) => void;
  onSkip: (fileId: string) => void;
  onLookup: (file: AudioFileRecord, source: LookupPreference) => void;
  onManualSearch: (file: AudioFileRecord, source: LookupPreference) => void;
}

const LOOKUP_LABELS = {
  apple: "Apple Music",
  spotify: "Spotify",
} as const;

function formatDuration(seconds: number | null): string {
  if (!seconds) {
    return "Unknown";
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function Artwork({ src, title }: { src: string | null; title: string }) {
  return src ? (
    <img className="tag-panel-artwork" src={src} alt={title} />
  ) : (
    <div className="tag-panel-artwork tag-panel-artwork-placeholder">
      {title.slice(0, 1).toUpperCase()}
    </div>
  );
}

function TagField({
  label,
  nextValue,
  currentValue,
}: {
  label: string;
  nextValue: string;
  currentValue: string;
}) {
  return (
    <div className="tag-row">
      <span>{label}</span>
      <strong>{nextValue || "—"}</strong>
      <em>{currentValue ? `Current: ${currentValue}` : "Current: —"}</em>
    </div>
  );
}

function formatWriteStatus(file: AudioFileRecord): string {
  if (!file.writeSupported) {
    return "Read-only format";
  }

  if (isBrowserSimulationPath(file.path)) {
    return `${file.extension.toUpperCase()} download export`;
  }

  return `${file.extension.toUpperCase()} in-place save`;
}

export function MetadataPreview({
  file,
  isApplying,
  isSearching,
  spotifyLookupEnabled,
  onApply,
  onSkip,
  onLookup,
  onManualSearch,
}: MetadataPreviewProps) {
  if (!file) {
    return (
      <aside className="preview-card empty-preview">
        <span className="eyebrow">Tag Panel</span>
        <h2>Select a file to inspect the current tags and the best lookup result.</h2>
      </aside>
    );
  }

  const suggestion = file.bestSuggestion;
  const canApply = Boolean(suggestion && file.writeSupported && !isApplying);

  return (
    <aside className="preview-card tag-panel">
      <div className="tag-panel-header">
        <div>
          <span className="eyebrow">Tag Panel</span>
          <h2>{file.filename}</h2>
        </div>
        <div className="tag-panel-header-meta">
          <span className={`status-pill ${file.writeSupported ? "accent" : "muted"}`}>
            {formatWriteStatus(file)}
          </span>
          {suggestion ? (
            <span className={`status-pill ${suggestion.lookupSource === "spotify" ? "success" : "muted"}`}>
              {LOOKUP_LABELS[suggestion.lookupSource]}
            </span>
          ) : null}
        </div>
      </div>

      {file.error ? <div className="inline-alert">{file.error}</div> : null}
      {file.lookupWarning ? <div className="inline-alert inline-alert-warning">{file.lookupWarning}</div> : null}

      <div className="tag-panel-body">
        <Artwork
          src={suggestion?.artworkUrl ?? file.current.artworkDataUrl}
          title={suggestion?.title || file.filename}
        />

        <div className="tag-panel-fields">
          <TagField label="Title" nextValue={suggestion?.title || file.current.title} currentValue={file.current.title} />
          <TagField label="Artist" nextValue={suggestion?.artist || file.current.artist} currentValue={file.current.artist} />
          <TagField label="Album" nextValue={suggestion?.album || file.current.album} currentValue={file.current.album} />
          <TagField label="Album Artist" nextValue={suggestion?.albumArtist || file.current.albumArtist} currentValue={file.current.albumArtist} />
          <TagField label="Year" nextValue={suggestion?.year || file.current.year} currentValue={file.current.year} />
          <TagField label="Genre" nextValue={suggestion?.genre || file.current.genre} currentValue={file.current.genre} />
          <TagField
            label="Track"
            nextValue={suggestion?.trackNumber ? String(suggestion.trackNumber) : ""}
            currentValue={file.current.trackNumber ? String(file.current.trackNumber) : ""}
          />
          <TagField
            label="Disc"
            nextValue={suggestion?.discNumber ? String(suggestion.discNumber) : ""}
            currentValue={file.current.discNumber ? String(file.current.discNumber) : ""}
          />
          <TagField
            label="Duration"
            nextValue={suggestion?.durationMs ? formatDuration(Math.round(suggestion.durationMs / 1000)) : formatDuration(file.current.duration)}
            currentValue={formatDuration(file.current.duration)}
          />
          <TagField label="Source Query" nextValue={file.searchSeed.query} currentValue={file.searchSeed.source} />
        </div>
      </div>

      {suggestion ? (
        <div className="confidence-notes">
          {suggestion.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}

      {file.backupPath && isBrowserSimulationPath(file.path) ? (
        <div className="download-note">Downloaded tagged copy as {file.backupPath}</div>
      ) : null}

      <div className="tag-panel-actions">
        <button
          type="button"
          className="button button-primary"
          disabled={!canApply}
          onClick={() => suggestion && onApply(file, suggestion)}
        >
          {isApplying ? "Saving..." : "Save Tag"}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={isSearching}
          onClick={() => void onLookup(file, "auto")}
        >
          {isSearching ? "Searching..." : "Auto Lookup"}
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={isSearching}
          onClick={() => void onLookup(file, "apple")}
        >
          Apple Music
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={isSearching || !spotifyLookupEnabled}
          onClick={() => void onLookup(file, "spotify")}
        >
          Spotify
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onManualSearch(file, "auto")}
        >
          Manual Search
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={() => onSkip(file.id)}
        >
          Skip
        </button>
      </div>
    </aside>
  );
}
