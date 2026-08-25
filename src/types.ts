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
 * Reference to a Distributed Map's ResultWriter output: a manifest in S3
 * listing where each child iteration's result was written, rather than the
 * results being inlined in the state (which would blow past Step Functions'
 * 256KB payload limit once game/matchup counts grow).
 */
export type DistributedMapResultWriterOutput = {
    ResultWriterDetails: {
        Bucket: string;
        Key: string;
    };
};

/**
 * Shape of the manifest.json a Distributed Map's ResultWriter writes to S3.
 */
export type MapRunManifest = {
    DestinationBucket: string;
    MapRunArn: string;
    ResultFiles: {
        SUCCEEDED: MapRunResultFileRef[];
        FAILED: MapRunResultFileRef[];
        PENDING: MapRunResultFileRef[];
    };
};

export type MapRunResultFileRef = {
    Key: string;
    Size: number;
    ItemCount: number;
};

/**
 * One entry in a SUCCEEDED/FAILED result file the manifest points to.
 */
export type MapRunResultRecord<T> = {
    ExecutionArn: string;
    Name: string;
    Status: 'SUCCEEDED' | 'FAILED';
    StartDate: string;
    StopDate: string;
    Output?: T;
    Error?: string;
    Cause?: string;
};

/**
 * Input event for the aggregate-matchup Lambda: a pointer to the Distributed
 * Map's result manifest for one matchup's fan-out, plus the matchup identity
 * needed to write the summary.
 */
export type AggregateMatchupEvent = {
    runId: string;
    matchupId: string;
    deck0Id: string;
    deck1Id: string;
    mapRunOutput: DistributedMapResultWriterOutput;
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
