import { matchupsListKey, putArtifact } from '../s3-artifacts.js';
import type { GenerateMatchupsEvent, GenerateMatchupsResult, MatchupSpec } from '../types.js';

const RESULTS_BUCKET = process.env.RESULTS_BUCKET;

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
 * matchups.json array the outer Distributed Map reads from S3.
 */
export async function handler(event: GenerateMatchupsEvent): Promise<GenerateMatchupsResult> {
    if (!RESULTS_BUCKET) {
        throw new Error('RESULTS_BUCKET environment variable is not set');
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

    const matchupSpecs: MatchupSpec[] = pairs.map(({ deck0Id, deck1Id }, index) => ({
        matchupId: `${index}-${deck0Id}-vs-${deck1Id}`,
        deck0Id,
        deck1Id,
        strategy,
        gameNumbers,
    }));

    const matchupsKey = matchupsListKey(event.runId);
    await putArtifact(RESULTS_BUCKET, matchupsKey, JSON.stringify(matchupSpecs));

    return {
        runId: event.runId,
        matchupsKey,
        count: matchupSpecs.length,
    };
}
