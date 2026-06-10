export const SUPPORTED_EXTENSIONS = ["mp3", "m4a", "flac"] as const;

export const IPC_CHANNELS = {
  openFileDialog: "dialog:open-files",
  analyzeFiles: "files:analyze",
  manualSearch: "search:manual",
  applyTags: "tags:apply",
} as const;

export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number] | "unknown";
export type SearchSource = "tags" | "filename" | "manual";
export type MatchConfidenceLevel = "high" | "medium" | "low";
export type FileStatus =
  | "queued"
  | "matched"
  | "manual-review"
  | "skipped"
  | "applied"
  | "error"
  | "unsupported";

export interface FileMetadata {
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  duration: number | null;
  artworkDataUrl: string | null;
  filename: string;
  extension: SupportedExtension;
  albumArtist: string;
  trackNumber: number | null;
  discNumber: number | null;
  comments: string[];
  composer: string[];
  publisher: string;
  lyrics: string[];
  isrc: string;
  rating: number | null;
  performer: string[];
}

export interface FilenameGuess {
  cleaned: string;
  artistGuess: string | null;
  titleGuess: string | null;
}

export interface SearchSeed {
  query: string;
  source: SearchSource;
  artist: string | null;
  title: string | null;
  album: string | null;
  filenameGuess: FilenameGuess | null;
}

export interface SearchContext {
  title: string | null;
  artist: string | null;
  album: string | null;
  duration: number | null;
  filename: string | null;
}

export interface MatchBreakdown {
  title: number;
  artist: number;
  album: number;
  duration: number;
  overall: number;
  level: MatchConfidenceLevel;
}

export interface SuggestedMetadata {
  trackId: number;
  collectionId: number | null;
  artistId: number | null;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  artworkUrl: string | null;
  trackNumber: number | null;
  trackCount: number | null;
  discNumber: number | null;
  discCount: number | null;
  durationMs: number | null;
  releaseDate: string | null;
  previewUrl: string | null;
  trackViewUrl: string | null;
  collectionViewUrl: string | null;
  countryCode: string | null;
  explicit: boolean | null;
  composer: string | null;
  composerSort: string | null;
  publisher: string | null;
  isrc: string | null;
  upc: string | null;
  lyrics: string | null;
  rating: number | null;
  albumArtist: string | null;
  albumArtistSort: string | null;
  artistSort: string | null;
  albumSort: string | null;
  titleSort: string | null;
  performer: string | null;
  contentType: string | null;
  copyright: string | null;
  genreId: number | null;
  appleStorefrontId: number | null;
  appleArtistId: number | null;
  applePlaylistId: number | null;
  appleCatalogId: number | null;
  appleCmId: number | null;
  vendor: string | null;
  editorialNotes: string | null;
  comments: string | null;
  confidence: MatchBreakdown;
  notes: string[];
}

export interface AudioFileRecord {
  id: string;
  path: string;
  filename: string;
  extension: SupportedExtension;
  current: FileMetadata;
  searchSeed: SearchSeed;
  suggestions: SuggestedMetadata[];
  bestSuggestion: SuggestedMetadata | null;
  status: FileStatus;
  error: string | null;
  writeSupported: boolean;
  backupPath: string | null;
}

export interface ManualSearchInput {
  artist: string;
  title: string;
  album: string;
}

export interface SearchResultPayload {
  searchSeed: SearchSeed;
  suggestions: SuggestedMetadata[];
}

export interface ApplyTagsResult {
  success: boolean;
  path: string;
  backupPath: string | null;
  error: string | null;
  appliedFormat: SupportedExtension | null;
  appliedSuggestion?: SuggestedMetadata | null;
}

export interface TagFlowApi {
  openFileDialog: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
  analyzeFiles: (paths: string[]) => Promise<AudioFileRecord[]>;
  manualSearch: (
    file: AudioFileRecord,
    input: ManualSearchInput,
  ) => Promise<SearchResultPayload>;
  applyTags: (
    file: AudioFileRecord,
    suggestion: SuggestedMetadata,
  ) => Promise<ApplyTagsResult>;
}
