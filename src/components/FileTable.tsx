import type { AudioFileRecord } from "../lib/types";

interface FileTableProps {
  files: AudioFileRecord[];
  selectedFileId: string | null;
  onSelect: (fileId: string) => void;
}

function confidenceLabel(file: AudioFileRecord): string {
  if (!file.bestSuggestion) {
    return "No match";
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
      return "Applied";
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
            <th>File</th>
            <th>Current</th>
            <th>Search Source</th>
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
                <strong>{file.current.artist || "Unknown artist"}</strong>
                <span>{file.current.title || "Unknown title"}</span>
              </td>
              <td>
                <strong>{file.searchSeed.source}</strong>
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
