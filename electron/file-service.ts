import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseFile } from "music-metadata";
import { deriveFilenameGuess, hasMeaningfulMetadata } from "../src/lib/filenameCleaner";
import { getLookupCapabilities, searchCatalogTracks } from "./lookup-service";
import type {
  AudioFileRecord,
  FileMetadata,
  ManualSearchInput,
  SearchContext,
  SearchResultPayload,
  SearchSeed,
  SupportedExtension,
} from "../src/lib/types";

const SUPPORTED_EXTENSIONS = new Set<SupportedExtension>(["mp3", "m4a", "flac"]);
const WRITE_SUPPORTED_EXTENSIONS = new Set<SupportedExtension>(["mp3", "m4a", "flac"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function normaliseExtension(extension: string): SupportedExtension {
  const value = extension.replace(/^\./, "").toLowerCase();
  return SUPPORTED_EXTENSIONS.has(value as SupportedExtension)
    ? (value as SupportedExtension)
    : "unknown";
}

function normaliseString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").join(", ").trim();
  }

  return "";
}

function normaliseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function extractRating(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "number" && Number.isFinite(first)) {
      return first;
    }

    if (typeof first === "object" && first && "rating" in first) {
      const rating = (first as { rating?: unknown }).rating;
      return typeof rating === "number" && Number.isFinite(rating) ? rating : null;
    }
  }

  return null;
}

function artworkToDataUrl(
  picture:
    | {
        data: Uint8Array;
        format: string;
      }
    | undefined,
): string | null {
  if (!picture) {
    return null;
  }

  return `data:${picture.format};base64,${Buffer.from(picture.data).toString("base64")}`;
}

function emptyMetadata(filename: string, extension: SupportedExtension): FileMetadata {
  return {
    title: "",
    artist: "",
    album: "",
    genre: "",
    year: "",
    duration: null,
    artworkDataUrl: null,
    filename,
    extension,
    albumArtist: "",
    trackNumber: null,
    discNumber: null,
    comments: [],
    composer: [],
    publisher: "",
    lyrics: [],
    isrc: "",
    rating: null,
    performer: [],
  };
}

function buildCurrentMetadata(
  metadata: Awaited<ReturnType<typeof parseFile>>,
  filename: string,
  extension: SupportedExtension,
): FileMetadata {
  const commonRecord = metadata.common as unknown as Record<string, unknown>;

  return {
    title: metadata.common.title?.trim() || "",
    artist: metadata.common.artist?.trim() || "",
    album: metadata.common.album?.trim() || "",
    genre: normaliseString(metadata.common.genre),
    year:
      (metadata.common.year ? String(metadata.common.year) : "") ||
      metadata.common.date?.slice(0, 4) ||
      "",
    duration: metadata.format.duration ? Math.round(metadata.format.duration) : null,
    artworkDataUrl: artworkToDataUrl(metadata.common.picture?.[0]),
    filename,
    extension,
    albumArtist: metadata.common.albumartist?.trim() || "",
    trackNumber: metadata.common.track.no ?? null,
    discNumber: metadata.common.disk.no ?? null,
    comments: normaliseStringArray(metadata.common.comment),
    composer: normaliseStringArray(commonRecord.composer),
    publisher: normaliseString(commonRecord.publisher ?? commonRecord.label),
    lyrics: normaliseStringArray(commonRecord.lyrics),
    isrc: normaliseString(commonRecord.isrc),
    rating: extractRating(commonRecord.rating),
    performer: normaliseStringArray(commonRecord.artists ?? metadata.common.artist),
  };
}

function buildSearchSeed(current: FileMetadata, filename: string): SearchSeed {
  const filenameGuess = deriveFilenameGuess(filename);

  if (!hasMeaningfulMetadata(current)) {
    return {
      query: [filenameGuess.artistGuess, filenameGuess.titleGuess].filter(Boolean).join(" ") || filenameGuess.cleaned,
      source: "filename",
      artist: filenameGuess.artistGuess,
      title: filenameGuess.titleGuess || filenameGuess.cleaned,
      album: null,
      filenameGuess,
    };
  }

  const title = current.title || filenameGuess.titleGuess || null;
  const artist = current.artist || filenameGuess.artistGuess || null;
  const album = current.album || null;

  return {
    query: [artist, title, album].filter(Boolean).join(" "),
    source: "tags",
    artist,
    title,
    album,
    filenameGuess,
  };
}

function buildSearchContext(
  current: FileMetadata,
  searchSeed: SearchSeed,
  filename: string,
): SearchContext {
  return {
    title: searchSeed.title || current.title || searchSeed.filenameGuess?.cleaned || filename,
    artist: searchSeed.artist || current.artist || null,
    album: searchSeed.album || current.album || null,
    duration: current.duration,
    filename,
  };
}

function resolveStatus(
  bestSuggestion: AudioFileRecord["bestSuggestion"],
  scanError: string | null,
): AudioFileRecord["status"] {
  if (scanError) {
    return "manual-review";
  }

  if (!bestSuggestion) {
    return "manual-review";
  }

  return bestSuggestion.confidence.level === "high" ? "matched" : "manual-review";
}

async function analyseFile(filePath: string): Promise<AudioFileRecord> {
  const filename = path.basename(filePath);
  const extension = normaliseExtension(path.extname(filePath));
  const current = emptyMetadata(filename, extension);
  const baseSearchSeed = buildSearchSeed(current, filename);

  if (extension === "unknown") {
    return {
      id: randomUUID(),
      path: filePath,
      filename,
      extension,
      current,
      searchSeed: baseSearchSeed,
      suggestions: [],
      bestSuggestion: null,
      status: "unsupported",
      error: "Unsupported file type. TagFlow currently targets MP3, M4A, and FLAC imports.",
      lookupWarning: null,
      resolvedSources: [],
      writeSupported: false,
      backupPath: null,
    };
  }

  try {
    const metadata = await parseFile(filePath, {
      duration: true,
      skipCovers: false,
    });

    const scanned = buildCurrentMetadata(metadata, filename, extension);
    const searchSeed = buildSearchSeed(scanned, filename);
    const searchContext = buildSearchContext(scanned, searchSeed, filename);

    let suggestions: AudioFileRecord["suggestions"] = [];
    let searchError: string | null = null;
    let lookupWarning: string | null = null;
    let resolvedSources: AudioFileRecord["resolvedSources"] = [];

    try {
      const result = await searchCatalogTracks(searchSeed.query, searchContext, "auto");
      suggestions = result.suggestions;
      lookupWarning = result.warning;
      resolvedSources = result.resolvedSources;
    } catch (error) {
      searchError = errorMessage(error);
    }

    const bestSuggestion = suggestions[0] ?? null;

    return {
      id: randomUUID(),
      path: filePath,
      filename,
      extension,
      current: scanned,
      searchSeed,
      suggestions,
      bestSuggestion,
      status: resolveStatus(bestSuggestion, searchError),
      error: searchError,
      lookupWarning,
      resolvedSources,
      writeSupported: WRITE_SUPPORTED_EXTENSIONS.has(extension),
      backupPath: null,
    };
  } catch (error) {
    return {
      id: randomUUID(),
      path: filePath,
      filename,
      extension,
      current,
      searchSeed: baseSearchSeed,
      suggestions: [],
      bestSuggestion: null,
      status: "error",
      error: `Failed to read file metadata: ${errorMessage(error)}`,
      lookupWarning: null,
      resolvedSources: [],
      writeSupported: WRITE_SUPPORTED_EXTENSIONS.has(extension),
      backupPath: null,
    };
  }
}

export async function analyzeFiles(paths: string[]): Promise<AudioFileRecord[]> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  return Promise.all(uniquePaths.map((filePath) => analyseFile(filePath)));
}

export async function runManualSearch(
  file: AudioFileRecord,
  input: ManualSearchInput,
): Promise<SearchResultPayload> {
  const artist = input.artist.trim() || file.current.artist || file.searchSeed.artist || "";
  const title =
    input.title.trim() ||
    file.current.title ||
    file.searchSeed.title ||
    file.searchSeed.filenameGuess?.cleaned ||
    "";
  const album = input.album.trim() || file.current.album || "";

  const searchSeed: SearchSeed = {
    query: [artist, title, album].filter(Boolean).join(" "),
    source: "manual",
    artist: artist || null,
    title: title || null,
    album: album || null,
    filenameGuess: file.searchSeed.filenameGuess,
  };

  const searchContext: SearchContext = {
    title: title || file.filename,
    artist: artist || null,
    album: album || null,
    duration: file.current.duration,
    filename: file.filename,
  };

  const result = await searchCatalogTracks(searchSeed.query, searchContext, input.source);
  return {
    ...result,
    searchSeed,
  };
}

export { getLookupCapabilities };
