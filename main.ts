// Skyward Flight: the hand-in program (Node 22, standard library only).
// The game itself is plain static files under game/ — index.html and its ES
// modules, no library, no network request — and the screenshots in
// screenshots/ are real renders of it in a desktop browser. This program
// copies both folders beside this file into /output (or MAKEFUN_OUTPUT_DIR
// outside the grader) and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library.
//
// Run it:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The whole game, as it stands in the repository, plain files only.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

// The screenshots, first by name the cover. The gate refuses more than
// four, or one over 256 KiB, so the program refuses them here too instead
// of handing in an entry the scorer would refuse.
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (see the kit's gate.json): only
// text_max_bytes shapes the dossier's bytes; the rest refuse an entry the
// scorer would refuse (game/ over 993 files or 48 MiB, a path over 1000
// bytes, more than 4 screenshots or one over 256 KiB).
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
