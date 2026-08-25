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
    /**
     * Template ids of every card played (or evolved into) by either side
     * during this game, deduped. Flat/unattributed to a specific deck -
     * aggregate-matchup intersects this against each deck's own card pool
     * to figure out which deck each played card belongs to (see its
     * card-usage aggregation for why that's good enough despite not
     * tracking player position per card).
     */
    playedCardTemplateIds: string[];
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
    /**
     * Card template ids from each deck's own list that never appeared in
     * playedCardTemplateIds across any of this matchup's games. Scoped to
     * one matchup only - aggregate-run intersects these across every
     * matchup a deck appeared in to get the run-wide "never played" set
     * (a card only counts once it was never played against ANY opponent).
     */
    deck0NeverPlayedCardIds: string[];
    deck1NeverPlayedCardIds: string[];
};

/**
 * Input event for the generate-matchups Lambda: either an explicit list of
 * deck pairs, or a flat deck id list to expand into every pairwise matchup.
 */
export type GenerateMatchupsEvent = {
    runId: string;
    numGames: number;
    strategy?: HandlerStrategy;
    matchups?: { deck0Id: string; deck1Id: string }[];
    deckIds?: string[];
};

/**
 * One item in the matchups.json array the outer Distributed Map iterates
 * over - already shaped to match the matchup state machine's input.
 */
export type MatchupSpec = {
    matchupId: string;
    deck0Id: string;
    deck1Id: string;
    strategy: HandlerStrategy;
    gameNumbers: number[];
};

export type GenerateMatchupsResult = {
    runId: string;
    matchupsKey: string;
    count: number;
};

export type AggregateRunEvent = {
    runId: string;
};

/**
 * A card the AI never chose to play with a given deck across every matchup
 * that deck appeared in this run - the bug-hunting signal: cards that show
 * up here reliably, across enough games, are candidates for AI/strategy
 * bugs (never recognized as playable) rather than just bad luck on draws.
 */
export type NeverPlayedCard = {
    templateId: string;
    name?: string;
};

export type DeckCardUsage = {
    deckId: string;
    /** Total games this deck played across every matchup in the run. */
    totalGames: number;
    /** How many distinct matchups (opponents) this deck was tested against. */
    matchupCount: number;
    neverPlayedCards: NeverPlayedCard[];
};

export type RunSummary = {
    runId: string;
    totalMatchups: number;
    summaryKey: string;
    matchupSummaries: MatchupSummary[];
    deckCardUsage: DeckCardUsage[];
};
