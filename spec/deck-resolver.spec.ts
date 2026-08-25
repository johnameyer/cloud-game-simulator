import { expect } from 'chai';
import { DECKS } from '@cards-ts/pokemon-pocket-tcg-data';
import { resolveDeck } from '../src/deck-resolver.js';

describe('resolveDeck', () => {
    it('resolves a real game-data deck id into a DeckConfiguration', () => {
        const [ deckId ] = Object.keys(DECKS);

        const config = resolveDeck(deckId);

        expect(config.name).to.equal(deckId);
        expect(config.cardIds.length).to.be.greaterThan(0);
        expect(config.energyTypes.length).to.be.greaterThan(0);
    });

    it('throws a helpful error for an unknown deck id', () => {
        expect(() => resolveDeck('not-a-real-deck')).to.throw(/Deck not found: "not-a-real-deck"/);
    });
});
