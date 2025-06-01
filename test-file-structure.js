const fs = require('fs');
const path = require('path');

function getFileStructure(dirPath, relativePath = '') {
  console.log('Testing getFileStructure with:', dirPath);
  const files = [];
  
  try {
    if (!fs.existsSync(dirPath)) {
      console.log('Directory does not exist:', dirPath);
      return files;
    }

    const items = fs.readdirSync(dirPath);
    console.log('Items found:', items);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      const itemRelativePath = path.join(relativePath, item);
      
      if (stat.isDirectory()) {
        files.push({
          name: item,
          type: 'directory',
          path: itemRelativePath,
          children: getFileStructure(itemPath, itemRelativePath)
        });
      } else if (item.endsWith('.json')) {
        files.push({
          name: item,
          type: 'file',
          path: itemRelativePath,
          size: stat.size,
          modified: stat.mtime
        });
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error);
  }
  
  return files.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

console.log('Testing file structure generation...');
console.log('Working directory:', process.cwd());

// Use the correct path
const testfolderPath = path.join(process.cwd(), './testfolder');
console.log('testfolderPath:', testfolderPath);

const srcPath = path.join(testfolderPath, 'src');
const flowsPath = path.join(srcPath, 'flows');
const subflowsPath = path.join(srcPath, 'subflows');
const configPath = path.join(srcPath, 'config');

const fileStructure = {
  flows: getFileStructure(flowsPath, 'flows'),
  subflows: getFileStructure(subflowsPath, 'subflows'),
  config: getFileStructure(configPath, 'config')
};

console.log('Final fileStructure:', JSON.stringify(fileStructure, null, 2)); 