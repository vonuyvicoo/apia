/**
 * HTTP Listener Connector
 * Handles HTTP request/response operations
 */
module.exports = {
  /**
   * Execute the HTTP listener operation
   * @param {Object} config - Connector configuration
   * @param {Object} payload - Current payload
   * @returns {Promise<Object>} Updated payload
   */
  async execute(config, payload) {
    console.log('      🌐 HTTPListener: Processing HTTP operation...');
    
    try {
      // Extract request information if available
      if (payload.request) {
        console.log(`      📥 HTTP request: ${payload.request.method} ${payload.request.path}`);
        
        // Add convenient access to request parts
        payload.params = payload.request.params || {};
        payload.query = payload.request.query || {};
        payload.body = payload.request.body || {};
        payload.headers = payload.request.headers || {};
        payload.method = payload.request.method;
        payload.path = payload.request.path;
      }
      
      return payload;
      
    } catch (error) {
      console.error('      ❌ HTTPListener failed:', error.message);
      throw error;
    }
  }
}; 