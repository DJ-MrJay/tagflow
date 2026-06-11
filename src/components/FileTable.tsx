import type { AudioFileRecord } from "../lib/types";

interface FileTableProps {
  files: AudioFileRecord[];
  selectedFileId: string | null;
  onSelect: (fileId: string) => void;
}

const LOOKUP_LABELS: Record<NonNullable<AudioFileRecord["bestSuggestion"]>["lookupSource"], string> = {
  apple: "Apple",
  spotify: "Spotify",
};

function confidenceLabel(file: AudioFileRecord): string {
  if (!file.bestSuggestion) {
    return "Manual";
  }

  return `${Math.round(file.bestSuggestion.confidence.overall * 100)}%`;
}

function statusLabel(file: AudioFileRecord): string {
  switch (file.status) {
    case "matched":
      return "Ready";
    case "manual-review":
      return "Review";
    case "applied":
      return "Saved";
    case "skipped":
      return "Skipped";
    case "unsupported":
      return "Read only";
    case "error":
      return "Error";
    default:
      return "Queued";
  }
}

function statusClass(file: AudioFileRecord): string {
  if (file.status === "applied") {
    return "success";
  }
  if (file.status === "error") {
    return "danger";
  }
  if (file.status === "matched") {
    return "accent";
  }
  return "muted";
}

export function FileTable({ files, selectedFileId, onSelect }: FileTableProps) {
  if (files.length === 0) {
    return (
      <div className="empty-table">
        <p>No files loaded yet.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      <table className="file-table">
        <thead>
          <tr>
            <th>Filename</th>
            <th>Artist</th>
            <th>Title</th>
            <th>Album</th>
            <th>Year</th>
            <th>Lookup</th>
            <th>Confidence</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr
              key={file.id}
              className={file.id === selectedFileId ? "is-selected" : ""}
              onClick={() => onSelect(file.id)}
            >
              <td>
                <strong>{file.filename}</strong>
                <span>{file.extension.toUpperCase()}</span>
              </td>
              <td>
                <strong>{file.bestSuggestion?.artist || file.current.artist || "Unknown artist"}</strong>
                <span>{file.current.artist ? `Current: ${file.current.artist}` : "Current: —"}</span>
              </td>
              <td>
                <strong>{file.bestSuggestion?.title || file.current.title || "Unknown title"}</strong>
                <span>{file.current.title ? `Current: ${file.current.title}` : "Current: —"}</span>
              </td>
              <td>
                <strong>{file.bestSuggestion?.album || file.current.album || "Single"}</strong>
                <span>{file.current.album ? `Current: ${file.current.album}` : "Current: —"}</span>
              </td>
              <td>
                <strong>{file.bestSuggestion?.year || file.current.year || "—"}</strong>
                <span>{file.current.year ? `Current: ${file.current.year}` : "Current: —"}</span>
              </td>
              <td>
                <strong>
                  {file.bestSuggestion
                    ? LOOKUP_LABELS[file.bestSuggestion.lookupSource]
                    : file.resolvedSources[0]
                      ? LOOKUP_LABELS[file.resolvedSources[0]]
                      : "Pending"}
                </strong>
                <span>{file.searchSeed.query || "No query"}</span>
              </td>
              <td>
                <strong>{confidenceLabel(file)}</strong>
                <span>
                  {file.bestSuggestion ? file.bestSuggestion.confidence.level : "manual"}
                </span>
              </td>
              <td>
                <span className={`status-pill ${statusClass(file)}`}>{statusLabel(file)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
