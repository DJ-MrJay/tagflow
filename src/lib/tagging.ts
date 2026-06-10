import type { PropertyMap, TagInput } from "taglib-wasm";
import type { FileMetadata, SuggestedMetadata } from "./types";

function toNumericYear(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toTrimmedString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function toPropertyArray(value: string | null | undefined): string[] | undefined {
  const trimmed = toTrimmedString(value);
  return trimmed ? [trimmed] : undefined;
}

function toFraction(
  current: number | null,
  total: number | null,
): string[] | undefined {
  if (!current) {
    return undefined;
  }

  if (total && total > 0) {
    return [`${current}/${total}`];
  }

  return [String(current)];
}

function withDefinedEntries<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null) {
        return false;
      }

      if (typeof entry === "string") {
        return entry.trim().length > 0;
      }

      if (Array.isArray(entry)) {
        return entry.length > 0;
      }

      return true;
    }),
  ) as T;
}

export function buildTagPayload(suggestion: SuggestedMetadata): Partial<TagInput> {
  return withDefinedEntries({
    title: toTrimmedString(suggestion.title),
    artist: toTrimmedString(suggestion.artist),
    album: toTrimmedString(suggestion.album),
    genre: toTrimmedString(suggestion.genre),
    year: toNumericYear(suggestion.year),
    date: toTrimmedString(suggestion.releaseDate || suggestion.year),
    track: suggestion.trackNumber ?? undefined,
    discNumber: suggestion.discNumber ?? undefined,
    totalTracks: suggestion.trackCount ?? undefined,
    totalDiscs: suggestion.discCount ?? undefined,
    albumArtist: toTrimmedString(suggestion.albumArtist || suggestion.artist),
    composer: toTrimmedString(suggestion.composer),
    comment: toTrimmedString(suggestion.comments),
    label: toTrimmedString(suggestion.publisher),
    isrc: toTrimmedString(suggestion.isrc),
    copyright: toTrimmedString(suggestion.copyright),
    titleSort: toTrimmedString(suggestion.titleSort),
    artistSort: toTrimmedString(suggestion.artistSort),
    albumSort: toTrimmedString(suggestion.albumSort),
    albumArtistSort: toTrimmedString(suggestion.albumArtistSort),
    composerSort: toTrimmedString(suggestion.composerSort),
  }) as Partial<TagInput>;
}

export function buildPropertyMap(suggestion: SuggestedMetadata): PropertyMap {
  return withDefinedEntries({
    title: toPropertyArray(suggestion.title),
    artist: toPropertyArray(suggestion.artist),
    album: toPropertyArray(suggestion.album),
    genre: toPropertyArray(suggestion.genre),
    date: toPropertyArray(suggestion.releaseDate || suggestion.year),
    albumArtist: toPropertyArray(suggestion.albumArtist || suggestion.artist),
    composer: toPropertyArray(suggestion.composer),
    copyright: toPropertyArray(suggestion.copyright),
    label: toPropertyArray(suggestion.publisher),
    isrc: toPropertyArray(suggestion.isrc),
    titleSort: toPropertyArray(suggestion.titleSort),
    artistSort: toPropertyArray(suggestion.artistSort),
    albumSort: toPropertyArray(suggestion.albumSort),
    albumArtistSort: toPropertyArray(suggestion.albumArtistSort),
    composerSort: toPropertyArray(suggestion.composerSort),
    lyrics: toPropertyArray(suggestion.lyrics),
    PERFORMER: toPropertyArray(suggestion.performer || suggestion.artist),
    trackNumber: toFraction(suggestion.trackNumber, suggestion.trackCount),
    discNumber: toFraction(suggestion.discNumber, suggestion.discCount),
    UPC: toPropertyArray(suggestion.upc),
    comment: toPropertyArray(suggestion.comments),
  });
}

export function buildMp4ItemMap(
  suggestion: SuggestedMetadata,
): Record<string, string> {
  return withDefinedEntries({
    stik: suggestion.contentType === "Music" || !suggestion.contentType ? "1" : undefined,
    rtng: suggestion.rating === null ? undefined : String(suggestion.rating),
    sonm: toTrimmedString(suggestion.titleSort),
    soar: toTrimmedString(suggestion.artistSort),
    soal: toTrimmedString(suggestion.albumSort),
    soaa: toTrimmedString(suggestion.albumArtistSort),
    soco: toTrimmedString(suggestion.composerSort),
    "©pub": toTrimmedString(suggestion.publisher),
    aART: toTrimmedString(suggestion.albumArtist || suggestion.artist),
    cprt: toTrimmedString(suggestion.copyright),
    "©lyr": toTrimmedString(suggestion.lyrics),
    "xid ": toTrimmedString(suggestion.vendor),
    sfID:
      suggestion.appleStorefrontId === null
        ? undefined
        : String(suggestion.appleStorefrontId),
    atID:
      suggestion.appleArtistId === null ? undefined : String(suggestion.appleArtistId),
    plID:
      suggestion.applePlaylistId === null
        ? undefined
        : String(suggestion.applePlaylistId),
    cnID:
      suggestion.appleCatalogId === null ? undefined : String(suggestion.appleCatalogId),
    cmID: suggestion.appleCmId === null ? undefined : String(suggestion.appleCmId),
    geID: suggestion.genreId === null ? undefined : String(suggestion.genreId),
    "----:com.apple.iTunes:PERFORMER": toTrimmedString(
      suggestion.performer || suggestion.artist,
    ),
    "----:com.apple.iTunes:ISRC": toTrimmedString(suggestion.isrc),
  }) as Record<string, string>;
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
    performer: suggestion.performer ? [suggestion.performer] : current.performer,
  };
}

export function isBrowserSimulationPath(path: string): boolean {
  return path.startsWith("browser://");
}
