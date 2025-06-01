// Main library exports
const { build, copySourceFiles, generateBuildArtifacts } = require('./builder');
const { generateMasterlist, extractReferences } = require('./masterlist');
const { runCLI, showHelp, handleBuildCommand, COMMANDS } = require('./cli');
const utils = require('./utils');

module.exports = {
  // Builder functions
  build,
  copySourceFiles,
  generateBuildArtifacts,
  
  // Masterlist functions
  generateMasterlist,
  extractReferences,
  
  // CLI functions
  runCLI,
  showHelp,
  handleBuildCommand,
  COMMANDS,
  
  // Utilities
  utils
}; 