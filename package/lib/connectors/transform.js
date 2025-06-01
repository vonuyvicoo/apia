/**
 * Transform Message Connector
 * Executes JavaScript code to transform the payload
 */
module.exports = {
  /**
   * Execute the transform operation
   * @param {Object} config - Connector configuration
   * @param {string} config.code - JavaScript code to execute
   * @param {string} config.function - Named function reference
   * @param {Object} payload - Current payload
   * @returns {Promise<Object>} Transformed payload
   */
  async execute(config, payload) {
    console.log('      🔄 Transform: Executing transformation...');
    
    try {
      let transformedPayload = payload;
      
      if (config.code) {
        // Execute inline JavaScript code
        console.log('      📝 Executing inline code...');
        
        // Create a safe execution context
        const func = new Function('payload', config.code);
        const result = func({ ...payload });
        
        // Handle different return types
        if (result !== undefined) {
          transformedPayload = result;
        }
        
      } else if (config.function) {
        // Execute named function (would need to be defined in global config)
        console.log(`      📝 Executing named function: ${config.function}`);
        throw new Error('Named function execution not yet implemented');
        
      } else {
        throw new Error('Transform connector requires either "code" or "function" configuration');
      }
      
      console.log('      ✅ Transformation completed');
      return transformedPayload;
      
    } catch (error) {
      console.error('      ❌ Transform failed:', error.message);
      throw new Error(`Transform connector failed: ${error.message}`);
    }
  }
}; 