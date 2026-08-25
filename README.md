<h1 align="center">cloud-game-simulator</h1>
<div align="center">

[![Github CI](https://img.shields.io/github/actions/workflow/status/johnameyer/cloud-game-simulator/ci.yml?logo=github)](https://github.com/johnameyer/cloud-game-simulator/actions)
![GitHub Last Commit](https://img.shields.io/github/last-commit/johnameyer/cloud-game-simulator?logo=github)
![Typescript](https://img.shields.io/github/languages/top/johnameyer/cloud-game-simulator?logo=typescript)
</div>

A Lambda function that plays one Pokemon Pocket TCG game between two decks and stores the game's log and trace in S3. It is built on [pocket-tcg](https://github.com/johnameyer/pocket-tcg) and [deck-simulations](https://github.com/johnameyer/pocket-tcg-deck-simulations), and is meant to be orchestrated by Step Functions so that many matchups, and many games per matchup, run in parallel instead of sequentially on one machine.

## How it works

- `run-game` plays one game (via `SimulationRunner.runSingleGame` from deck-simulations) and writes its log and trace to the S3 results bucket.

## Getting Started

### Prerequisites

- Node.js and [pnpm](https://pnpm.io)
- AWS credentials for the target account (set `AWS_PROFILE=<profile>` to use a named profile)
- The CDK environment bootstrapped once per account/region: `npx cdk bootstrap`

### Commands

```sh
pnpm install
pnpm build         # tsc
pnpm lint          # eslint --fix
pnpm test          # unit tests, no AWS required
pnpm synth         # cdk synth (validates the stack and bundles the Lambdas, no deploy)
pnpm deploy        # cdk deploy
pnpm diff          # cdk diff
```

### Invoking run-game manually

After `pnpm deploy`, invoke the deployed function directly to confirm end-to-end wiring:

```sh
aws lambda invoke \
  --function-name <RunGameFunction name from the deploy output> \
  --payload '{"runId":"manual-1","matchupId":"m1","gameNumber":1,"deck0Id":"<a real deck id from game-data DECKS>","deck1Id":"<another deck id>"}' \
  --cli-binary-format raw-in-base64-out \
  out.json
cat out.json
```

Confirm the returned `logKey` (and `traceKey`) exist in the results bucket, and that the
`result` matches the shape produced by `deck-simulations`'s CLI for the same deck pair.

## Gotchas

- The Lambda must be bundled as CJS (`bundling.format: OutputFormat.CJS` in `infra/stack.ts`), not ESM. ESM bundling produced two distinct copies of the `CardRepository` class across module instances and crashed at runtime ("CardRepository2 is not a constructor"). For the same reason, `pocket-tcg`, `deck-simulations` and `game-data` must all resolve to a single copy of `@cards-ts/pocket-tcg`; a mismatched version pin on one of them reintroduces the crash.

## Project layout

```
cloud-game-simulator/
├── bin/
│   └── lambda-simulator.ts  # CDK app entry point
├── infra/                   # CDK stack
│   └── stack.ts             # CDK stack: results bucket and Lambdas
├── src/                     # Lambda code and shared helpers
│   ├── handlers/            # Lambda handlers
│   │   └── run-game.ts      # Plays one game, writes log/trace to S3
│   ├── deck-resolver.ts     # Resolves a game-data deck id into a DeckConfiguration
│   ├── s3-artifacts.ts      # S3 key naming and put/get helpers
│   └── types.ts             # Lambda event/result shapes
└── spec/                    # Unit tests (run without AWS)
```

`run-game` calls `SimulationRunner.runSingleGame` from `deck-simulations` rather than reimplementing game execution. That method returns the game result plus its captured log and trace instead of writing to disk, so this package can persist them to S3 while `deck-simulations`'s own CLI keeps writing to the local filesystem. Both paths run identical simulation logic. Deck data comes from the `game-data` package via `resolveDeck(deckId)`, which looks up `DECKS[deckId]` and expands it into the `DeckConfiguration` the runner expects.

## License

MIT, see [LICENSE](./LICENSE).

## Authors

* **John Meyer** - [johnameyer](https://github.com/johnameyer)
