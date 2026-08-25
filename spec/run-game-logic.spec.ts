import { expect } from 'chai';
import { CARDS, DECKS } from '@cards-ts/pokemon-pocket-tcg-data';
import { SimulationRunner } from '@cards-ts/pocket-tcg-deck-simulations';
import { resolveDeck } from '../src/deck-resolver.js';

describe('run-game core logic (no AWS)', () => {
    it('runs a single real game and produces a GameResult with a log', async function() {
        this.timeout(30000);

        const [ deck0Id, deck1Id ] = Object.keys(DECKS);
        const runner = new SimulationRunner(CARDS);

        const { result, log } = await runner.runSingleGame(
            resolveDeck(deck0Id),
            resolveDeck(deck1Id),
            'default',
            undefined,
            1,
        );

        expect(result.outcome).to.be.oneOf([ 'player1', 'player2', 'tie', 'timeout' ]);
        expect(log.length).to.be.greaterThan(0);
    });
});
