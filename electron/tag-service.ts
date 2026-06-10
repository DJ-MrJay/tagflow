import fs from "fs-extra";
import { applyCoverArt, applyTags, setBufferMode } from "taglib-wasm/simple";
import { buildTagPayload } from "../src/lib/tagging";
import type {
  ApplyTagsResult,
  AudioFileRecord,
  SuggestedMetadata,
  SupportedExtension,
} from "../src/lib/types";

interface TagWriterStrategy {
  extension: SupportedExtension;
  write: (
    file: AudioFileRecord,
    suggestion: SuggestedMetadata,
    backupPath: string,
  ) => Promise<ApplyTagsResult>;
}

const WRITE_PENDING_MESSAGES: Partial<Record<SupportedExtension, string>> = {
  unknown: "Unsupported file format.",
};

// Packaged Electron on Windows can hit a broken WASI seek path in taglib-wasm.
// Force the in-memory writer path consistently for desktop tagging.
setBufferMode(true);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function createBackup(filePath: string): Promise<string> {
  const preferredBackupPath = `${filePath}.bak`;

  if (!(await fs.pathExists(preferredBackupPath))) {
    await fs.copy(filePath, preferredBackupPath, {
      overwrite: false,
      errorOnExist: true,
    });
    return preferredBackupPath;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const timestampedBackupPath = `${filePath}.bak.${timestamp}`;
  await fs.copy(filePath, timestampedBackupPath, {
    overwrite: false,
    errorOnExist: true,
  });

  return timestampedBackupPath;
}

async function fetchArtwork(
  artworkUrl: string | null,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!artworkUrl) {
    return null;
  }

  const response = await fetch(artworkUrl);
  if (!response.ok) {
    return null;
  }

  const mime = response.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();

  return {
    bytes: new Uint8Array(arrayBuffer),
    mime,
  };
}

const universalWriter: TagWriterStrategy = {
  extension: "mp3",
  async write(file, suggestion, backupPath) {
    const original = await fs.readFile(file.path);
    let modified = await applyTags(new Uint8Array(original), buildTagPayload(suggestion));

    const artwork = await fetchArtwork(suggestion.artworkUrl);
    if (artwork) {
      modified = await applyCoverArt(modified, artwork.bytes, artwork.mime);
    }

    await fs.writeFile(file.path, Buffer.from(modified));

    return {
      success: true,
      path: file.path,
      backupPath,
      error: null,
      appliedFormat: file.extension,
    };
  },
};

const writers = new Map<SupportedExtension, TagWriterStrategy>([
  ["mp3", universalWriter],
  ["m4a", universalWriter],
  ["flac", universalWriter],
]);

export async function applyTagsToFile(
  file: AudioFileRecord,
  suggestion: SuggestedMetadata,
): Promise<ApplyTagsResult> {
  const writer = writers.get(file.extension);
  if (!writer) {
    return {
      success: false,
      path: file.path,
      backupPath: null,
      error: WRITE_PENDING_MESSAGES[file.extension] || "Unsupported file format.",
      appliedFormat: null,
    };
  }

  let backupPath: string | null = null;

  try {
    backupPath = await createBackup(file.path);
    return await writer.write(file, suggestion, backupPath);
  } catch (error) {
    return {
      success: false,
      path: file.path,
      backupPath,
      error: `Failed to write tags: ${errorMessage(error)}`,
      appliedFormat: null,
    };
  }
}
