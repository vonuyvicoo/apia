#!/usr/bin/env node

const { runCLI } = require('./lib/cli');

// Run the CLI with process arguments (async)
runCLI().catch(error => {
  console.error('❌ CLI error:', error.message);
  process.exit(1);
});
