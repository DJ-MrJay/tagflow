import fs from "fs-extra";
import { TagLib } from "taglib-wasm";
import { hydrateSuggestedMetadata } from "../src/lib/itunes";
import { buildMp4ItemMap, buildPropertyMap } from "../src/lib/tagging";
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
  ) => Promise<ApplyTagsResult>;
}

const WRITE_PENDING_MESSAGES: Partial<Record<SupportedExtension, string>> = {
  unknown: "Unsupported file format.",
};

let tagLibPromise: Promise<TagLib> | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getTagLib(): Promise<TagLib> {
  if (!tagLibPromise) {
    tagLibPromise = TagLib.initialize({
      forceWasmType: "emscripten",
    });
  }

  return tagLibPromise;
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

    const mime = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();

    return {
      bytes: new Uint8Array(arrayBuffer),
      mime,
    };
  } catch {
    return null;
  }
}

const universalWriter: TagWriterStrategy = {
  extension: "mp3",
  async write(file, suggestion) {
    const resolvedSuggestion = await hydrateSuggestedMetadata(suggestion);
    const original = new Uint8Array(await fs.readFile(file.path));
    const tagLib = await getTagLib();
    const audioFile = await tagLib.open(original);

    try {
      audioFile.setProperties(buildPropertyMap(resolvedSuggestion));

      if (file.extension === "m4a" && audioFile.isMP4()) {
        for (const [key, value] of Object.entries(buildMp4ItemMap(resolvedSuggestion))) {
          audioFile.setMP4Item(key, value);
        }
      }

      if (resolvedSuggestion.upc) {
        audioFile.setProperty("UPC", resolvedSuggestion.upc);
      }

      const artwork = await fetchArtwork(resolvedSuggestion.artworkUrl);
      if (artwork) {
        audioFile.setPictures([
          {
            mimeType: artwork.mime,
            data: artwork.bytes,
            type: "FrontCover",
            description: "Cover",
          },
        ]);
      }

      audioFile.save();
      await fs.writeFile(file.path, Buffer.from(audioFile.getFileBuffer()));

      return {
        success: true,
        path: file.path,
        backupPath: null,
        error: null,
        appliedFormat: file.extension,
        appliedSuggestion: resolvedSuggestion,
      };
    } finally {
      audioFile.dispose();
    }
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
      appliedSuggestion: null,
    };
  }

  try {
    return await writer.write(file, suggestion);
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
