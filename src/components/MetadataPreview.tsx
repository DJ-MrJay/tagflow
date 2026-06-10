import { isBrowserSimulationPath } from "../lib/tagging";
import type { AudioFileRecord, SuggestedMetadata } from "../lib/types";

interface MetadataPreviewProps {
  file: AudioFileRecord | null;
  isApplying: boolean;
  onApply: (file: AudioFileRecord, suggestion: SuggestedMetadata) => void;
  onSkip: (fileId: string) => void;
  onManualSearch: (file: AudioFileRecord) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) {
    return "Unknown";
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="preview-field">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function Artwork({ src, title }: { src: string | null; title: string }) {
  return src ? (
    <img className="artwork" src={src} alt={title} />
  ) : (
    <div className="artwork artwork-placeholder">{title.slice(0, 1).toUpperCase()}</div>
  );
}

function formatWriteStatus(file: AudioFileRecord): string {
  if (!file.writeSupported) {
    return "Read-only format";
  }

  if (isBrowserSimulationPath(file.path)) {
    return `${file.extension.toUpperCase()} tagging via download`;
  }

  return `${file.extension.toUpperCase()} tagging enabled`;
}

export function MetadataPreview({
  file,
  isApplying,
  onApply,
  onSkip,
  onManualSearch,
}: MetadataPreviewProps) {
  if (!file) {
    return (
      <section className="preview-card empty-preview">
        <span className="eyebrow">Preview</span>
        <h2>Select a file to inspect the current tags and top iTunes match.</h2>
      </section>
    );
  }

  const suggestion = file.bestSuggestion;
  const canApply = Boolean(suggestion && file.writeSupported && !isApplying);

  return (
    <section className="preview-card">
      <div className="preview-header">
        <div>
          <span className="eyebrow">Preview</span>
          <h2>{file.filename}</h2>
        </div>
        <div className="preview-header-meta">
          <span className={`status-pill ${file.writeSupported ? "accent" : "muted"}`}>
            {formatWriteStatus(file)}
          </span>
        </div>
      </div>

      {file.error ? <div className="inline-alert">{file.error}</div> : null}

      <div className="preview-columns">
        <div className="metadata-panel">
          <div className="panel-title">Current metadata</div>
          <Artwork src={file.current.artworkDataUrl} title={file.filename} />
          <div className="field-grid">
            <PreviewField label="Title" value={file.current.title} />
            <PreviewField label="Artist" value={file.current.artist} />
            <PreviewField label="Album" value={file.current.album} />
            <PreviewField label="Genre" value={file.current.genre} />
            <PreviewField label="Year" value={file.current.year} />
            <PreviewField label="Duration" value={formatDuration(file.current.duration)} />
            <PreviewField label="Filename" value={file.current.filename} />
          </div>
        </div>

        <div className="metadata-panel">
          <div className="panel-title">Suggested metadata</div>
          <Artwork src={suggestion?.artworkUrl ?? null} title={suggestion?.title || file.filename} />

          {suggestion ? (
            <>
              <div className="field-grid">
                <PreviewField label="Title" value={suggestion.title} />
                <PreviewField label="Artist" value={suggestion.artist} />
                <PreviewField label="Album" value={suggestion.album} />
                <PreviewField label="Genre" value={suggestion.genre} />
                <PreviewField label="Release Year" value={suggestion.year} />
                <PreviewField
                  label="Confidence"
                  value={`${suggestion.confidence.level} ${Math.round(
                    suggestion.confidence.overall * 100,
                  )}%`}
                />
              </div>
              <div className="confidence-notes">
                {suggestion.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-suggestion">
              No iTunes match is selected yet. Use manual search to review alternatives.
            </div>
          )}
        </div>
      </div>

      <div className="preview-footer">
        <div className="preview-footer-copy">
          <strong>Search query:</strong> {file.searchSeed.query || "No query"}
          {file.backupPath ? (
            <span className="backup-note">
              {isBrowserSimulationPath(file.path)
                ? `Downloaded tagged copy as ${file.backupPath}`
                : `Backup created at ${file.backupPath}`}
            </span>
          ) : null}
        </div>
        <div className="preview-actions">
          <button
            className="button button-primary"
            disabled={!canApply}
            onClick={() => suggestion && onApply(file, suggestion)}
          >
            {isApplying ? "Applying..." : "Apply Tags"}
          </button>
          <button className="button button-secondary" onClick={() => onSkip(file.id)}>
            Skip
          </button>
          <button className="button button-secondary" onClick={() => onManualSearch(file)}>
            Search Manually
          </button>
        </div>
      </div>
    </section>
  );
}
