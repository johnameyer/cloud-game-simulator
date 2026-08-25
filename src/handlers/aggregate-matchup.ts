import { getObjectJson, matchupSummaryKey, putArtifact } from '../s3-artifacts.js';
import { putMatchupSummary } from '../matchups-table.js';
import type {
    AggregateMatchupEvent,
    MapRunManifest,
    MapRunResultRecord,
    MatchupOutcomeCounts,
    MatchupSummary,
    RunGameResult,
} from '../types.js';

const RESULTS_BUCKET = process.env.RESULTS_BUCKET;
const MATCHUPS_TABLE = process.env.MATCHUPS_TABLE;

/**
 * Reads every game result written by the Distributed Map's ResultWriter
 * (a manifest.json plus one or more result files per status, rather than an
 * inline array in the state - see types.ts's DistributedMapResultWriterOutput).
 */
async function readGameResults(mapRunOutput: AggregateMatchupEvent['mapRunOutput']): Promise<RunGameResult[]> {
    const { Bucket: bucket, Key: manifestKey } = mapRunOutput.ResultWriterDetails;
    const manifest = await getObjectJson<MapRunManifest>(bucket, manifestKey);

    if (manifest.ResultFiles.FAILED.length > 0 || manifest.ResultFiles.PENDING.length > 0) {
        throw new Error(
            `Matchup fan-out did not fully succeed: ${manifest.ResultFiles.FAILED.length} failed, `
            + `${manifest.ResultFiles.PENDING.length} pending (manifest: s3://${bucket}/${manifestKey})`,
        );
    }

    const gameResults: RunGameResult[] = [];
    for (const file of manifest.ResultFiles.SUCCEEDED) {
        const records = await getObjectJson<MapRunResultRecord<string>[]>(bucket, file.Key);
        for (const record of records) {
            if (!record.Output) {
                throw new Error(`Result record for ${record.ExecutionArn} has no Output`);
            }
            gameResults.push(JSON.parse(record.Output) as RunGameResult);
        }
    }
    return gameResults;
}

/**
 * Reduces one matchup's fanned-out game results into win/tie/timeout rates,
 * writing the summary to both S3 (bulk record, alongside the per-game
 * artifacts) and DynamoDB (queryable row for a future UI).
 */
export async function handler(event: AggregateMatchupEvent): Promise<MatchupSummary> {
    if (!RESULTS_BUCKET) {
        throw new Error('RESULTS_BUCKET environment variable is not set');
    }
    if (!MATCHUPS_TABLE) {
        throw new Error('MATCHUPS_TABLE environment variable is not set');
    }

    const gameResults = await readGameResults(event.mapRunOutput);

    const outcomes: MatchupOutcomeCounts = {
        player1Wins: 0,
        player2Wins: 0,
        ties: 0,
        timeouts: 0,
    };

    for (const { result } of gameResults) {
        if (result.outcome === 'player1') {
            outcomes.player1Wins++;
        } else if (result.outcome === 'player2') {
            outcomes.player2Wins++;
        } else if (result.outcome === 'timeout') {
            outcomes.timeouts++;
        } else {
            outcomes.ties++;
        }
    }

    const totalGames = gameResults.length;
    const summaryKey = matchupSummaryKey(event.runId, event.matchupId);

    const summary: MatchupSummary = {
        runId: event.runId,
        matchupId: event.matchupId,
        deck0Id: event.deck0Id,
        deck1Id: event.deck1Id,
        totalGames,
        outcomes,
        player1WinRate: outcomes.player1Wins / totalGames,
        player2WinRate: outcomes.player2Wins / totalGames,
        tieRate: outcomes.ties / totalGames,
        timeoutRate: outcomes.timeouts / totalGames,
        summaryKey,
    };

    await putArtifact(RESULTS_BUCKET, summaryKey, JSON.stringify(summary, null, 2));
    await putMatchupSummary(MATCHUPS_TABLE, summary);

    return summary;
}
