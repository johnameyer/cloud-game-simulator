import { CARDS } from '@cards-ts/pokemon-pocket-tcg-data';
import { SimulationRunner, collectPlayedCardTemplateIds } from '@cards-ts/pocket-tcg-deck-simulations';
import { resolveDeck } from '../deck-resolver.js';
import { ArtifactRetentionTag, gameLogKey, gameTraceKey, putArtifact } from '../s3-artifacts.js';
import type { RunGameEvent, RunGameResult } from '../types.js';

const RESULTS_BUCKET = process.env.RESULTS_BUCKET;

const runner = new SimulationRunner(CARDS);

/**
 * Runs a single game between two decks and persists its log/trace to S3.
 * One Lambda invocation = one game (see the README's fan-out design).
 */
export async function handler(event: RunGameEvent): Promise<RunGameResult> {
    if (!RESULTS_BUCKET) {
        throw new Error('RESULTS_BUCKET environment variable is not set');
    }

    const deck0 = resolveDeck(event.deck0Id);
    const deck1 = resolveDeck(event.deck1Id);

    const { result, log, traceEvents } = await runner.runSingleGame(
        deck0,
        deck1,
        event.strategy ?? 'default',
        event.ismctsOptions,
        event.gameNumber,
    );

    const logKey = gameLogKey(event.runId, event.matchupId, event.gameNumber);
    await putArtifact(RESULTS_BUCKET, logKey, log, ArtifactRetentionTag.RAW_GAME_ARTIFACT);

    let traceKey: string | undefined;
    if (traceEvents.length > 0) {
        traceKey = gameTraceKey(event.runId, event.matchupId, event.gameNumber);
        await putArtifact(
            RESULTS_BUCKET,
            traceKey,
            traceEvents.map(e => JSON.stringify(e)).join('\n'),
            ArtifactRetentionTag.RAW_GAME_ARTIFACT,
        );
    }

    return {
        runId: event.runId,
        matchupId: event.matchupId,
        gameNumber: event.gameNumber,
        result,
        logKey,
        ...(traceKey ? { traceKey } : {}),
        playedCardTemplateIds: [ ...collectPlayedCardTemplateIds(traceEvents, name => {
            try {
                return CARDS.getCreatureByName(name).templateId;
            } catch {
                return undefined;
            }
        }) ],
    };
}
