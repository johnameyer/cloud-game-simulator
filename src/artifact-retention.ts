/**
 * Single source of truth for the S3 object tag key/values and prefixes the
 * bucket's lifecycle rules (infra/stack.ts) filter on. Runtime code
 * (s3-artifacts.ts, and the ResultWriter prefixes in infra/state-machine.ts
 * and infra/run-state-machine.ts) must use these same names - importing them
 * here instead of repeating string literals is what keeps the two in sync.
 */

export const RETENTION_TAG_KEY = 'retention';

/**
 * Retention tier for an artifact, matched by the bucket's lifecycle rules
 * via the RETENTION_TAG_KEY object tag. Raw per-game logs and traces are
 * cheap to regenerate and expire soonest; summaries are the queryable/
 * report-facing artifacts and are kept longer.
 */
export const ArtifactRetentionTag = {
    RAW_GAME_ARTIFACT: 'raw-game-artifact',
    SUMMARY: 'summary',
} as const;
export type ArtifactRetention = typeof ArtifactRetentionTag[keyof typeof ArtifactRetentionTag];

/**
 * S3 key prefixes the two Distributed Map ResultWriters (state-machine.ts's
 * matchup-level map, run-state-machine.ts's outer run-level map) write their
 * manifest.json + per-status result files under. Purely a debugging aid for
 * diagnosing fan-out failures, so the bucket's lifecycle rules expire these
 * fastest of all.
 */
export const DISTRIBUTED_MAP_RESULTS_PREFIX = 'distributed-map-results';
export const OUTER_DISTRIBUTED_MAP_RESULTS_PREFIX = 'outer-distributed-map-results';
