import { scoreSuggestion } from "./matcher";
import type { SearchContext, SuggestedMetadata } from "./types";

interface ItunesTrack {
  trackId?: number;
  collectionId?: number;
  artistId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  trackNumber?: number;
  trackCount?: number;
  discNumber?: number;
  discCount?: number;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  previewUrl?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
  collectionArtistName?: string;
  trackExplicitness?: string;
  country?: string;
}

interface ItunesSearchResponse {
  resultCount: number;
  results: ItunesTrack[];
}

interface AppleMusicPayload {
  data?: Array<{
    intent?: {
      contentDescriptor?: {
        locale?: {
          storefront?: string;
        };
      };
    };
    data?: {
      sections?: AppleMusicSection[];
    };
  }>;
}

interface AppleMusicSection {
  items?: AppleMusicItem[];
}

interface AppleMusicItem {
  title?: string;
  trackNumber?: number;
  trackCount?: number;
  discNumber?: number;
  duration?: number;
  composer?: string;
  artistName?: string;
  showExplicitBadge?: boolean;
  contentDescriptor?: {
    identifiers?: {
      storeAdamID?: string;
    };
    url?: string;
  };
  artwork?: {
    dictionary?: {
      url?: string;
      width?: number;
      height?: number;
    };
  };
  subtitleLinks?: Array<{
    title?: string;
    segue?: {
      destination?: {
        contentDescriptor?: {
          identifiers?: {
            storeAdamID?: string;
          };
        };
      };
    };
  }>;
  quaternaryTitle?: string;
  modalPresentationDescriptor?: {
    paragraphText?: string;
  };
}

interface LrcLibTrack {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

interface MusicBrainzSearchResponse {
  recordings?: Array<{
    id?: string;
    title?: string;
    length?: number;
    score?: number;
    "first-release-date"?: string;
    "artist-credit"?: Array<{
      name?: string;
      artist?: {
        name?: string;
      };
    }>;
    releases?: Array<{
      title?: string;
      status?: string;
      country?: string | null;
      date?: string;
    }>;
  }>;
}

interface MusicBrainzRecordingDetail {
  isrcs?: string[];
}

const APPLE_STOREFRONT_IDS: Record<string, number> = {
  au: 143460,
  ca: 143455,
  de: 143443,
  fr: 143442,
  gb: 143444,
  ie: 143449,
  in: 143467,
  it: 143450,
  jp: 143462,
  mx: 143468,
  nl: 143452,
  nz: 143461,
  se: 143456,
  us: 143441,
};

function upgradeArtwork(url: string | undefined, size = 1200): string | null {
  if (!url) {
    return null;
  }

  return url.replace(/\/\d+x\d+bb(?=\.)/, `/${size}x${size}bb`);
}

function yearFromReleaseDate(releaseDate: string | undefined): string {
  return releaseDate?.slice(0, 4) ?? "";
}

function parseExplicitness(value: string | undefined): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "explicit") {
    return true;
  }

  if (normalized === "notexplicit" || normalized === "cleaned") {
    return false;
  }

  return null;
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

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/\u2004/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildArtworkFromTemplate(
  template: string | undefined,
  width: number | undefined,
  height: number | undefined,
): string | null {
  if (!template) {
    return null;
  }

  const maxDimension = Math.min(width ?? 1200, height ?? 1200, 1200);
  return template
    .replace("{w}", String(maxDimension))
    .replace("{h}", String(maxDimension))
    .replace("{f}", "jpg");
}

function extractStorefrontCode(url: string | null): string | null {
  if (!url) {
    return null;
  }

  const match = url.match(/music\.apple\.com\/([a-z]{2})\//i);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractSerializedServerData(html: string): AppleMusicPayload | null {
  const match = html.match(
    /<script[^>]+id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/i,
  );

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]) as AppleMusicPayload;
  } catch {
    return null;
  }
}

function extractFooterCopyright(html: string): string | null {
  const match = html.match(
    /data-testid="tracklist-footer-description">([\s\S]*?)<\/p>/i,
  );

  if (!match) {
    return null;
  }

  const footerText = decodeHtml(match[1]);
  const lines = footerText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.find((line) => line.includes("℗") || line.startsWith("©")) ?? null
  );
}

function extractPublisher(copyright: string | null): string | null {
  if (!copyright) {
    return null;
  }

  const simplified = copyright
    .replace(/^[℗©]\s*/u, "")
    .replace(/^\d{4}\s*/u, "")
    .replace(/\s+(Inc\.?|LLC|Ltd\.?|Limited|Corp\.?)$/iu, "")
    .trim();

  return simplified || null;
}

function extractArtworkIdentifier(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(/\/(\d{12,14})\.jpg(?:\/|$)/i);
  return match?.[1] ?? null;
}

function extractGenreAndYear(value: string | undefined): {
  genre: string | null;
  year: string | null;
} {
  if (!value) {
    return { genre: null, year: null };
  }

  const [genre, year] = value
    .split("·")
    .map((part) => part.replace(/\u2004/g, " ").trim())
    .filter(Boolean);

  return {
    genre: genre || null,
    year: year || null,
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function defaultSort(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function defaultVendor(publisher: string | null, isrc: string | null): string | null {
  if (!publisher || !isrc) {
    return null;
  }

  return `${publisher}:isrc:${isrc}`;
}

function normalizeForComparison(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function pickBestIsrc(isrcs: string[] | undefined): string | null {
  if (!isrcs || isrcs.length === 0) {
    return null;
  }

  return [...isrcs].sort().at(-1) ?? null;
}

async function fetchMusicBrainzIsrc(
  suggestion: SuggestedMetadata,
): Promise<string | null> {
  const albumQueryValue = suggestion.album
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const query = new URLSearchParams({
    query: [
      `recording:"${suggestion.title}"`,
      `artist:"${suggestion.artist}"`,
      albumQueryValue ? `release:"${albumQueryValue}"` : null,
    ]
      .filter(Boolean)
      .join(" AND "),
    fmt: "json",
    limit: "10",
  });

  try {
    const searchResponse = await fetch(
      `https://musicbrainz.org/ws/2/recording?${query.toString()}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "TagFlow/0.1.0 (https://github.com/DJ-MrJay/tagflow)",
        },
      },
    );

    if (!searchResponse.ok) {
      return null;
    }

    const payload = (await searchResponse.json()) as MusicBrainzSearchResponse;
    const expectedTitle = normalizeForComparison(suggestion.title);
    const expectedArtist = normalizeForComparison(suggestion.artist);
    const expectedAlbum = normalizeForComparison(suggestion.album);
    const expectedYear = suggestion.year.slice(0, 4);
    const expectedDuration = suggestion.durationMs ?? null;

    const candidate = (payload.recordings ?? [])
      .map((recording) => {
        const title = normalizeForComparison(recording.title);
        const artist = normalizeForComparison(
          recording["artist-credit"]?.[0]?.artist?.name ??
            recording["artist-credit"]?.[0]?.name,
        );
        const bestRelease = [...(recording.releases ?? [])]
          .map((release) => {
            const normalizedTitle = normalizeForComparison(release.title);
            const albumMatchScore =
              expectedAlbum.length === 0
                ? 0
                : normalizedTitle === expectedAlbum
                  ? 120
                  : normalizedTitle.includes(expectedAlbum) || expectedAlbum.includes(normalizedTitle)
                    ? 60
                    : -60;
            const releaseYear = (release.date ?? "").slice(0, 4);
            const yearMatchScore =
              expectedYear.length === 0 || releaseYear.length === 0
                ? 0
                : expectedYear === releaseYear
                  ? 20
                  : -20;

            return {
              title: normalizedTitle,
              date: release.date ?? "",
              score: albumMatchScore + yearMatchScore + (release.status === "Official" ? 20 : 0),
            };
          })
          .sort((left, right) => right.score - left.score)[0];
        const releaseTitle = bestRelease?.title ?? "";
        const releaseDate = bestRelease?.date ?? recording["first-release-date"] ?? "";
        const releaseYear = releaseDate.slice(0, 4);
        const durationDelta =
          expectedDuration && recording.length
            ? Math.abs(recording.length - expectedDuration)
            : Number.MAX_SAFE_INTEGER;
        const albumScore =
          expectedAlbum.length === 0
            ? 0
            : releaseTitle === expectedAlbum
              ? 120
              : releaseTitle.includes(expectedAlbum) || expectedAlbum.includes(releaseTitle)
                ? 60
                : -60;
        const yearScore =
          expectedYear.length === 0 || releaseYear.length === 0
            ? 0
            : expectedYear === releaseYear
              ? 20
              : -20;
        const durationScore =
          durationDelta <= 5_000 ? 40 : durationDelta <= 15_000 ? 15 : 0;

        return {
          id: recording.id ?? null,
          score:
            (title === expectedTitle ? 100 : 0) +
            (artist === expectedArtist ? 100 : 0) +
            albumScore +
            yearScore +
            durationScore,
        };
      })
      .filter((recording) => recording.id)
      .sort((left, right) => right.score - left.score)[0];

    if (!candidate?.id) {
      return null;
    }

    const detailResponse = await fetch(
      `https://musicbrainz.org/ws/2/recording/${candidate.id}?inc=isrcs&fmt=json`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "TagFlow/0.1.0 (https://github.com/DJ-MrJay/tagflow)",
        },
      },
    );

    if (!detailResponse.ok) {
      return null;
    }

    const detail = (await detailResponse.json()) as MusicBrainzRecordingDetail;
    return pickBestIsrc(detail.isrcs);
  } catch {
    return null;
  }
}

async function fetchLyrics(suggestion: SuggestedMetadata): Promise<string | null> {
  const params = new URLSearchParams({
    track_name: suggestion.title,
    artist_name: suggestion.artist,
  });

  if (suggestion.album) {
    params.set("album_name", suggestion.album);
  }

  if (suggestion.durationMs) {
    params.set("duration", String(Math.round(suggestion.durationMs / 1000)));
  }

  try {
    const directResponse = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (directResponse.ok) {
      const payload = (await directResponse.json()) as LrcLibTrack;
      return payload.syncedLyrics?.trim() || payload.plainLyrics?.trim() || null;
    }
  } catch {
    // Best-effort only.
  }

  try {
    const searchParams = new URLSearchParams({
      track_name: suggestion.title,
      artist_name: suggestion.artist,
    });

    if (suggestion.album) {
      searchParams.set("album_name", suggestion.album);
    }

    const searchResponse = await fetch(
      `https://lrclib.net/api/search?${searchParams.toString()}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!searchResponse.ok) {
      return null;
    }

    const results = (await searchResponse.json()) as LrcLibTrack[];
    const bestResult = results[0];
    return bestResult?.syncedLyrics?.trim() || bestResult?.plainLyrics?.trim() || null;
  } catch {
    return null;
  }
}

async function fetchAppleMusicDetails(
  suggestion: SuggestedMetadata,
): Promise<Partial<SuggestedMetadata>> {
  const pageUrl = suggestion.trackViewUrl || suggestion.collectionViewUrl;
  if (!pageUrl) {
    return {};
  }

  try {
    const response = await fetch(pageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return {};
    }

    const html = await response.text();
    const payload = extractSerializedServerData(html);
    const pageData = payload?.data?.[0];
    const sections = pageData?.data?.sections ?? [];
    const header = sections[0]?.items?.[0];
    const trackItems = sections.find((section) =>
      section.items?.some((item) => typeof item.trackNumber === "number"),
    )?.items;
    const track = trackItems?.find(
      (item) =>
        item.contentDescriptor?.identifiers?.storeAdamID === String(suggestion.trackId) ||
        item.title?.trim() === suggestion.title.trim(),
    );
    const storefrontCode =
      pageData?.intent?.contentDescriptor?.locale?.storefront ??
      extractStorefrontCode(pageUrl);
    const artworkUrl =
      buildArtworkFromTemplate(
        header?.artwork?.dictionary?.url,
        header?.artwork?.dictionary?.width,
        header?.artwork?.dictionary?.height,
      ) ?? suggestion.artworkUrl;
    const footerCopyright = extractFooterCopyright(html);
    const { genre, year } = extractGenreAndYear(header?.quaternaryTitle);
    const publisher =
      extractPublisher(footerCopyright) ??
      extractPublisher(suggestion.copyright) ??
      suggestion.publisher;
    const upc =
      extractArtworkIdentifier(header?.artwork?.dictionary?.url) ??
      extractArtworkIdentifier(artworkUrl) ??
      suggestion.upc;

    return {
      title: track?.title?.trim() || suggestion.title,
      artist: track?.artistName?.trim() || suggestion.artist,
      album: header?.title?.trim() || suggestion.album,
      genre: genre || suggestion.genre,
      year: year || suggestion.year,
      artworkUrl,
      trackNumber: track?.trackNumber ?? suggestion.trackNumber,
      trackCount: header?.trackCount ?? suggestion.trackCount,
      discNumber: track?.discNumber ?? suggestion.discNumber,
      discCount: suggestion.discCount,
      durationMs: track?.duration ?? suggestion.durationMs,
      composer: track?.composer?.trim() || suggestion.composer,
      publisher,
      albumArtist:
        header?.subtitleLinks?.[0]?.title?.trim() ||
        suggestion.albumArtist ||
        track?.artistName?.trim() ||
        suggestion.artist,
      explicit:
        typeof track?.showExplicitBadge === "boolean"
          ? track.showExplicitBadge
          : suggestion.explicit,
      copyright: footerCopyright || suggestion.copyright,
      upc,
      appleStorefrontId:
        storefrontCode ? (APPLE_STOREFRONT_IDS[storefrontCode] ?? null) : null,
      appleArtistId:
        toNumber(
          header?.subtitleLinks?.[0]?.segue?.destination?.contentDescriptor?.identifiers
            ?.storeAdamID,
        ) ?? suggestion.artistId,
      applePlaylistId:
        toNumber(header?.contentDescriptor?.identifiers?.storeAdamID) ??
        suggestion.collectionId,
      appleCatalogId:
        toNumber(track?.contentDescriptor?.identifiers?.storeAdamID) ??
        suggestion.trackId,
      editorialNotes:
        decodeHtml(header?.modalPresentationDescriptor?.paragraphText ?? "") || null,
      countryCode: suggestion.countryCode || storefrontCode?.toUpperCase() || null,
    };
  } catch {
    return {};
  }
}

export async function hydrateSuggestedMetadata(
  suggestion: SuggestedMetadata,
): Promise<SuggestedMetadata> {
  const [appleMusicDetails, lyrics, musicBrainzIsrc] = await Promise.all([
    fetchAppleMusicDetails(suggestion),
    suggestion.lyrics ? Promise.resolve(suggestion.lyrics) : fetchLyrics(suggestion),
    suggestion.isrc ? Promise.resolve(suggestion.isrc) : fetchMusicBrainzIsrc(suggestion),
  ]);

  const resolvedIsrc = suggestion.isrc || musicBrainzIsrc || null;

  const merged: SuggestedMetadata = {
    ...suggestion,
    ...appleMusicDetails,
    artworkUrl: appleMusicDetails.artworkUrl ?? suggestion.artworkUrl,
    lyrics: suggestion.lyrics || lyrics || null,
    albumArtist:
      appleMusicDetails.albumArtist ??
      suggestion.albumArtist ??
      appleMusicDetails.artist ??
      suggestion.artist,
    performer:
      suggestion.performer ??
      appleMusicDetails.artist ??
      suggestion.artist ??
      null,
    composer: appleMusicDetails.composer ?? suggestion.composer,
    composerSort:
      appleMusicDetails.composerSort ??
      suggestion.composerSort ??
      defaultSort(appleMusicDetails.composer ?? suggestion.composer),
    titleSort:
      appleMusicDetails.titleSort ??
      suggestion.titleSort ??
      defaultSort(appleMusicDetails.title ?? suggestion.title),
    artistSort:
      appleMusicDetails.artistSort ??
      suggestion.artistSort ??
      defaultSort(appleMusicDetails.artist ?? suggestion.artist),
    albumSort:
      appleMusicDetails.albumSort ??
      suggestion.albumSort ??
      defaultSort(appleMusicDetails.album ?? suggestion.album),
    albumArtistSort:
      appleMusicDetails.albumArtistSort ??
      suggestion.albumArtistSort ??
      defaultSort(
        appleMusicDetails.albumArtist ??
          suggestion.albumArtist ??
          appleMusicDetails.artist ??
          suggestion.artist,
    ),
    publisher: appleMusicDetails.publisher ?? suggestion.publisher,
    isrc: resolvedIsrc,
    copyright: appleMusicDetails.copyright ?? suggestion.copyright,
    upc: appleMusicDetails.upc ?? suggestion.upc,
    contentType: suggestion.contentType || "Music",
    rating:
      suggestion.rating ??
      (typeof (appleMusicDetails.explicit ?? suggestion.explicit) === "boolean"
        ? (appleMusicDetails.explicit ?? suggestion.explicit)
          ? 1
          : 0
        : null),
    appleStorefrontId:
      appleMusicDetails.appleStorefrontId ?? suggestion.appleStorefrontId,
    appleArtistId: appleMusicDetails.appleArtistId ?? suggestion.appleArtistId,
    applePlaylistId:
      appleMusicDetails.applePlaylistId ?? suggestion.applePlaylistId,
    appleCatalogId: appleMusicDetails.appleCatalogId ?? suggestion.appleCatalogId,
    appleCmId: suggestion.appleCmId,
    vendor:
      suggestion.vendor ||
      defaultVendor(
        appleMusicDetails.publisher ?? suggestion.publisher,
        resolvedIsrc,
      ),
    comments: suggestion.comments,
  };

  return merged;
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
      const albumArtist = result.collectionArtistName?.trim() || artist;
      const explicit = parseExplicitness(result.trackExplicitness);
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
        collectionId: result.collectionId ?? null,
        artistId: result.artistId ?? null,
        title,
        artist,
        album,
        genre: result.primaryGenreName?.trim() || "",
        year: yearFromReleaseDate(result.releaseDate),
        artworkUrl: upgradeArtwork(result.artworkUrl100),
        trackNumber: result.trackNumber ?? null,
        trackCount: result.trackCount ?? null,
        discNumber: result.discNumber ?? null,
        discCount: result.discCount ?? null,
        durationMs: result.trackTimeMillis ?? null,
        releaseDate: result.releaseDate ?? null,
        previewUrl: result.previewUrl ?? null,
        trackViewUrl: result.trackViewUrl ?? null,
        collectionViewUrl: result.collectionViewUrl ?? null,
        countryCode: result.country?.trim() || null,
        explicit,
        composer: null,
        composerSort: null,
        publisher: null,
        isrc: null,
        upc: null,
        lyrics: null,
        rating: explicit === null ? null : explicit ? 1 : 0,
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
        appleArtistId: result.artistId ?? null,
        applePlaylistId: result.collectionId ?? null,
        appleCatalogId: result.trackId ?? null,
        appleCmId: null,
        vendor: null,
        editorialNotes: null,
        comments: null,
        confidence,
        notes: buildNotes(confidence, context, result.trackTimeMillis),
      } satisfies SuggestedMetadata;
    })
    .sort((left, right) => right.confidence.overall - left.confidence.overall);
}
