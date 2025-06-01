#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const { generateMasterlist, extractReferences } = require('../lib/masterlist');
const { writeJsonFile, directoryExists, fileExists, parseJsonFile, getFilesRecursively } = require('../lib/utils');
const { spawn } = require('child_process');

/**
 * Build GUI helper function
 */
async function buildGui(guiDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], {
      cwd: guiDir,
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`GUI build failed with exit code ${code}`));
      }
    });
  });
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
  if (fileExists(rootRouterConfig)) {
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
 * Enhanced build process for APIA
 * @param {Object} options - Build options
 * @param {string} options.srcDir - Source directory
 * @param {string} options.buildDir - Build output directory
 * @param {boolean} options.cleanBuild - Whether to clean build directory
 */
async function build(options = {}) {
  const {
    srcDir = path.join(process.cwd(), 'src'),
    buildDir = path.join(process.cwd(), '.apia'),
    cleanBuild = true
  } = options;

  console.log('🔨 Building APIA project...');
  console.log(`   Source: ${srcDir}`);
  console.log(`   Output: ${buildDir}`);

  try {
    // 1. Clean and create build directory
    if (cleanBuild) {
      console.log('🧹 Cleaning build directory...');
      fse.removeSync(buildDir);
    }
    fse.ensureDirSync(buildDir);

    // 2. Copy flows and subflows to .apia/flows
    console.log('📁 Copying flow definitions...');
    const flowsDir = path.join(srcDir, 'flows');
    const subflowsDir = path.join(srcDir, 'subflows');
    const buildFlowsDir = path.join(buildDir, 'flows');

    if (directoryExists(flowsDir)) {
      fse.copySync(flowsDir, buildFlowsDir);
      console.log(`   ✅ Copied flows from ${flowsDir}`);
    }

    if (directoryExists(subflowsDir)) {
      fse.copySync(subflowsDir, buildFlowsDir);
      console.log(`   ✅ Copied subflows from ${subflowsDir}`);
    }

    // 3. Generate masterlist.json
    console.log('📋 Generating masterlist...');
    const { masterlist } = validateAllReferences(srcDir);
    writeJsonFile(path.join(buildDir, 'masterlist.json'), masterlist);
    console.log(`   ✅ Generated masterlist with ${Object.keys(masterlist).length} definitions`);

    // 4. Copy and transform configuration files
    console.log('⚙️  Processing configuration files...');
    const configDir = path.join(srcDir, 'config');
    
    // Copy router config
    const routerConfigPath = path.join(configDir, 'router.config.json');
    if (fileExists(routerConfigPath)) {
      fse.copySync(routerConfigPath, path.join(buildDir, 'router.config.json'));
      console.log('   ✅ Copied router configuration');
    } else {
      console.log('   ⚠️  Router config not found, skipping...');
    }

    // Transform global config to .env format
    const globalConfigPath = path.join(configDir, 'global.config.json');
    if (fileExists(globalConfigPath)) {
      const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
      
      // Create .env file from global config
      let envContent = 'NODE_ENV=production\n\n';
      
      // Convert nested config to flat env vars
      Object.entries(globalConfig).forEach(([service, config]) => {
        if (typeof config === 'object') {
          Object.entries(config).forEach(([key, value]) => {
            const envKey = `${service.toUpperCase()}_${key.toUpperCase()}`;
            envContent += `${envKey}=${value}\n`;
          });
        } else {
          envContent += `${service.toUpperCase()}=${config}\n`;
        }
      });
      
      fs.writeFileSync(path.join(buildDir, '.env'), envContent);
      
      // Also copy the original global config for runtime use
      fse.copySync(globalConfigPath, path.join(buildDir, 'global.config.json'));
      console.log('   ✅ Processed global configuration');
    } else {
      // Create minimal .env
      fs.writeFileSync(path.join(buildDir, '.env'), 'NODE_ENV=production\n');
      console.log('   ⚠️  Global config not found, created minimal .env');
    }

    // 5. Copy connector implementations
    console.log('🔌 Copying connector implementations...');
    const srcConnectorsDir = path.join(srcDir, 'connectors');
    const libConnectorsDir = path.join(__dirname, '../lib/connectors');
    const buildConnectorsDir = path.join(buildDir, 'connectors');

    // Ensure connectors directory exists
    fse.ensureDirSync(buildConnectorsDir);

    // Copy from src/connectors if it exists
    if (directoryExists(srcConnectorsDir)) {
      fse.copySync(srcConnectorsDir, buildConnectorsDir);
      console.log('   ✅ Copied custom connectors from src/');
    }

    // Copy built-in connectors from lib/connectors if they exist
    if (directoryExists(libConnectorsDir)) {
      fse.copySync(libConnectorsDir, buildConnectorsDir);
      console.log('   ✅ Copied built-in connectors from lib/');
    }

    // 6. Copy runtime files
    console.log('🚀 Copying runtime files...');
    const srcIndexPath = path.join(srcDir, 'index.js');
    const srcRuntimePath = path.join(srcDir, 'runtime.js');

    if (fileExists(srcIndexPath)) {
      fse.copySync(srcIndexPath, path.join(buildDir, 'index.js'));
      console.log('   ✅ Copied main index.js');
    }

    if (fileExists(srcRuntimePath)) {
      fse.copySync(srcRuntimePath, path.join(buildDir, 'runtime.js'));
      console.log('   ✅ Copied runtime.js');
    }

    // 7. Build and copy GUI if available
    console.log('🎨 Processing GUI...');
    const guiDir = path.join(__dirname, '../gui');
    const guiBuildDir = path.join(buildDir, 'gui');
    
    if (directoryExists(guiDir)) {
      try {
        // Build GUI if package.json exists
        const guiPackageJson = path.join(guiDir, 'package.json');
        if (fileExists(guiPackageJson)) {
          console.log('   🔨 Building GUI...');
          await buildGui(guiDir);
          
          // Copy GUI build to output
          const guiNextDir = path.join(guiDir, '.next');
          if (directoryExists(guiNextDir)) {
            fse.copySync(guiNextDir, path.join(guiBuildDir, '.next'));
            fse.copySync(path.join(guiDir, 'public'), path.join(guiBuildDir, 'public'));
            fse.copySync(guiPackageJson, path.join(guiBuildDir, 'package.json'));
            console.log('   ✅ Copied GUI build files');
          }
        }
      } catch (error) {
        console.log('   ⚠️  GUI build failed, skipping...', error.message);
      }
    } else {
      console.log('   ⚠️  GUI directory not found, skipping...');
    }

    console.log('✅ Build completed successfully!');
    console.log(`   Output directory: ${buildDir}`);
    
    return {
      success: true,
      buildDir,
      masterlistEntries: Object.keys(masterlist).length
    };

  } catch (error) {
    console.error('❌ Build failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// CLI execution
if (require.main === module) {
  const srcDir = process.argv[2] || path.join(process.cwd(), 'src');
  const buildDir = process.argv[3] || path.join(process.cwd(), '.apia');
  
  build({
    srcDir: path.resolve(srcDir),
    buildDir: path.resolve(buildDir)
  }).then(result => {
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  });
}

module.exports = { build }; 