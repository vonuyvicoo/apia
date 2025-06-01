/**
 * HTTP Connector
 * Handles HTTP requests to external services
 */
const axios = require('axios');

module.exports = {
  /**
   * Execute HTTP request
   * @param {Object} config - Connector configuration
   * @param {string} config.url - Target URL
   * @param {string} config.method - HTTP method (GET, POST, PUT, DELETE)
   * @param {Object} config.headers - Request headers
   * @param {Object} config.data - Request body data
   * @param {Object} config.params - URL parameters
   * @param {number} config.timeout - Request timeout in milliseconds
   * @param {Object} payload - Current payload
   * @returns {Promise<Object>} Updated payload with HTTP response
   */
  async execute(config, payload) {
    console.log('      🌐 HTTP: Making external request...');
    
    try {
      const method = (config.method || 'GET').toLowerCase();
      const url = config.url;
      const timeout = config.timeout || 5000;
      const headers = config.headers || {};
      
      if (!url) {
        throw new Error('HTTP connector requires a URL');
      }
      
      console.log(`      📡 HTTP ${method.toUpperCase()} request to: ${url}`);
      
      // Prepare request configuration
      const requestConfig = {
        method,
        url,
        timeout,
        headers
      };
      
      // Add request body for POST, PUT, PATCH
      if (['post', 'put', 'patch'].includes(method)) {
        requestConfig.data = config.data || payload.body || {};
      }
      
      // Add query parameters
      if (config.params) {
        requestConfig.params = config.params;
      }
      
      // Make the HTTP request
      const response = await axios(requestConfig);
      
      console.log(`      ✅ HTTP ${method.toUpperCase()} completed with status: ${response.status}`);
      
      // Add HTTP response to payload
      return {
        ...payload,
        httpResponse: {
          status: response.status,
          statusText: response.statusText,
          data: response.data,
          headers: response.headers
        }
      };
      
    } catch (error) {
      console.error('      ❌ HTTP request failed:', error.message);
      
      // Handle axios errors
      if (error.response) {
        // Server responded with error status
        return {
          ...payload,
          httpResponse: {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data,
            headers: error.response.headers,
            error: true
          }
        };
      } else {
        // Network error or timeout
        throw new Error(`HTTP connector failed: ${error.message}`);
      }
    }
  }
}; 