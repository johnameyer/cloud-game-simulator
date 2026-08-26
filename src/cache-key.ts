import { createHash } from 'crypto';
import type { DeckConfiguration, HandlerStrategy, ISMCTSOptions } from './types.js';

function sha256(input: string): string {
    return createHash('sha256').update(input)
        .digest('hex')
        .slice(0, 16);
}

/**
 * Content hash of a resolved deck (its actual card list, not just its id) -
 * so editing a deck's build in game-data invalidates only that deck's
 * cached matchups, without needing a manual cache-clear step.
 */
export function hashDeck(deck: DeckConfiguration): string {
    return sha256(JSON.stringify({ cardIds: deck.cardIds, energyTypes: deck.energyTypes }));
}

/**
 * Deterministic id for "this exact matchup configuration" - order-independent
 * on the deck pair (A-vs-B and B-vs-A are the same matchup), and folds in
 * engineVersion (see infra/engine-version.ts) so a code change to the
 * simulation engine/AI invalidates every cached result automatically instead
 * of silently serving stale data from before the change.
 */
export function buildMatchupCacheId(
    engineVersion: string,
    deck0: DeckConfiguration,
    deck1: DeckConfiguration,
    strategy: HandlerStrategy,
    ismctsOptions?: ISMCTSOptions,
): string {
    const [ a, b ] = [ hashDeck(deck0), hashDeck(deck1) ].sort();
    const optionsPart = ismctsOptions ? JSON.stringify(ismctsOptions) : '{}';
    return sha256(`${engineVersion}::${a}::${b}::${strategy}::${optionsPart}`);
}
