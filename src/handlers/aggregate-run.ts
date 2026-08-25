import { putArtifact, runSummaryKey } from '../s3-artifacts.js';
import { queryMatchupSummaries } from '../matchups-table.js';
import { putRunRecord } from '../runs-table.js';
import type { AggregateRunEvent, RunSummary } from '../types.js';

const RESULTS_BUCKET = process.env.RESULTS_BUCKET;
const MATCHUPS_TABLE = process.env.MATCHUPS_TABLE;
const RUNS_TABLE = process.env.RUNS_TABLE;

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
    };

    await putArtifact(RESULTS_BUCKET, summaryKey, JSON.stringify(runSummary, null, 2));
    await putRunRecord(RUNS_TABLE, {
        runId: event.runId,
        totalMatchups: matchupSummaries.length,
        summaryKey,
    });

    return runSummary;
}
