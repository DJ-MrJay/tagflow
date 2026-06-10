import type { TagInput } from "taglib-wasm";
import type { FileMetadata, SuggestedMetadata } from "./types";

function toNumericYear(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildTagPayload(suggestion: SuggestedMetadata): Partial<TagInput> {
  const tags: Partial<TagInput> = {
    title: suggestion.title || undefined,
    artist: suggestion.artist || undefined,
    album: suggestion.album || undefined,
    genre: suggestion.genre || undefined,
    year: toNumericYear(suggestion.year),
    date: suggestion.releaseDate || suggestion.year || undefined,
    track: suggestion.trackNumber ?? undefined,
    discNumber: suggestion.discNumber ?? undefined,
    albumArtist: suggestion.albumArtist || suggestion.artist || undefined,
    composer: suggestion.composer || undefined,
    comment: suggestion.comments || undefined,
    label: suggestion.publisher || undefined,
    isrc: suggestion.isrc || undefined,
  };

  return Object.fromEntries(
    Object.entries(tags).filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }

      if (typeof value === "string") {
        return value.trim().length > 0;
      }

      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return true;
    }),
  ) as Partial<TagInput>;
}

export function mergeAppliedMetadata(
  current: FileMetadata,
  suggestion: SuggestedMetadata,
): FileMetadata {
  return {
    ...current,
    title: suggestion.title,
    artist: suggestion.artist,
    album: suggestion.album,
    genre: suggestion.genre || current.genre,
    year: suggestion.year || current.year,
    duration: suggestion.durationMs ? Math.round(suggestion.durationMs / 1000) : current.duration,
    artworkDataUrl: suggestion.artworkUrl ?? current.artworkDataUrl,
    albumArtist: suggestion.albumArtist || suggestion.artist || current.albumArtist,
    trackNumber: suggestion.trackNumber ?? current.trackNumber,
    discNumber: suggestion.discNumber ?? current.discNumber,
    comments: suggestion.comments ? [suggestion.comments] : current.comments,
    composer: suggestion.composer ? [suggestion.composer] : current.composer,
    publisher: suggestion.publisher || current.publisher,
    lyrics: suggestion.lyrics ? [suggestion.lyrics] : current.lyrics,
    isrc: suggestion.isrc || current.isrc,
    rating: suggestion.rating ?? current.rating,
    performer: suggestion.artist ? [suggestion.artist] : current.performer,
  };
}

export function isBrowserSimulationPath(path: string): boolean {
  return path.startsWith("browser://");
}
