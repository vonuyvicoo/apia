/**
 * Set Payload Connector
 * Sets specific fields on the payload object
 */

/**
 * Simple implementation to set nested object properties
 * @param {Object} obj - Target object
 * @param {string} path - Property path (e.g., 'response.body.message')
 * @param {*} value - Value to set
 */
function setNestedProperty(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot notation path (e.g., 'request.body.name')
 * @returns {*} Value at path
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

module.exports = {
  /**
   * Execute the set payload operation
   * @param {Object} config - Connector configuration
   * @param {Object} config.fields - Fields to set on payload (key: target path, value: source path or literal value)
   * @param {Object} config.payload - Direct payload object to merge
   * @param {Object} payload - Current payload
   * @returns {Promise<Object>} Updated payload
   */
  async execute(config, payload) {
    console.log('      🔧 SetPayload: Setting payload fields...');
    
    let updatedPayload = { ...payload };
    
    // Handle direct payload merge
    if (config.payload) {
      updatedPayload = { ...updatedPayload, ...config.payload };
      console.log('      ✅ Merged direct payload object');
    }
    
    // Handle field-by-field setting
    if (config.fields) {
      Object.entries(config.fields).forEach(([targetPath, sourcePathOrValue]) => {
        let value;
        
        // Check if the value is a path reference (contains dots and refers to existing payload data)
        if (typeof sourcePathOrValue === 'string' && sourcePathOrValue.includes('.')) {
          // Try to extract value from payload using the path
          value = getNestedValue(updatedPayload, sourcePathOrValue);
          console.log(`      📊 Extracting from path "${sourcePathOrValue}": ${JSON.stringify(value)}`);
        } else {
          // Use literal value
          value = sourcePathOrValue;
          console.log(`      📊 Using literal value: ${JSON.stringify(value)}`);
        }
        
        setNestedProperty(updatedPayload, targetPath, value);
        console.log(`      ✅ Set ${targetPath} = ${JSON.stringify(value)}`);
      });
    }
    
    return updatedPayload;
  }
}; 