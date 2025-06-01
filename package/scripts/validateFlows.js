#!/usr/bin/env node

const path = require('path');
const { generateMasterlist, extractReferences } = require('../lib/masterlist');
const { directoryExists, parseJsonFile, getFilesRecursively } = require('../lib/utils');

/**
 * Validate flow definitions in the source directory
 * @param {string} srcDir - Source directory path
 * @returns {boolean} - True if validation passes
 */
function validateFlows(srcDir = path.join(process.cwd(), 'src')) {
  console.log('Validating flow definitions...');
  
  try {
    // Check if source directories exist
    const flowsDir = path.join(srcDir, 'flows');
    const subflowsDir = path.join(srcDir, 'subflows');
    
    if (!directoryExists(flowsDir) && !directoryExists(subflowsDir)) {
      throw new Error('Neither flows nor subflows directories found in src/');
    }
    
    // Generate masterlist (this will validate uniqueness and references)
    const masterlist = generateMasterlist(srcDir);
    
    // Additional validation: Check router configuration files
    const configDir = path.join(srcDir, 'config');
    const allJsonFiles = new Set(Object.keys(masterlist));
    const additionalReferences = new Set();
    
    if (directoryExists(configDir)) {
      const configFiles = getFilesRecursively(configDir, '.json');
      
      for (const file of configFiles) {
        console.log(`   - Checking config file: ${file.relativePath}`);
        const jsonContent = parseJsonFile(file.path);
        const references = extractReferences(jsonContent);
        references.forEach(ref => additionalReferences.add(ref));
      }
    }
    
    // Also check for router.config.json in the root src directory
    const rootRouterConfig = path.join(srcDir, 'router.config.json');
    if (require('fs').existsSync(rootRouterConfig)) {
      console.log(`   - Checking root router config: router.config.json`);
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
    
    // Additional validations
    const flowCount = Object.keys(masterlist).length;
    if (flowCount === 0) {
      throw new Error('No flow definitions found');
    }
    
    console.log(`✅ Validation passed!`);
    console.log(`   - Found ${flowCount} unique flow definitions`);
    console.log(`   - All references validated`);
    if (additionalReferences.size > 0) {
      console.log(`   - Validated ${additionalReferences.size} router config references`);
    }
    console.log(`   - No duplicate flow names detected`);
    
    return true;
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    return false;
  }
}

// CLI execution
if (require.main === module) {
  const srcDir = process.argv[2] || path.join(process.cwd(), 'src');
  const isValid = validateFlows(srcDir);
  process.exit(isValid ? 0 : 1);
}

module.exports = { validateFlows }; 