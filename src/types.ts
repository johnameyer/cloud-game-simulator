import type { HandlerStrategy, ISMCTSOptions, GameResult } from '@cards-ts/pocket-tcg-deck-simulations';

export type { HandlerStrategy, ISMCTSOptions, GameResult };

/**
 * Input event for the run-game Lambda: one game between two decks.
 */
export type RunGameEvent = {
    runId: string;
    matchupId: string;
    gameNumber: number;
    deck0Id: string;
    deck1Id: string;
    strategy?: HandlerStrategy;
    ismctsOptions?: ISMCTSOptions;
};

/**
 * Output of the run-game Lambda: the compact game result kept in the Step
 * Functions payload, plus S3 keys pointing at the bulkier log/trace
 * artifacts written alongside it.
 */
export type RunGameResult = {
    runId: string;
    matchupId: string;
    gameNumber: number;
    result: GameResult;
    logKey: string;
    traceKey?: string;
};
