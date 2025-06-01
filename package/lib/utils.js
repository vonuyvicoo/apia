const fs = require('fs');
const path = require('path');

/**
 * Check if a directory exists
 * @param {string} dirPath - Path to directory
 * @returns {boolean}
 */
function directoryExists(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

/**
 * Check if a file exists
 * @param {string} filePath - Path to file
 * @returns {boolean}
 */
function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Get all files in a directory recursively
 * @param {string} dirPath - Directory path
 * @param {string} extension - File extension to filter (e.g., '.json')
 * @returns {Array<{path: string, relativePath: string, name: string}>}
 */
function getFilesRecursively(dirPath, extension = '') {
  const files = [];
  
  function traverse(currentPath, relativePath = '') {
    if (!directoryExists(currentPath)) {
      return;
    }
    
    const items = fs.readdirSync(currentPath);
    
    for (const item of items) {
      const itemPath = path.join(currentPath, item);
      const itemRelativePath = path.join(relativePath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        traverse(itemPath, itemRelativePath);
      } else if (stat.isFile() && (extension === '' || item.endsWith(extension))) {
        files.push({
          path: itemPath,
          relativePath: itemRelativePath,
          name: path.basename(item, path.extname(item))
        });
      }
    }
  }
  
  traverse(dirPath);
  return files;
}

/**
 * Parse JSON file safely
 * @param {string} filePath - Path to JSON file
 * @returns {Object} Parsed JSON content
 * @throws {Error} If file cannot be parsed
 */
function parseJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON file "${filePath}": ${error.message}`);
  }
}

/**
 * Write JSON file with formatting
 * @param {string} filePath - Path to write file
 * @param {Object} data - Data to write
 * @param {number} indent - Indentation spaces (default: 2)
 */
function writeJsonFile(filePath, data, indent = 2) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, indent));
}

module.exports = {
  directoryExists,
  fileExists,
  getFilesRecursively,
  parseJsonFile,
  writeJsonFile
}; 