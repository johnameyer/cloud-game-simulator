import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Packages whose built output determines simulation behavior, as
 * [package name, name of the package it is resolved from]. A null parent
 * means "resolve from this stack's own dependencies"; otherwise the package
 * is a transitive dependency, resolved from the named package's install
 * location - the same lookup Node itself would do when that package imports it.
 */
const ENGINE_PACKAGES: [ string, string | null ][] = [
    [ '@cards-ts/pocket-tcg', null ],
    [ '@cards-ts/ismcts-ai', '@cards-ts/pocket-tcg-deck-simulations' ],
    [ '@cards-ts/pocket-tcg-deck-simulations', null ],
    [ '@cards-ts/pokemon-pocket-tcg-data', null ],
];

/**
 * Finds an installed package's directory the way Node resolution does:
 * walk up from `startDir` looking for node_modules/<name>, then follow
 * symlinks to the real location. Works for both local links (file:/link:)
 * and registry/git installs, so it does not assume any sibling-checkout layout.
 */
function resolvePackageDir(name: string, startDir: string): string {
    let dir = startDir;
    for (;;) {
        const candidate = join(dir, 'node_modules', name);
        if (existsSync(join(candidate, 'package.json'))) {
            return realpathSync(candidate);
        }
        const parent = dirname(dir);
        if (parent === dir) {
            throw new Error(`Cannot resolve "${name}" from ${startDir}; run pnpm install first`);
        }
        dir = parent;
    }
}

/**
 * Recursively hashes every file under a package's dist/ directory - the actual
 * compiled output that gets bundled into the Lambdas, not its source or git
 * state. This deliberately ignores everything else in the package (logs,
 * scratch scripts, unrelated uncommitted files) that doesn't affect
 * simulation behavior, and only changes when a rebuild actually produces
 * different output.
 */
function hashDistDir(packageDir: string): string {
    const distDir = join(packageDir, 'dist');
    const hash = createHash('sha256');

    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir).sort()) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                walk(fullPath);
            } else {
                hash.update(entry);
                hash.update(readFileSync(fullPath));
            }
        }
    };

    walk(distDir);
    return hash.digest('hex');
}

/**
 * A single value that changes whenever any of the simulation-engine repos'
 * built output (game rules, AI strategy, the shared runner, or card/deck
 * data) changes, folded into every cached matchup result's id (see
 * src/cache-key.ts) so a rebuilt engine invalidates stale cache entries
 * automatically instead of requiring someone to remember to clear a cache.
 * Requires each package to have been built (`pnpm build`) before synth - an
 * unbuilt/missing dist/ throws rather than silently hashing nothing.
 */
export function computeEngineVersion(): string {
    const stackDir = dirname(dirname(fileURLToPath(import.meta.url)));
    const dirs = new Map<string, string>();
    const parts = ENGINE_PACKAGES.map(([ name, parent ]) => {
        const startDir = parent ? dirs.get(parent) ?? resolvePackageDir(parent, stackDir) : stackDir;
        const packageDir = resolvePackageDir(name, startDir);
        dirs.set(name, packageDir);
        return hashDistDir(packageDir);
    });
    return createHash('sha256').update(parts.join('::'))
        .digest('hex')
        .slice(0, 16);
}
