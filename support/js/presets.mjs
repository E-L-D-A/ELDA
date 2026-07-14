// Write the shipped oxlint preset files from the plugin's own `configs`.
// oxlint's `extends` is file-path based and cannot read a plugin's exported configs, so each grade also ships as a JSON file - and a JSON file hand-copied from the source drifts, silently, in the direction of a rule the presets never turn on.
// Run `npm run presets` after adding or renaming a rule, and commit the result.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import plugin from './index.js';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = 'https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json';

for (const [grade, config] of Object.entries(plugin.configs)) {
  const file = join(here, `${grade}.json`);
  const body = {
    $schema: SCHEMA,
    jsPlugins: ['@elda/oxlint-plugin'],
    rules: config.rules,
  };
  writeFileSync(file, JSON.stringify(body, null, 2) + '\n');
  console.log(`${grade}.json: ${Object.keys(config.rules).length} rules`);
}
