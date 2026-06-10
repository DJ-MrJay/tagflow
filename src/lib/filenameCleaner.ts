import type { FileMetadata, FilenameGuess } from "./types";

const TRACK_PREFIX = /^\s*\d{1,3}\s*[-_. )]*/;
const BRACKETED_TEXT = /\[[^\]]*]|\([^)]*\)|\{[^}]*}/g;
const NOISE_TERMS =
  /\b(?:official\s+audio|official\s+video|audio|lyrics?|lyric\s+video|video|hd|hq|remix|mp3|m4a|flac|\d{2,3}\s?kbps|kbps)\b/gi;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function sanitiseSegment(value: string): string {
  return collapseWhitespace(
    value
      .replace(BRACKETED_TEXT, " ")
      .replace(NOISE_TERMS, " ")
      .replace(/[_+.]+/g, " ")
      .replace(/\s*[-–—]+\s*/g, " "),
  );
}

export function deriveFilenameGuess(filename: string): FilenameGuess {
  const withoutExtension = stripExtension(filename);
  const withoutTrackNumber = withoutExtension.replace(TRACK_PREFIX, " ");
  const splitCandidate = collapseWhitespace(
    withoutTrackNumber
      .replace(BRACKETED_TEXT, " ")
      .replace(NOISE_TERMS, " ")
      .replace(/[_+.]+/g, " "),
  );

  const parts = splitCandidate
    .split(/\s*[-–—]\s*/)
    .map((part) => sanitiseSegment(part))
    .filter(Boolean);

  const artistGuess = parts.length >= 2 ? parts[0] : null;
  const titleGuess = parts.length >= 2 ? parts.slice(1).join(" ") : null;
  const cleaned = sanitiseSegment(splitCandidate);

  return {
    cleaned: cleaned || collapseWhitespace(withoutTrackNumber.replace(/[_+.]+/g, " ")),
    artistGuess,
    titleGuess,
  };
}

export function hasMeaningfulMetadata(
  metadata: Pick<FileMetadata, "title" | "artist" | "album">,
): boolean {
  return [metadata.title, metadata.artist, metadata.album].some(
    (value) => value.trim().length > 0,
  );
}
