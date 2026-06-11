import { scoreSuggestion } from "../src/lib/matcher";
import { searchItunesTracks } from "../src/lib/itunes";
import type {
  LookupPreference,
  LookupService,
  SearchContext,
  SearchResultPayload,
  SuggestedMetadata,
  TagFlowCapabilities,
} from "../src/lib/types";

interface SpotifyImage {
  url?: string;
  width?: number;
  height?: number;
}

interface SpotifyArtist {
  id?: string;
  name?: string;
}

interface SpotifyAlbum {
  id?: string;
  name?: string;
  release_date?: string;
  total_tracks?: number;
  images?: SpotifyImage[];
  artists?: SpotifyArtist[];
}

interface SpotifyTrack {
  id?: string;
  name?: string;
  artists?: SpotifyArtist[];
  album?: SpotifyAlbum;
  disc_number?: number;
  duration_ms?: number;
  explicit?: boolean;
  external_ids?: {
    isrc?: string;
    upc?: string;
  };
  external_urls?: {
    spotify?: string;
  };
  preview_url?: string | null;
  track_number?: number;
}

interface SpotifySearchResponse {
  tracks?: {
    items?: SpotifyTrack[];
  };
}

interface SpotifyTokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface SpotifyTokenState {
  accessToken: string;
  expiresAt: number;
}

let spotifyTokenState: SpotifyTokenState | null = null;

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function extractStatusCode(error: unknown): number | null {
  const match = errorMessage(error).match(/status\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function spotifyCredentials():
  | {
      clientId: string;
      clientSecret: string;
    }
  | null {
  const clientId =
    process.env.TAGFLOW_SPOTIFY_CLIENT_ID?.trim() ||
    process.env.SPOTIFY_CLIENT_ID?.trim() ||
    "";
  const clientSecret =
    process.env.TAGFLOW_SPOTIFY_CLIENT_SECRET?.trim() ||
    process.env.SPOTIFY_CLIENT_SECRET?.trim() ||
    "";

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
  };
}

function spotifyLookupEnabled(): boolean {
  return spotifyCredentials() !== null;
}

function createPayload(
  suggestions: SuggestedMetadata[],
  lookupSource: LookupPreference,
  resolvedSources: LookupService[],
  warning: string | null,
): SearchResultPayload {
  return {
    searchSeed: {
      query: "",
      source: "manual",
      artist: null,
      title: null,
      album: null,
      filenameGuess: null,
    },
    suggestions,
    warning,
    resolvedSources,
    lookupSource,
  };
}

function withLookupNote(
  suggestions: SuggestedMetadata[],
  note: string | null,
): SuggestedMetadata[] {
  if (!note) {
    return suggestions;
  }

  return suggestions.map((suggestion) => ({
    ...suggestion,
    notes: suggestion.notes.includes(note) ? suggestion.notes : [note, ...suggestion.notes],
  }));
}

function buildSpotifyQuery(query: string, context: SearchContext): string {
  const parts = [
    context.title ? `track:${context.title}` : null,
    context.artist ? `artist:${context.artist}` : null,
    context.album ? `album:${context.album}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : query.trim();
}

function pickLargestImage(images: SpotifyImage[] | undefined): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  const sorted = [...images].sort(
    (left, right) => (right.width ?? 0) * (right.height ?? 0) - (left.width ?? 0) * (left.height ?? 0),
  );

  return sorted[0]?.url ?? null;
}

async function getSpotifyAccessToken(): Promise<string> {
  const credentials = spotifyCredentials();
  if (!credentials) {
    throw new Error(
      "Spotify lookup is not configured. Set TAGFLOW_SPOTIFY_CLIENT_ID and TAGFLOW_SPOTIFY_CLIENT_SECRET.",
    );
  }

  if (
    spotifyTokenState &&
    spotifyTokenState.expiresAt > Date.now() + 30_000
  ) {
    return spotifyTokenState.accessToken;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${credentials.clientId}:${credentials.clientSecret}`,
        "utf8",
      ).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    throw new Error(`Spotify token request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as SpotifyTokenResponse;
  const accessToken = payload.access_token?.trim();
  if (!accessToken) {
    throw new Error("Spotify token request did not return an access token.");
  }

  spotifyTokenState = {
    accessToken,
    expiresAt: Date.now() + Math.max((payload.expires_in ?? 3600) - 60, 60) * 1000,
  };

  return accessToken;
}

async function searchSpotifyTracks(
  query: string,
  context: SearchContext,
): Promise<SuggestedMetadata[]> {
  const token = await getSpotifyAccessToken();
  const searchQuery = buildSpotifyQuery(query, context);

  if (!searchQuery) {
    return [];
  }

  const params = new URLSearchParams({
    q: searchQuery,
    type: "track",
    limit: "10",
  });
  const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify lookup failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as SpotifySearchResponse;
  const items = payload.tracks?.items ?? [];

  return items
    .map((track, index) => {
      const title = track.name?.trim() || "Unknown title";
      const artist = track.artists?.map((entry) => entry.name?.trim()).filter(Boolean).join(", ") || "Unknown artist";
      const album = track.album?.name?.trim() || "";
      const albumArtist =
        track.album?.artists?.map((entry) => entry.name?.trim()).filter(Boolean).join(", ") ||
        artist;
      const confidence = scoreSuggestion(
        {
          title,
          artist,
          album,
          durationMs: track.duration_ms ?? null,
        },
        context,
      );

      return {
        trackId: track.id?.trim() || `spotify-${Date.now()}-${index}`,
        collectionId: null,
        artistId: null,
        title,
        artist,
        album,
        genre: "",
        year: track.album?.release_date?.slice(0, 4) ?? "",
        artworkUrl: pickLargestImage(track.album?.images),
        trackNumber: track.track_number ?? null,
        trackCount: track.album?.total_tracks ?? null,
        discNumber: track.disc_number ?? null,
        discCount: null,
        durationMs: track.duration_ms ?? null,
        releaseDate: track.album?.release_date ?? null,
        previewUrl: track.preview_url ?? null,
        trackViewUrl: null,
        collectionViewUrl: null,
        countryCode: null,
        explicit: typeof track.explicit === "boolean" ? track.explicit : null,
        composer: null,
        composerSort: null,
        publisher: null,
        isrc: track.external_ids?.isrc?.trim() || null,
        upc: track.external_ids?.upc?.trim() || null,
        lyrics: null,
        rating:
          typeof track.explicit === "boolean"
            ? track.explicit
              ? 1
              : 0
            : null,
        albumArtist,
        albumArtistSort: albumArtist,
        artistSort: artist,
        albumSort: album || null,
        titleSort: title,
        performer: artist,
        contentType: "Music",
        copyright: null,
        genreId: null,
        appleStorefrontId: null,
        appleArtistId: null,
        applePlaylistId: null,
        appleCatalogId: null,
        appleCmId: null,
        vendor: null,
        editorialNotes: null,
        comments: null,
        lookupSource: "spotify",
        sourceUrl: track.external_urls?.spotify?.trim() || null,
        confidence,
        notes: buildNotes(confidence, context, track.duration_ms),
      } satisfies SuggestedMetadata;
    })
    .sort((left, right) => right.confidence.overall - left.confidence.overall);
}

export function getLookupCapabilities(): TagFlowCapabilities {
  return {
    desktop: true,
    spotifyLookup: spotifyLookupEnabled(),
    nativeMenu: true,
  };
}

export async function searchCatalogTracks(
  query: string,
  context: SearchContext,
  preference: LookupPreference,
): Promise<SearchResultPayload> {
  if (preference === "apple") {
    return createPayload(await searchItunesTracks(query, context), "apple", ["apple"], null);
  }

  if (preference === "spotify") {
    if (!spotifyLookupEnabled()) {
      throw new Error(
        "Spotify lookup is not configured. Set TAGFLOW_SPOTIFY_CLIENT_ID and TAGFLOW_SPOTIFY_CLIENT_SECRET.",
      );
    }

    return createPayload(await searchSpotifyTracks(query, context), "spotify", ["spotify"], null);
  }

  try {
    const appleSuggestions = await searchItunesTracks(query, context);
    if (appleSuggestions.length > 0 || !spotifyLookupEnabled()) {
      return createPayload(appleSuggestions, "auto", ["apple"], null);
    }
  } catch (error) {
    if (!spotifyLookupEnabled()) {
      const statusCode = extractStatusCode(error);
      if (statusCode === 403) {
        throw new Error(
          "iTunes lookup failed with status 403. Spotify fallback is available once TAGFLOW_SPOTIFY_CLIENT_ID and TAGFLOW_SPOTIFY_CLIENT_SECRET are configured.",
        );
      }

      throw error;
    }

    const warning = `Apple Music lookup failed (${errorMessage(error)}). Showing Spotify matches instead.`;
    const spotifySuggestions = withLookupNote(await searchSpotifyTracks(query, context), warning);
    return createPayload(spotifySuggestions, "auto", ["apple", "spotify"], warning);
  }

  const warning = "No Apple Music matches found. Showing Spotify matches instead.";
  const spotifySuggestions = withLookupNote(await searchSpotifyTracks(query, context), warning);
  return createPayload(spotifySuggestions, "auto", ["apple", "spotify"], warning);
}
