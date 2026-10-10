#!/usr/bin/env node

// Suppress deprecation warnings globally for a cleaner terminal output
process.noDeprecation = true;

import { main } from '../src/cli.js';
import { handleFatal } from '../src/lifecycle/crash.js';

// A failure this early has no coordinator yet, so handleFatal falls back to a
// best-effort terminal reset + exit 1. It does NOT clear the screen: the
// scrollback is the user's session (and the evidence of the bug being reported).
main().catch((err) => handleFatal(err, 'bootstrap'));