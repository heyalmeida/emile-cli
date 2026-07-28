#!/usr/bin/env node

// Suppress deprecation warnings globally for a cleaner terminal output
process.noDeprecation = true;

import { main } from '../src/cli.js';

main().catch((err) => {
  console.clear();
  console.error('\nFatal error executing Emile CLI:', err);
  process.exit(1);
});
