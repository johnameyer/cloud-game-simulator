import { DECKS } from '@cards-ts/pokemon-pocket-tcg-data';
import type { AttachableEnergyType } from '@cards-ts/pocket-tcg';
import type { DeckConfiguration } from '@cards-ts/pocket-tcg-deck-simulations';

function expandDeckCards(deckCards: Record<string, number>): string[] {
    const expanded: string[] = [];
    for (const [ cardId, count ] of Object.entries(deckCards)) {
        for (let i = 0; i < count; i++) {
            expanded.push(cardId);
        }
    }
    return expanded;
}

/**
 * Resolve a deck id (a key in game-data's DECKS map) to the DeckConfiguration
 * shape SimulationRunner expects.
 */
export function resolveDeck(deckId: string): DeckConfiguration {
    const deck = DECKS[deckId];
    if (!deck) {
        const available = Object.keys(DECKS).sort();
        throw new Error(`Deck not found: "${deckId}". Available decks: ${available.join(', ')}`);
    }

    return {
        name: deckId,
        cardIds: expandDeckCards(deck.cards),
        energyTypes: (deck.energyTypes ?? []) as AttachableEnergyType[],
    };
}
