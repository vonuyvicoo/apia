const path = require('path');
const fs = require('fs');
const { parseJsonFile, fileExists } = require('./utils');

/**
 * APIA Runtime Engine
 * Handles execution of flows with DFS traversal
 */
class RuntimeEngine {
  constructor(buildDir = '.apia') {
    this.buildDir = buildDir;
    this.masterlist = null;
    this.flowCache = new Map();
    this.connectorCache = new Map();
    this.globalConfig = null;
  }

  /**
   * Initialize the runtime engine
   */
  async initialize() {
    console.log('🚀 Initializing APIA Runtime Engine...');
    
    // Load masterlist
    const masterlistPath = path.join(this.buildDir, 'masterlist.json');
    if (!fileExists(masterlistPath)) {
      throw new Error(`Masterlist not found at ${masterlistPath}. Did you run the build?`);
    }
    
    this.masterlist = parseJsonFile(masterlistPath);
    console.log(`   ✅ Loaded masterlist with ${Object.keys(this.masterlist).length} flow definitions`);

    // Load global configuration
    const globalConfigPath = path.join(this.buildDir, 'global.config.json');
    if (fileExists(globalConfigPath)) {
      this.globalConfig = parseJsonFile(globalConfigPath);
      console.log('   ✅ Loaded global configuration');
    }

    console.log('✅ Runtime engine initialized successfully');
  }

  /**
   * Load a flow definition by name
   * @param {string} flowName - Flow reference name
   * @returns {Object} Flow definition
   */
  loadFlowDefinition(flowName) {
    // Check cache first
    if (this.flowCache.has(flowName)) {
      return this.flowCache.get(flowName);
    }

    // Look up in masterlist
    const relativePath = this.masterlist[flowName];
    if (!relativePath) {
      throw new Error(`Flow "${flowName}" not found in masterlist`);
    }

    // Load from file
    const fullPath = path.join(this.buildDir, relativePath);
    if (!fileExists(fullPath)) {
      throw new Error(`Flow file not found: ${fullPath}`);
    }

    const flowDefinition = parseJsonFile(fullPath);
    
    // Cache for future use
    this.flowCache.set(flowName, flowDefinition);
    
    return flowDefinition;
  }

  /**
   * Load a connector module
   * @param {string} connectorType - Type of connector (e.g., 'mysql', 'mongodb')
   * @returns {Object} Connector module
   */
  loadConnectorModule(connectorType) {
    // Check cache first
    if (this.connectorCache.has(connectorType)) {
      return this.connectorCache.get(connectorType);
    }

    // Try to load connector module
    const connectorPath = path.join(this.buildDir, 'connectors', `${connectorType}.js`);
    
    if (!fileExists(connectorPath)) {
      throw new Error(`Connector module not found: ${connectorPath}`);
    }

    try {
      // Clear require cache to allow hot reloading in development
      delete require.cache[require.resolve(connectorPath)];
      const connectorModule = require(connectorPath);
      
      // Validate connector interface
      if (typeof connectorModule.execute !== 'function') {
        throw new Error(`Connector "${connectorType}" must export an execute function`);
      }

      // Cache for future use
      this.connectorCache.set(connectorType, connectorModule);
      
      return connectorModule;
    } catch (error) {
      throw new Error(`Failed to load connector "${connectorType}": ${error.message}`);
    }
  }

  /**
   * Execute a flow with DFS traversal
   * @param {string} flowName - Flow reference name
   * @param {Object} payload - Initial payload
   * @returns {Promise<Object>} Final payload after execution
   */
  async executeFlow(flowName, payload = {}) {
    console.log(`🔄 Executing flow: ${flowName}`);
    
    try {
      const flowDefinition = this.loadFlowDefinition(flowName);
      
      // Handle different flow types
      if (flowDefinition.type === 'connector') {
        return await this.executeConnector(flowDefinition, payload);
      } else if (flowDefinition.type === 'decision') {
        return await this.executeDecision(flowDefinition, payload);
      } else if (flowDefinition.subflows) {
        return await this.executeSubflows(flowDefinition.subflows, payload);
      } else {
        throw new Error(`Unknown flow type for "${flowName}"`);
      }
    } catch (error) {
      console.error(`❌ Error executing flow "${flowName}":`, error.message);
      throw error;
    }
  }

  /**
   * Execute a connector
   * @param {Object} connectorDef - Connector definition
   * @param {Object} payload - Current payload
   * @returns {Promise<Object>} Updated payload
   */
  async executeConnector(connectorDef, payload) {
    const connectorType = connectorDef.connectorType || this.inferConnectorType(connectorDef);
    
    console.log(`   🔌 Executing connector: ${connectorType}`);
    
    const connectorModule = this.loadConnectorModule(connectorType);
    
    // Prepare config (merge with global config if available)
    let config = connectorDef.config || {};
    if (this.globalConfig && this.globalConfig[connectorType]) {
      config = { ...this.globalConfig[connectorType], ...config };
    }

    // Execute connector
    const result = await connectorModule.execute(config, payload);
    
    console.log(`   ✅ Connector "${connectorType}" completed`);
    
    return result;
  }

  /**
   * Execute a decision (choice) connector
   * @param {Object} decisionDef - Decision definition
   * @param {Object} payload - Current payload
   * @returns {Promise<Object>} Result from chosen path
   */
  async executeDecision(decisionDef, payload) {
    console.log('   🤔 Evaluating decision conditions...');
    
    const conditions = decisionDef.conditions || [];
    
    for (const condition of conditions) {
      try {
        // Evaluate condition safely
        const result = this.evaluateCondition(condition.when, payload);
        
        if (result) {
          console.log(`   ✅ Condition matched, going to: ${condition.goTo}`);
          return await this.executeFlow(condition.goTo, payload);
        }
      } catch (error) {
        console.warn(`   ⚠️  Error evaluating condition "${condition.when}":`, error.message);
      }
    }
    
    // No conditions matched
    if (decisionDef.default) {
      console.log(`   ➡️  No conditions matched, using default: ${decisionDef.default}`);
      return await this.executeFlow(decisionDef.default, payload);
    }
    
    throw new Error('No decision conditions matched and no default path specified');
  }

  /**
   * Execute a list of subflows in sequence
   * @param {Array} subflows - Array of subflow references or connector definitions
   * @param {Object} payload - Current payload
   * @returns {Promise<Object>} Final payload after all subflows
   */
  async executeSubflows(subflows, payload) {
    let currentPayload = payload;
    console.log(`   🔄 Starting executeSubflows with payload keys: [${Object.keys(currentPayload).join(', ')}]`);
    
    for (const subflow of subflows) {
      console.log(`   📋 Processing subflow: ${JSON.stringify(subflow)}`);
      console.log(`   📦 Current payload keys before: [${Object.keys(currentPayload).join(', ')}]`);
      if (currentPayload.id !== undefined) console.log(`   🆔 payload.id before: ${currentPayload.id}`);
      
      if (typeof subflow === 'string') {
        // Simple string reference to another subflow
        currentPayload = await this.executeFlow(subflow, currentPayload);
      } else if (subflow.type === 'connector') {
        // Inline connector definition - execute directly
        currentPayload = await this.executeConnector(subflow, currentPayload);
      } else if (subflow.type === 'decision') {
        // Inline decision definition - execute directly
        currentPayload = await this.executeDecision(subflow, currentPayload);
      } else if (subflow['subflow-reference-name'] && !subflow.type) {
        // Reference to another subflow using subflow-reference-name
        currentPayload = await this.executeFlow(subflow['subflow-reference-name'], currentPayload);
      } else if (subflow['flow-reference-name'] && !subflow.type) {
        // Reference to another subflow using flow-reference-name (legacy support)
        currentPayload = await this.executeFlow(subflow['flow-reference-name'], currentPayload);
      } else {
        throw new Error(`Unknown subflow type: ${JSON.stringify(subflow)}`);
      }
      
      console.log(`   📦 Current payload keys after: [${Object.keys(currentPayload).join(', ')}]`);
      if (currentPayload.id !== undefined) console.log(`   🆔 payload.id after: ${currentPayload.id}`);
    }
    
    return currentPayload;
  }

  /**
   * Infer connector type from definition
   * @param {Object} connectorDef - Connector definition
   * @returns {string} Connector type
   */
  inferConnectorType(connectorDef) {
    const flowName = connectorDef['flow-reference-name'] || '';
    
    // Try to infer from flow name
    if (flowName.includes('mysql')) return 'mysql';
    if (flowName.includes('mongodb')) return 'mongodb';
    if (flowName.includes('postgresql') || flowName.includes('postgres')) return 'postgresql';
    if (flowName.includes('zoho')) return 'zoho';
    if (flowName.includes('salesforce')) return 'salesforce';
    if (flowName.includes('transform')) return 'transform';
    if (flowName.includes('set-payload')) return 'setPayload';
    if (flowName.includes('http')) return 'httpListener';
    
    // Default fallback
    throw new Error(`Cannot infer connector type for: ${flowName}`);
  }

  /**
   * Safely evaluate a condition expression
   * @param {string} expression - JavaScript expression
   * @param {Object} payload - Payload context
   * @returns {boolean} Evaluation result
   */
  evaluateCondition(expression, payload) {
    try {
      // Create a safe evaluation context
      const context = { payload };
      
      // Simple expression evaluation (in production, use a safer sandbox)
      const func = new Function('payload', `return ${expression}`);
      return Boolean(func(payload));
    } catch (error) {
      console.warn(`Failed to evaluate condition: ${expression}`, error.message);
      return false;
    }
  }
}

module.exports = { RuntimeEngine }; 