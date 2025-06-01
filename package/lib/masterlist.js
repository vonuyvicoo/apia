const path = require('path');
const { getFilesRecursively, parseJsonFile, directoryExists } = require('./utils');

/**
 * Extract references from a JSON content object
 * @param {Object} jsonContent - Parsed JSON content
 * @returns {Set<string>} Set of referenced names
 */
function extractReferences(jsonContent) {
  const references = new Set();
  
  // Helper function to recursively extract references from any object
  function extractFromObject(obj, isRootObject = false) {
    if (!obj || typeof obj !== 'object') return;
    
    // Check for various reference patterns, but exclude inline connector/decision definitions
    const isInlineConnector = obj.type === 'connector' || obj.type === 'decision';
    
    // Only add subflow-reference-name if it's not an inline connector/decision
    if (obj['subflow-reference-name'] && typeof obj['subflow-reference-name'] === 'string' && !isInlineConnector) {
      references.add(obj['subflow-reference-name']);
    }
    
    // Only add flow-reference-name if it's not an inline connector/decision and not the root object's own name
    if (obj['flow-reference-name'] && typeof obj['flow-reference-name'] === 'string' && !isInlineConnector && !isRootObject) {
      references.add(obj['flow-reference-name']);
    }
    
    // Always add flowReference as these are typically references to other flows
    if (obj.flowReference && typeof obj.flowReference === 'string') {
      references.add(obj.flowReference);
    }
    
    // Recursively check nested objects and arrays
    Object.values(obj).forEach(value => {
      if (Array.isArray(value)) {
        value.forEach(item => extractFromObject(item, false));
      } else if (typeof value === 'object' && value !== null) {
        extractFromObject(value, false);
      }
    });
  }
  
  // Check for subflow references
  if (jsonContent.subflows) {
    if (typeof jsonContent.subflows === 'object' && !Array.isArray(jsonContent.subflows)) {
      // Handle object format: { "subflow-reference-name": "reference-name" }
      Object.values(jsonContent.subflows).forEach(referenceName => {
        if (typeof referenceName === 'string') {
          references.add(referenceName);
        }
      });
    } else if (Array.isArray(jsonContent.subflows)) {
      // Handle array format - check each subflow item
      jsonContent.subflows.forEach(subflow => {
        if (typeof subflow === 'string') {
          // Direct string reference to another subflow
          references.add(subflow);
        } else if (subflow && typeof subflow === 'object') {
          // Object subflow - could be inline connector or subflow reference
          if (subflow.type === 'connector' || subflow.type === 'decision') {
            // This is an inline connector/decision definition, don't extract its flow-reference-name
            // But still check for nested references in its config or other properties
            Object.entries(subflow).forEach(([key, value]) => {
              if (key !== 'flow-reference-name' && typeof value === 'object' && value !== null) {
                extractFromObject(value, false);
              }
            });
          } else {
            // This is a subflow reference, extract all references from it
            extractFromObject(subflow, false);
          }
        }
      });
    }
  }
  
  // Check for flow references (if they exist in the structure)
  if (jsonContent.flows) {
    if (typeof jsonContent.flows === 'object' && !Array.isArray(jsonContent.flows)) {
      Object.values(jsonContent.flows).forEach(referenceName => {
        if (typeof referenceName === 'string') {
          references.add(referenceName);
        }
      });
    } else if (Array.isArray(jsonContent.flows)) {
      jsonContent.flows.forEach(flow => {
        if (typeof flow === 'string') {
          references.add(flow);
        } else if (flow && typeof flow === 'object') {
          extractFromObject(flow, false);
        }
      });
    }
  }
  
  // Check for any other flowReference properties in the root object (excluding the root's own flow-reference-name)
  extractFromObject(jsonContent, true);
  
  return references;
}

/**
 * Generate masterlist from flows and subflows directories
 * @param {string} srcDir - Source directory path
 * @returns {Object} Masterlist object mapping names to file paths
 * @throws {Error} If validation fails
 */
function generateMasterlist(srcDir) {
  const masterlist = {};
  const flowsDir = path.join(srcDir, 'flows');
  const subflowsDir = path.join(srcDir, 'subflows');
  const allJsonFiles = new Set(); // Track all available JSON files
  const referencedFiles = new Set(); // Track all referenced files
  
  // Process flows directory
  if (directoryExists(flowsDir)) {
    const flowFiles = getFilesRecursively(flowsDir, '.json');
    
    for (const file of flowFiles) {
      const key = file.name;
      const relativeFilePath = path.join('flows', file.relativePath);
      
      // Track this file as available
      allJsonFiles.add(key);
      
      // Check for duplicates
      if (masterlist[key]) {
        throw new Error(`Duplicate JSON definition found: "${key}" exists in both "${masterlist[key]}" and "${relativeFilePath}"`);
      }
      
      // Add to masterlist
      masterlist[key] = relativeFilePath;
      
      // Parse and extract references
      const jsonContent = parseJsonFile(file.path);
      const references = extractReferences(jsonContent);
      references.forEach(ref => referencedFiles.add(ref));
    }
  }
  
  // Process subflows directory
  if (directoryExists(subflowsDir)) {
    const subflowFiles = getFilesRecursively(subflowsDir, '.json');
    
    for (const file of subflowFiles) {
      const key = file.name;
      // Use 'flows/' path since build process copies subflows to flows directory
      const relativeFilePath = path.join('flows', file.relativePath);
      
      // Track this file as available
      allJsonFiles.add(key);
      
      // Check for duplicates
      if (masterlist[key]) {
        throw new Error(`Duplicate JSON definition found: "${key}" exists in both "${masterlist[key]}" and "${relativeFilePath}"`);
      }
      
      // Add to masterlist
      masterlist[key] = relativeFilePath;
      
      // Parse and extract references
      const jsonContent = parseJsonFile(file.path);
      const references = extractReferences(jsonContent);
      references.forEach(ref => referencedFiles.add(ref));
    }
  }
  
  // Check if masterlist is empty
  if (Object.keys(masterlist).length === 0) {
    throw new Error('No JSON files found in flows or subflows directories');
  }
  
  // Validate that all referenced files exist
  const missingFiles = [];
  referencedFiles.forEach(referenceName => {
    if (!allJsonFiles.has(referenceName)) {
      missingFiles.push(referenceName);
    }
  });
  
  if (missingFiles.length > 0) {
    throw new Error(`Referenced JSON files not found: ${missingFiles.map(f => `"${f}.json"`).join(', ')}`);
  }
  
  return masterlist;
}

module.exports = {
  generateMasterlist,
  extractReferences
}; 