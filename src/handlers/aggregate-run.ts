import { CARDS } from '@cards-ts/pokemon-pocket-tcg-data';
import { ArtifactRetentionTag, putArtifact, runSummaryKey } from '../s3-artifacts.js';
import { queryMatchupSummaries } from '../matchups-table.js';
import { putRunRecord } from '../runs-table.js';
import type { AggregateRunEvent, DeckCardUsage, MatchupSummary, NeverPlayedCard, RunSummary } from '../types.js';

const RESULTS_BUCKET = process.env.RESULTS_BUCKET;
const MATCHUPS_TABLE = process.env.MATCHUPS_TABLE;
const RUNS_TABLE = process.env.RUNS_TABLE;

function resolveCardName(templateId: string): string | undefined {
    try {
        return CARDS.getCard(templateId).data.name;
    } catch {
        return undefined;
    }
}

function intersect(sets: Set<string>[]): Set<string> {
    if (sets.length === 0) {
        return new Set();
    }
    return sets.reduce((acc, set) => new Set([ ...acc ].filter(id => set.has(id))));
}

/**
 * Groups per-matchup never-played card ids by deck (a deck can appear as
 * deck0 in one matchup and deck1 in another) and intersects them - a card
 * only counts as "the AI never determines to use" for a deck once it was
 * never played against ANY of the opponents it faced this run, not just one.
 */
function computeDeckCardUsage(matchupSummaries: MatchupSummary[]): DeckCardUsage[] {
    const byDeck = new Map<string, { totalGames: number; matchupCount: number; neverPlayedSets: Set<string>[] }>();

    const record = (deckId: string, totalGames: number, neverPlayedCardIds: string[]): void => {
        const entry = byDeck.get(deckId) ?? { totalGames: 0, matchupCount: 0, neverPlayedSets: [] };
        entry.totalGames += totalGames;
        entry.matchupCount += 1;
        entry.neverPlayedSets.push(new Set(neverPlayedCardIds));
        byDeck.set(deckId, entry);
    };

    for (const summary of matchupSummaries) {
        record(summary.deck0Id, summary.totalGames, summary.deck0NeverPlayedCardIds);
        record(summary.deck1Id, summary.totalGames, summary.deck1NeverPlayedCardIds);
    }

    return [ ...byDeck.entries() ]
        .map(([ deckId, entry ]): DeckCardUsage => {
            const neverPlayedCards: NeverPlayedCard[] = [ ...intersect(entry.neverPlayedSets) ]
                .map(templateId => ({ templateId, name: resolveCardName(templateId) }));
            return {
                deckId,
                totalGames: entry.totalGames,
                matchupCount: entry.matchupCount,
                neverPlayedCards,
            };
        })
        .sort((a, b) => a.deckId.localeCompare(b.deckId));
}

/**
 * Reduces every matchup summary for a run (queried from the Matchups table
 * by runId) into a single run-level summary, written to both S3 and the
 * Runs DynamoDB table.
 */
export async function handler(event: AggregateRunEvent): Promise<RunSummary> {
    if (!RESULTS_BUCKET) {
        throw new Error('RESULTS_BUCKET environment variable is not set');
    }
    if (!MATCHUPS_TABLE) {
        throw new Error('MATCHUPS_TABLE environment variable is not set');
    }
    if (!RUNS_TABLE) {
        throw new Error('RUNS_TABLE environment variable is not set');
    }

    const matchupSummaries = await queryMatchupSummaries(MATCHUPS_TABLE, event.runId);
    const summaryKey = runSummaryKey(event.runId);

    const runSummary: RunSummary = {
        runId: event.runId,
        totalMatchups: matchupSummaries.length,
        summaryKey,
        matchupSummaries,
        deckCardUsage: computeDeckCardUsage(matchupSummaries),
    };

    await putArtifact(RESULTS_BUCKET, summaryKey, JSON.stringify(runSummary, null, 2), ArtifactRetentionTag.SUMMARY);
    await putRunRecord(RUNS_TABLE, {
        runId: event.runId,
        totalMatchups: matchupSummaries.length,
        summaryKey,
    });

    return runSummary;
}
