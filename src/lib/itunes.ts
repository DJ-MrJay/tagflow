import { scoreSuggestion } from "./matcher";
import type { SearchContext, SuggestedMetadata } from "./types";

interface ItunesTrack {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  trackNumber?: number;
  discNumber?: number;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  collectionArtistName?: string;
  copyright?: string;
}

interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesTrack[];
}

function upgradeArtwork(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  return url.replace("100x100bb", "600x600bb");
}

function yearFromReleaseDate(releaseDate: string | undefined): string {
  return releaseDate?.slice(0, 4) ?? "";
}

function buildNotes(
  confidenceLevel: SuggestedMetadata["confidence"],
  context: SearchContext,
  durationMs: number | undefined,
): string[] {
  const notes: string[] = [];

  if (confidenceLevel.level === "high") {
    notes.push("High confidence match.");
  } else if (confidenceLevel.level === "medium") {
    notes.push("Manual review recommended.");
  } else {
    notes.push("Low confidence match. Search manually before applying.");
  }

  if (
    context.duration &&
    durationMs &&
    Math.abs(context.duration * 1000 - durationMs) > 10000
  ) {
    notes.push("Duration differs noticeably from the local file.");
  }

  return notes;
}

export async function searchItunesTracks(
  query: string,
  context: SearchContext,
): Promise<SuggestedMetadata[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
    trimmedQuery,
  )}&media=music&entity=song&limit=10`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`iTunes lookup failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as ItunesSearchResponse;

  return payload.results
    .map((result, index) => {
      const title = result.trackName?.trim() || "Unknown title";
      const artist = result.artistName?.trim() || "Unknown artist";
      const album = result.collectionName?.trim() || "";
      const confidence = scoreSuggestion(
        {
          title,
          artist,
          album,
          durationMs: result.trackTimeMillis ?? null,
        },
        context,
      );

      return {
        trackId: result.trackId ?? Date.now() + index,
        title,
        artist,
        album,
        genre: result.primaryGenreName?.trim() || "",
        year: yearFromReleaseDate(result.releaseDate),
        artworkUrl: upgradeArtwork(result.artworkUrl100),
        trackNumber: result.trackNumber ?? null,
        discNumber: result.discNumber ?? null,
        durationMs: result.trackTimeMillis ?? null,
        releaseDate: result.releaseDate ?? null,
        previewUrl: result.previewUrl ?? null,
        composer: null,
        publisher: null,
        isrc: null,
        lyrics: null,
        rating: null,
        albumArtist: result.collectionArtistName?.trim() || artist,
        comments: result.copyright?.trim() || null,
        confidence,
        notes: buildNotes(confidence, context, result.trackTimeMillis),
      } satisfies SuggestedMetadata;
    })
    .sort((left, right) => right.confidence.overall - left.confidence.overall);
}
