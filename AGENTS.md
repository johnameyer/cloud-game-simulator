# cloud-game-simulator

Fans out Pokemon Pocket TCG deck simulations across AWS Lambda, orchestrated by Step Functions.
One `run-game` Lambda invocation runs one game; Distributed Map states fan games out per matchup
and matchups out per run. See `README.md` for the architecture, gotchas, and retention/caching design.

## Commands

```bash
pnpm install
pnpm build          # tsc
pnpm lint           # eslint --fix (CI runs `pnpm lint --no-fix`)
pnpm test           # unit tests, no AWS required
pnpm synth          # cdk synth: validates the stack and bundles the Lambdas, no deploy
pnpm deploy         # cdk deploy (set AWS_PROFILE / credentials first)
pnpm diff           # cdk diff
```

## Structure

```
bin/lambda-simulator.ts   CDK app entry point
infra/                    CDK stack, state machines, engine-version hashing, Lambda retry config
src/handlers/             run-game, generate-matchups, aggregate-matchup, aggregate-run
src/                      types, deck-resolver, cache-key, artifact-retention, S3/DynamoDB helpers
spec/                     unit tests (run without AWS)
```

## Conventions

- ESM TypeScript, 4-space indent, config shared with the sibling repos (`eslint.config.mjs`, `.mocharc.json`).
- AWS access is isolated in `src/s3-artifacts.ts` and the three `src/*-table.ts` modules; keep new
  AWS calls behind similar small modules so a provider swap stays cheap.
- Lambdas must be bundled as CJS (`bundling.format: OutputFormat.CJS` in `infra/stack.ts`); ESM bundling
  duplicates the `CardRepository` class and crashes at runtime.
- `pocket-tcg`, `deck-simulations`, and `game-data` must all resolve to the same `pocket-tcg` source.
- `ENGINE_VERSION` is a hash of the built `dist/` of the engine packages (`infra/engine-version.ts`);
  rebuild them before `synth`/`deploy` or cached matchup results may be reused incorrectly.
