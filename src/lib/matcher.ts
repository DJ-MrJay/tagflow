import type {
  MatchBreakdown,
  MatchConfidenceLevel,
  SearchContext,
  SuggestedMetadata,
} from "./types";

const MATCH_NOISE_TERMS =
  /\b(?:feat|featuring|ft|official|audio|video|mono|stereo|remaster(?:ed)?|version|edit)\b/gi;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeComparisonText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(MATCH_NOISE_TERMS, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildBigrams(value: string): string[] {
  if (value.length < 2) {
    return value ? [value] : [];
  }

  const bigrams: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    bigrams.push(value.slice(index, index + 2));
  }
  return bigrams;
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }

  const leftBigrams = buildBigrams(left);
  const rightBigrams = buildBigrams(right);
  const rightPool = [...rightBigrams];
  let matches = 0;

  for (const bigram of leftBigrams) {
    const matchIndex = rightPool.indexOf(bigram);
    if (matchIndex >= 0) {
      matches += 1;
      rightPool.splice(matchIndex, 1);
    }
  }

  return (2 * matches) / (leftBigrams.length + rightBigrams.length);
}

function tokenOverlap(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let matches = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  }

  return matches / Math.max(leftTokens.size, rightTokens.size);
}

export function compareText(left: string | null | undefined, right: string | null | undefined): number {
  const normalizedLeft = normalizeComparisonText(left);
  const normalizedRight = normalizeComparisonText(right);

  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }

  if (normalizedLeft === normalizedRight) {
    return 1;
  }

  const containsBoost =
    normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)
      ? 0.1
      : 0;

  return clamp(
    diceCoefficient(normalizedLeft, normalizedRight) * 0.65 +
      tokenOverlap(normalizedLeft, normalizedRight) * 0.35 +
      containsBoost,
  );
}

function durationSimilarity(sourceDuration: number, candidateDurationMs: number): number {
  const deltaSeconds = Math.abs(sourceDuration * 1000 - candidateDurationMs) / 1000;
  if (deltaSeconds <= 2) {
    return 1;
  }
  if (deltaSeconds <= 5) {
    return 0.92;
  }
  if (deltaSeconds <= 10) {
    return 0.78;
  }
  if (deltaSeconds <= 20) {
    return 0.55;
  }
  return 0.2;
}

function confidenceLevel(
  overall: number,
  titleScore: number,
  artistScore: number,
  artistRequired: boolean,
): MatchConfidenceLevel {
  const artistGate = artistRequired ? artistScore : 0.72;

  if (overall >= 0.82 && titleScore >= 0.75 && artistGate >= 0.65) {
    return "high";
  }
  if (overall >= 0.58 && titleScore >= 0.45) {
    return "medium";
  }
  return "low";
}

export function scoreSuggestion(
  candidate: Pick<SuggestedMetadata, "title" | "artist" | "album" | "durationMs">,
  context: SearchContext,
): MatchBreakdown {
  const comparisonTitle = context.title || context.filename || "";
  const title = compareText(comparisonTitle, candidate.title);
  const artist = context.artist ? compareText(context.artist, candidate.artist) : 0;
  const album = context.album ? compareText(context.album, candidate.album) : 0;
  const duration =
    context.duration && candidate.durationMs
      ? durationSimilarity(context.duration, candidate.durationMs)
      : 0;

  let weightedSum = 0;
  let totalWeight = 0;

  if (comparisonTitle) {
    weightedSum += title * 0.48;
    totalWeight += 0.48;
  }
  if (context.artist) {
    weightedSum += artist * 0.32;
    totalWeight += 0.32;
  }
  if (context.album) {
    weightedSum += album * 0.1;
    totalWeight += 0.1;
  }
  if (context.duration && candidate.durationMs) {
    weightedSum += duration * 0.1;
    totalWeight += 0.1;
  }

  const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    title: Number(title.toFixed(3)),
    artist: Number(artist.toFixed(3)),
    album: Number(album.toFixed(3)),
    duration: Number(duration.toFixed(3)),
    overall: Number(overall.toFixed(3)),
    level: confidenceLevel(overall, title, artist, Boolean(context.artist)),
  };
}
