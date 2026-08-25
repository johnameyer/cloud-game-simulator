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

/**
 * Input event for the aggregate-matchup Lambda: every game result from one
 * matchup's fan-out, plus the matchup identity needed to write the summary.
 */
export type AggregateMatchupEvent = {
    runId: string;
    matchupId: string;
    deck0Id: string;
    deck1Id: string;
    gameResults: RunGameResult[];
};

export type MatchupOutcomeCounts = {
    player1Wins: number;
    player2Wins: number;
    ties: number;
    timeouts: number;
};

/**
 * Output of the aggregate-matchup Lambda, and the shape written to both the
 * S3 matchup-summary.json and the Matchups DynamoDB table.
 */
export type MatchupSummary = {
    runId: string;
    matchupId: string;
    deck0Id: string;
    deck1Id: string;
    totalGames: number;
    outcomes: MatchupOutcomeCounts;
    player1WinRate: number;
    player2WinRate: number;
    tieRate: number;
    timeoutRate: number;
    summaryKey: string;
};
