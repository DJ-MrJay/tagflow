import { useEffect, useState } from "react";
import { runBrowserManualSearch } from "../lib/browserFileService";
import type {
  AudioFileRecord,
  ManualSearchInput,
  SearchResultPayload,
  SuggestedMetadata,
} from "../lib/types";

interface SearchModalProps {
  file: AudioFileRecord | null;
  onClose: () => void;
  onSelectMatch: (
    fileId: string,
    payload: SearchResultPayload,
    suggestion: SuggestedMetadata,
  ) => void;
}

function initialSearchInput(file: AudioFileRecord | null): ManualSearchInput {
  if (!file) {
    return { artist: "", title: "", album: "" };
  }

  return {
    artist: file.current.artist || file.searchSeed.artist || file.searchSeed.filenameGuess?.artistGuess || "",
    title:
      file.current.title ||
      file.searchSeed.title ||
      file.searchSeed.filenameGuess?.titleGuess ||
      file.searchSeed.filenameGuess?.cleaned ||
      "",
    album: file.current.album || file.searchSeed.album || "",
  };
}

export function SearchModal({ file, onClose, onSelectMatch }: SearchModalProps) {
  const [form, setForm] = useState<ManualSearchInput>(initialSearchInput(file));
  const [results, setResults] = useState<SuggestedMetadata[]>(file?.suggestions ?? []);
  const [searchPayload, setSearchPayload] = useState<SearchResultPayload | null>(
    file ? { searchSeed: file.searchSeed, suggestions: file.suggestions } : null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialSearchInput(file));
    setResults(file?.suggestions ?? []);
    setSearchPayload(file ? { searchSeed: file.searchSeed, suggestions: file.suggestions } : null);
    setError(null);
  }, [file]);

  if (!file) {
    return null;
  }

  async function handleSearch(): Promise<void> {
    if (!file) {
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const payload = window.tagFlow
        ? await window.tagFlow.manualSearch(file, form)
        : await runBrowserManualSearch(file, form);
      setSearchPayload(payload);
      setResults(payload.suggestions);

      if (payload.suggestions.length === 0) {
        setError("No iTunes matches found for that query.");
      }
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Manual search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Manual Search</span>
            <h2>{file.filename}</h2>
          </div>
          <button className="button button-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="search-grid">
          <label>
            Artist
            <input
              value={form.artist}
              onChange={(event) =>
                setForm((current) => ({ ...current, artist: event.target.value }))
              }
              placeholder="Artist"
            />
          </label>
          <label>
            Title
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Title"
            />
          </label>
          <label>
            Album
            <input
              value={form.album}
              onChange={(event) =>
                setForm((current) => ({ ...current, album: event.target.value }))
              }
              placeholder="Album (optional)"
            />
          </label>
        </div>

        <div className="modal-actions">
          <button className="button button-primary" onClick={handleSearch} disabled={isSearching}>
            {isSearching ? "Searching..." : "Search iTunes"}
          </button>
          <span className="search-query-label">
            Query: {searchPayload?.searchSeed.query || [form.artist, form.title, form.album].filter(Boolean).join(" ")}
          </span>
        </div>

        {error ? <div className="inline-alert">{error}</div> : null}

        <div className="search-results">
          {results.map((result) => (
            <article key={result.trackId} className="search-result-card">
              {result.artworkUrl ? (
                <img
                  className="search-result-artwork"
                  src={result.artworkUrl}
                  alt={result.title}
                />
              ) : (
                <div className="search-result-artwork search-result-artwork-placeholder">
                  {result.title.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="search-result-copy">
                <strong>{result.title}</strong>
                <span>
                  {result.artist} · {result.album || "Single"}
                </span>
                <span>
                  {result.genre || "Unknown genre"} · {result.year || "Unknown year"}
                </span>
                <span>
                  Confidence {Math.round(result.confidence.overall * 100)}% · {result.confidence.level}
                </span>
              </div>
              <button
                className="button button-secondary"
                onClick={() =>
                  onSelectMatch(
                    file.id,
                    searchPayload ?? {
                      searchSeed: file.searchSeed,
                      suggestions: results,
                    },
                    result,
                  )
                }
              >
                Use Match
              </button>
            </article>
          ))}
          {results.length === 0 ? <p className="empty-result-copy">Search results will appear here.</p> : null}
        </div>
      </div>
    </div>
  );
}
