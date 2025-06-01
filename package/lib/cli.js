const { build } = require('./builder');
const APIAServer = require('./server');
const path = require('path');

/**
 * Available CLI commands
 */
const COMMANDS = {
  BUILD: 'build',
  RUN: 'run',
  GUI: 'gui',
  HELP: 'help'
};

/**
 * Display help information
 */
function showHelp() {
  console.log(`
APIA - API Engine for enterprise software
Copyright (c) 2025 Sanghaya Solutions

Usage:
  apia <command> [options]

Commands:
  build     Build the project and generate masterlist
  run       Build and start the APIA runtime server
  gui       Start the APIA Flow Designer GUI
  help      Show this help message

Examples:
  apia build
  apia run
  apia run --port 8080
  apia gui
  apia gui --port 3001
  apia help
`);
}

/**
 * Handle build command
 * @param {Array<string>} args - Command line arguments
 */
async function handleBuildCommand(args) {
  const srcDir = args[0] || path.join(process.cwd(), 'src');
  const buildDir = args[1] || path.join(process.cwd(), '.apia');
  
  const result = await build({
    srcDir: path.resolve(srcDir),
    buildDir: path.resolve(buildDir)
  });
  
  if (!result.success) {
    process.exit(1);
  }
}

/**
 * Handle run command
 * @param {Array<string>} args - Command line arguments
 */
async function handleRunCommand(args) {
  console.log('🚀 Starting APIA Runtime...');
  
  // Parse arguments
  const srcDir = process.cwd();
  const buildDir = path.join(srcDir, '.apia');
  const port = getPortFromArgs(args) || process.env.PORT || 3000;
  
  try {
    // Step 1: Build the project
    console.log('🔨 Building project...');
    const buildResult = await build({
      srcDir: path.join(srcDir, 'src'),
      buildDir: buildDir
    });
    
    if (!buildResult.success) {
      console.error('❌ Build failed, cannot start server');
      process.exit(1);
    }
    
    // Step 2: Start the server
    console.log('🌟 Starting server...');
    const server = new APIAServer(buildDir, port);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
    // Start the server
    await server.start();
    
  } catch (error) {
    console.error('❌ Failed to start APIA runtime:', error.message);
    process.exit(1);
  }
}

/**
 * Handle GUI command
 * @param {Array<string>} args - Command line arguments
 */
async function handleGuiCommand(args) {
  console.log('🎨 Starting APIA Flow Designer...');
  
  const port = getPortFromArgs(args) || 3001;
  const srcDir = process.cwd();
  
  try {
    // Import and start the GUI server
    const { startGuiServer } = require('./gui-server');
    await startGuiServer(srcDir, port);
    
  } catch (error) {
    console.error('❌ Failed to start APIA GUI:', error.message);
    process.exit(1);
  }
}

/**
 * Extract port from command line arguments
 * @param {Array<string>} args - Command line arguments
 * @returns {number|null} Port number or null
 */
function getPortFromArgs(args) {
  const portIndex = args.findIndex(arg => arg === '--port' || arg === '-p');
  if (portIndex !== -1 && args[portIndex + 1]) {
    return parseInt(args[portIndex + 1], 10);
  }
  return null;
}

/**
 * Parse and execute CLI commands
 * @param {Array<string>} argv - Process arguments
 */
async function runCLI(argv = process.argv) {
  const command = argv[2];
  const args = argv.slice(3);

  switch (command) {
    case COMMANDS.BUILD:
      await handleBuildCommand(args);
      break;
    
    case COMMANDS.RUN:
      await handleRunCommand(args);
      break;
    
    case COMMANDS.GUI:
      await handleGuiCommand(args);
      break;
    
    case COMMANDS.HELP:
    case '--help':
    case '-h':
      showHelp();
      break;
    
    case undefined:
      console.log('No command specified. Use "apia help" for usage information.');
      break;
    
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Use "apia help" for usage information.');
      process.exit(1);
  }
}

module.exports = {
  runCLI,
  showHelp,
  handleBuildCommand,
  handleRunCommand,
  handleGuiCommand,
  COMMANDS
}; 