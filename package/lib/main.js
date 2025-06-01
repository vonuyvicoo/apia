#!/usr/bin/env node

/**
 * APIA Runtime Main Entry Point
 * Starts the APIA server with configuration from environment variables
 */

const path = require('path');
const APIAServer = require('./server');

// Configuration from environment variables
const PORT = process.env.PORT || 3000;
const BUILD_DIR = process.env.BUILD_DIR || './build';
const NODE_ENV = process.env.NODE_ENV || 'development';

async function main() {
  console.log('🚀 Starting APIA Runtime Engine...');
  console.log(`📁 Build directory: ${path.resolve(BUILD_DIR)}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`🔌 Port: ${PORT}`);
  console.log('');
  
  try {
    // Create and start the server
    const server = new APIAServer(BUILD_DIR, PORT);
    
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
    console.error('❌ Failed to start APIA Runtime Engine:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main();
}

module.exports = { main, APIAServer }; 