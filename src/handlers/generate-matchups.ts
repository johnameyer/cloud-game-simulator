import { ArtifactRetentionTag, matchupSummaryKey, matchupsListKey, putArtifact } from '../s3-artifacts.js';
import { resolveDeck } from '../deck-resolver.js';
import { buildMatchupCacheId } from '../cache-key.js';
import { getMatchupCacheEntry } from '../matchup-cache-table.js';
import { putMatchupSummary } from '../matchups-table.js';
import type { GenerateMatchupsEvent, GenerateMatchupsResult, MatchupSpec } from '../types.js';

const RESULTS_BUCKET = process.env.RESULTS_BUCKET;
const MATCHUPS_TABLE = process.env.MATCHUPS_TABLE;
const MATCHUP_CACHE_TABLE = process.env.MATCHUP_CACHE_TABLE;
const ENGINE_VERSION = process.env.ENGINE_VERSION;

function allPairs(deckIds: string[]): { deck0Id: string; deck1Id: string }[] {
    const pairs: { deck0Id: string; deck1Id: string }[] = [];
    for (let i = 0; i < deckIds.length; i++) {
        for (let j = i + 1; j < deckIds.length; j++) {
            pairs.push({ deck0Id: deckIds[i], deck1Id: deckIds[j] });
        }
    }
    return pairs;
}

/**
 * Resolves a run's matchup input - either an explicit list of deck pairs, or
 * a flat deck id list expanded into every pairwise matchup - into the
 * matchups.json array the outer Distributed Map reads from S3. Matchups
 * already satisfied by the cache (see cache-key.ts) are reused directly -
 * their cached MatchupSummary is copied into this run's Matchups table
 * rows and they're excluded from matchups.json, skipping simulation
 * entirely.
 */
export async function handler(event: GenerateMatchupsEvent): Promise<GenerateMatchupsResult> {
    if (!RESULTS_BUCKET) {
        throw new Error('RESULTS_BUCKET environment variable is not set');
    }
    if (!MATCHUPS_TABLE) {
        throw new Error('MATCHUPS_TABLE environment variable is not set');
    }
    if (!MATCHUP_CACHE_TABLE) {
        throw new Error('MATCHUP_CACHE_TABLE environment variable is not set');
    }
    if (!ENGINE_VERSION) {
        throw new Error('ENGINE_VERSION environment variable is not set');
    }
    if (!event.matchups && !event.deckIds) {
        throw new Error('GenerateMatchupsEvent must specify either matchups or deckIds');
    }

    const pairs = event.matchups ?? allPairs(event.deckIds ?? []);
    if (pairs.length === 0) {
        throw new Error('No matchups to generate (deckIds must have at least 2 entries)');
    }

    const gameNumbers = Array.from({ length: event.numGames }, (_, i) => i + 1);
    const strategy = event.strategy ?? 'default';
    const ismctsOptions = event.ismctsOptions ?? {};

    const matchupSpecs: MatchupSpec[] = [];
    let cachedCount = 0;

    for (const [ index, { deck0Id, deck1Id }] of pairs.entries()) {
        const matchupId = `${index}-${deck0Id}-vs-${deck1Id}`;
        const deck0 = resolveDeck(deck0Id);
        const deck1 = resolveDeck(deck1Id);
        const matchupCacheId = buildMatchupCacheId(ENGINE_VERSION, deck0, deck1, strategy, ismctsOptions);

        const cached = event.forceRefresh ? undefined : await getMatchupCacheEntry(MATCHUP_CACHE_TABLE, matchupCacheId);
        if (cached && cached.totalGames >= event.numGames) {
            cachedCount++;
            await putMatchupSummary(MATCHUPS_TABLE, {
                ...cached.summary,
                runId: event.runId,
                matchupId,
                summaryKey: matchupSummaryKey(cached.sourceRunId, cached.sourceMatchupId),
            });
            continue;
        }

        matchupSpecs.push({ matchupId, deck0Id, deck1Id, strategy, ismctsOptions, gameNumbers });
    }

    const matchupsKey = matchupsListKey(event.runId);
    await putArtifact(RESULTS_BUCKET, matchupsKey, JSON.stringify(matchupSpecs), ArtifactRetentionTag.SUMMARY);

    return {
        runId: event.runId,
        matchupsKey,
        count: matchupSpecs.length,
        cachedCount,
    };
}
