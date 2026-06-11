import { applyCoverArt, applyTags } from "taglib-wasm/simple";
import { parseBlob } from "music-metadata";
import { deriveFilenameGuess, hasMeaningfulMetadata } from "./filenameCleaner";
import { searchItunesTracks } from "./itunes";
import { buildTagPayload } from "./tagging";
import type {
  ApplyTagsResult,
  AudioFileRecord,
  FileMetadata,
  ManualSearchInput,
  SearchContext,
  SearchResultPayload,
  SearchSeed,
  SuggestedMetadata,
  SupportedExtension,
} from "./types";

const SUPPORTED_EXTENSIONS = new Set<SupportedExtension>(["mp3", "m4a", "flac"]);
const browserFiles = new Map<string, File>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function normaliseExtension(filename: string): SupportedExtension {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_EXTENSIONS.has(extension as SupportedExtension)
    ? (extension as SupportedExtension)
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

function mimeTypeForExtension(extension: SupportedExtension): string {
  switch (extension) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}

async function fetchArtwork(
  artworkUrl: string | null,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!artworkUrl) {
    return null;
  }

  try {
    const response = await fetch(artworkUrl);
    if (!response.ok) {
      return null;
    }

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mime: response.headers.get("content-type") || "image/jpeg",
    };
  } catch {
    return null;
  }
}

function triggerDownload(file: File): string {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return file.name;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    output += String.fromCharCode(...chunk);
  }

  return btoa(output);
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

  return `data:${picture.format};base64,${bytesToBase64(picture.data)}`;
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
  metadata: Awaited<ReturnType<typeof parseBlob>>,
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

async function analyseBrowserFile(file: File): Promise<AudioFileRecord> {
  const filename = file.name;
  const extension = normaliseExtension(filename);
  const baseMetadata = emptyMetadata(filename, extension);
  const baseSearchSeed = buildSearchSeed(baseMetadata, filename);
  const syntheticPath = `browser://${filename}-${file.size}-${file.lastModified}`;

  browserFiles.set(syntheticPath, file);

  if (extension === "unknown") {
    return {
      id: crypto.randomUUID(),
      path: syntheticPath,
      filename,
      extension,
      current: baseMetadata,
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

  let current = baseMetadata;
  let searchSeed = baseSearchSeed;
  let metadataError: string | null = null;

  try {
    const parsed = await parseBlob(file, { duration: true, skipCovers: false });
    current = buildCurrentMetadata(parsed, filename, extension);
    searchSeed = buildSearchSeed(current, filename);
  } catch (error) {
    metadataError = `Failed to read file metadata: ${errorMessage(error)}`;
  }

  let suggestions: AudioFileRecord["suggestions"] = [];
  let searchError: string | null = metadataError;

  try {
    suggestions = await searchItunesTracks(
      searchSeed.query,
      buildSearchContext(current, searchSeed, filename),
    );
  } catch (error) {
    searchError = metadataError
      ? `${metadataError} iTunes search also failed: ${errorMessage(error)}`
      : errorMessage(error);
  }

  const bestSuggestion = suggestions[0] ?? null;

  return {
    id: crypto.randomUUID(),
    path: syntheticPath,
    filename,
    extension,
    current,
    searchSeed,
    suggestions,
    bestSuggestion,
    status: resolveStatus(bestSuggestion, searchError),
    error: searchError,
    lookupWarning: null,
    resolvedSources: suggestions.length > 0 ? ["apple"] : [],
    writeSupported: true,
    backupPath: null,
  };
}

export async function analyzeBrowserFiles(files: File[]): Promise<AudioFileRecord[]> {
  const uniqueFiles = files.filter(
    (file, index, current) =>
      current.findIndex(
        (candidate) =>
          candidate.name === file.name &&
          candidate.size === file.size &&
          candidate.lastModified === file.lastModified,
      ) === index,
  );

  return Promise.all(uniqueFiles.map((file) => analyseBrowserFile(file)));
}

export async function runBrowserManualSearch(
  file: AudioFileRecord,
  input: ManualSearchInput,
): Promise<SearchResultPayload> {
  if (input.source === "spotify") {
    throw new Error(
      "Spotify lookup is only available in the desktop app because it requires private API credentials.",
    );
  }

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

  return {
    searchSeed,
    warning: null,
    resolvedSources: ["apple"],
    lookupSource: input.source,
    suggestions: await searchItunesTracks(searchSeed.query, {
      title: title || file.filename,
      artist: artist || null,
      album: album || null,
      duration: file.current.duration,
      filename: file.filename,
    }),
  };
}

export async function applyTagsInBrowser(
  file: AudioFileRecord,
  suggestion: SuggestedMetadata,
): Promise<ApplyTagsResult> {
  const sourceFile = browserFiles.get(file.path);
  if (!sourceFile) {
    return {
      success: false,
      path: file.path,
      backupPath: null,
      error: "The browser copy of this file is no longer cached. Re-import it and try again.",
      appliedFormat: null,
      appliedSuggestion: null,
    };
  }

  try {
    let modified = await applyTags(sourceFile, buildTagPayload(suggestion));
    const artwork = await fetchArtwork(suggestion.artworkUrl);

    if (artwork) {
      modified = await applyCoverArt(modified, artwork.bytes, artwork.mime);
    }

    const updatedFile = new File([toArrayBuffer(modified)], sourceFile.name, {
      type: sourceFile.type || mimeTypeForExtension(file.extension),
      lastModified: Date.now(),
    });

    browserFiles.set(file.path, updatedFile);

    return {
      success: true,
      path: file.path,
      backupPath: triggerDownload(updatedFile),
      error: null,
      appliedFormat: file.extension,
      appliedSuggestion: suggestion,
    };
  } catch (error) {
    return {
      success: false,
      path: file.path,
      backupPath: null,
      error: `Failed to write tags: ${errorMessage(error)}`,
      appliedFormat: null,
      appliedSuggestion: null,
    };
  }
}
