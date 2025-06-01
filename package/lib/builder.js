const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const { generateMasterlist, extractReferences } = require('./masterlist');
const { writeJsonFile, directoryExists, parseJsonFile, getFilesRecursively } = require('./utils');

/**
 * Build configuration options
 * @typedef {Object} BuildOptions
 * @property {string} srcDir - Source directory path
 * @property {string} buildDir - Build output directory path
 * @property {boolean} cleanBuild - Whether to clean build directory before building
 */

/**
 * Copy source files to build directory
 * @param {string} srcDir - Source directory
 * @param {string} buildDir - Build directory
 */
function copySourceFiles(srcDir, buildDir) {
  const flowsDir = path.join(srcDir, 'flows');
  const subflowsDir = path.join(srcDir, 'subflows');
  const configDir = path.join(srcDir, 'config');
  
  // Copy /src/flows -> .apia/flows
  if (directoryExists(flowsDir)) {
    fse.copySync(flowsDir, path.join(buildDir, 'flows'));
  }

  // Copy /src/subflows -> .apia/flows (flattened or merged as needed)
  if (directoryExists(subflowsDir)) {
    fse.copySync(subflowsDir, path.join(buildDir, 'flows'));
  }

  // Copy router config
  const routerConfigPath = path.join(configDir, 'router.config.json');
  if (fs.existsSync(routerConfigPath)) {
    fse.copySync(routerConfigPath, path.join(buildDir, 'router.config.json'));
    console.log('✅ Router configuration copied successfully');
  } else {
    console.log('⚠️  Router config not found, skipping...');
  }

  // Copy global config
  const globalConfigPath = path.join(configDir, 'global.config.json');
  if (fs.existsSync(globalConfigPath)) {
    fse.copySync(globalConfigPath, path.join(buildDir, 'global.config.json'));
    console.log('✅ Global configuration copied successfully');
  } else {
    console.log('⚠️  Global config not found, skipping...');
  }

  // Copy connector implementations
  console.log('🔌 Copying connector implementations...');
  const srcConnectorsDir = path.join(srcDir, 'connectors');
  const libConnectorsDir = path.join(__dirname, 'connectors');
  const buildConnectorsDir = path.join(buildDir, 'connectors');

  // Ensure connectors directory exists
  fse.ensureDirSync(buildConnectorsDir);

  // Copy from src/connectors if it exists (custom connectors)
  if (directoryExists(srcConnectorsDir)) {
    fse.copySync(srcConnectorsDir, buildConnectorsDir);
    console.log('✅ Copied custom connectors from src/connectors');
  }

  // Copy built-in connectors from lib/connectors
  if (directoryExists(libConnectorsDir)) {
    fse.copySync(libConnectorsDir, buildConnectorsDir);
    console.log('✅ Copied built-in connectors from lib/connectors');
  } else {
    console.log('⚠️  Built-in connectors directory not found');
  }
}

/**
 * Generate build artifacts
 * @param {string} srcDir - Source directory
 * @param {string} buildDir - Build directory
 * @returns {Object} Build statistics
 */
function generateBuildArtifacts(srcDir, buildDir) {
  const stats = {};
  
  // Generate masterlist.json with validation
  const { masterlist } = validateAllReferences(srcDir);
  writeJsonFile(path.join(buildDir, 'masterlist.json'), masterlist);
  stats.masterlistEntries = Object.keys(masterlist).length;

  // Generate .env file
  fs.writeFileSync(
    path.join(buildDir, '.env'),
    'NODE_ENV=production\n'
  );

  return stats;
}

/**
 * Validate all references including router config
 * @param {string} srcDir - Source directory path
 * @returns {Object} Validation result with masterlist and references
 */
function validateAllReferences(srcDir) {
  console.log('🔍 Validating all references...');
  
  // Generate masterlist (validates flow/subflow references)
  const masterlist = generateMasterlist(srcDir);
  const allJsonFiles = new Set(Object.keys(masterlist));
  const additionalReferences = new Set();
  
  // Check router configuration files
  const configDir = path.join(srcDir, 'config');
  
  if (directoryExists(configDir)) {
    const configFiles = getFilesRecursively(configDir, '.json');
    
    for (const file of configFiles) {
      console.log(`   - Validating config file: ${file.relativePath}`);
      const jsonContent = parseJsonFile(file.path);
      const references = extractReferences(jsonContent);
      references.forEach(ref => additionalReferences.add(ref));
    }
  }
  
  // Also check for router.config.json in the root src directory
  const rootRouterConfig = path.join(srcDir, 'router.config.json');
  if (fs.existsSync(rootRouterConfig)) {
    console.log(`   - Validating root router config: router.config.json`);
    const jsonContent = parseJsonFile(rootRouterConfig);
    const references = extractReferences(jsonContent);
    references.forEach(ref => additionalReferences.add(ref));
  }
  
  // Validate additional references from config files
  const missingConfigRefs = [];
  additionalReferences.forEach(referenceName => {
    if (!allJsonFiles.has(referenceName)) {
      missingConfigRefs.push(referenceName);
    }
  });
  
  if (missingConfigRefs.length > 0) {
    throw new Error(`Router config references missing JSON files: ${missingConfigRefs.map(f => `"${f}.json"`).join(', ')}`);
  }
  
  console.log(`   ✅ All references validated (${additionalReferences.size} router config references)`);
  
  return { masterlist, routerReferences: additionalReferences };
}

/**
 * Main build function
 * @param {BuildOptions} options - Build configuration options
 * @returns {Object} Build result with statistics
 */
function build(options = {}) {
  const {
    srcDir = path.join(process.cwd(), 'src'),
    buildDir = path.join(process.cwd(), '.apia'),
    cleanBuild = true
  } = options;

  console.log('Building project...');

  try {
    // Clean and recreate build directory
    if (cleanBuild) {
      fse.removeSync(buildDir);
    }
    fse.ensureDirSync(buildDir);

    // Copy source files
    copySourceFiles(srcDir, buildDir);

    // Generate build artifacts
    const stats = generateBuildArtifacts(srcDir, buildDir);

    console.log('Build complete.');
    console.log(`Generated masterlist with ${stats.masterlistEntries} JSON definitions.`);

    return {
      success: true,
      stats,
      buildDir
    };
  } catch (error) {
    console.error('Build failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  build,
  copySourceFiles,
  generateBuildArtifacts,
  validateAllReferences
}; 