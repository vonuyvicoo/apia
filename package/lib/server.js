/**
 * APIA Runtime Server
 * Express.js server that handles HTTP routing and flow execution
 */

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { RuntimeEngine } = require('./runtime');

class APIAServer {
  constructor(buildDir = './build', port = 3000) {
    this.app = express();
    this.port = port;
    this.buildDir = path.resolve(buildDir);
    this.runtime = new RuntimeEngine(this.buildDir);
    this.routes = new Map();
    
    this.setupMiddleware();
  }
  
  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Body parsing middleware
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`📥 ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }
  
  /**
   * Initialize the server and runtime engine
   */
  async initialize() {
    console.log('🚀 Initializing APIA Server...');
    
    try {
      // Initialize runtime engine
      console.log('🔧 Initializing runtime engine...');
      await this.runtime.initialize();
      
      // Load router configuration
      console.log('🔧 Loading router configuration...');
      await this.loadRouterConfig();
      
      // Setup routes
      console.log('🔧 Setting up routes...');
      this.setupRoutes();
      
      // Setup error handling
      console.log('🔧 Setting up error handling...');
      this.setupErrorHandling();
      
      console.log('✅ APIA Server initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize APIA Server:', error.message);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }
  
  /**
   * Load router configuration from router.config.json
   */
  async loadRouterConfig() {
    const routerConfigPath = path.join(this.buildDir, 'router.config.json');
    
    if (!fs.existsSync(routerConfigPath)) {
      console.warn('⚠️  No router.config.json found, using default routing');
      return;
    }
    
    try {
      const routerConfig = JSON.parse(fs.readFileSync(routerConfigPath, 'utf8'));
      console.log('📋 Loaded router configuration');
      
      // Handle both array format and object format
      let routes = [];
      if (Array.isArray(routerConfig)) {
        routes = routerConfig;
      } else if (routerConfig.routes && Array.isArray(routerConfig.routes)) {
        routes = routerConfig.routes;
      }
      
      // Process routes from configuration
      routes.forEach(route => {
        const flowName = route.flowReference || route.flow;
        this.addRoute(route.method, route.path, flowName);
      });
      
    } catch (error) {
      console.error('❌ Failed to load router configuration:', error.message);
      throw error;
    }
  }
  
  /**
   * Add a route mapping
   */
  addRoute(method, path, flowName) {
    const key = `${method.toUpperCase()}:${path}`;
    this.routes.set(key, flowName);
    console.log(`🛣️  Route mapped: ${method.toUpperCase()} ${path} -> ${flowName}`);
  }
  
  /**
   * Setup Express routes
   */
  setupRoutes() {
    // Status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        server: 'APIA Runtime',
        routes: Array.from(this.routes.keys()),
        buildDir: this.buildDir,
        timestamp: new Date().toISOString()
      });
    });

    // Register dynamic routes from configuration
    this.routes.forEach((flowName, routeKey) => {
      try {
        console.log(`🔍 Processing route: ${routeKey} -> ${flowName}`);
        const colonIndex = routeKey.indexOf(':');
        const method = routeKey.substring(0, colonIndex);
        const path = routeKey.substring(colonIndex + 1);
        console.log(`🔍 Split result: method="${method}", path="${path}"`);
        const methodLower = method.toLowerCase();
        
        // Register the route with Express
        if (this.app[methodLower]) {
          this.app[methodLower](path, async (req, res) => {
            await this.handleRequest(req, res, flowName);
          });
          console.log(`🔗 Registered Express route: ${method} ${path}`);
        } else {
          console.log(`⚠️  Unsupported HTTP method: ${method}`);
        }
      } catch (error) {
        console.error(`❌ Failed to register route ${routeKey}:`, error.message);
        throw error;
      }
    });
    
    console.log('✅ All routes registered successfully');
    
    // Fallback 404 handler for unmatched routes - temporarily disabled
    // this.app.all('*', (req, res) => {
    //   res.status(404).json({
    //     error: 'Route not found',
    //     method: req.method,
    //     path: req.path,
    //     availableRoutes: Array.from(this.routes.keys()),
    //     timestamp: new Date().toISOString()
    //   });
    // });
  }
  
  /**
   * Handle incoming HTTP requests
   */
  async handleRequest(req, res, flowName) {
    try {
      console.log(`🔄 Executing flow: ${flowName}`);
      
      // Build initial payload from request
      const payload = {
        request: {
          method: req.method,
          path: req.path,
          originalUrl: req.originalUrl,
          headers: req.headers,
          query: req.query,
          params: req.params,
          body: req.body,
          ip: req.ip,
          timestamp: new Date().toISOString()
        },
        response: {
          headers: {},
          statusCode: 200
        }
      };
      
      // Execute the flow
      const result = await this.runtime.executeFlow(flowName, payload);
      
      // Send response
      if (result && result.response) {
        // Set headers if specified
        if (result.response.headers) {
          Object.entries(result.response.headers).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        }
        
        // Set status code
        const statusCode = result.response.statusCode || 200;
        
        // Send response body
        if (result.response.body !== undefined) {
          res.status(statusCode).json(result.response.body);
        } else {
          res.status(statusCode).json(result);
        }
      } else {
        res.json(result);
      }
      
    } catch (error) {
      console.error(`❌ Flow execution failed for ${flowName}:`, error.message);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        flow: flowName,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Setup error handling middleware
   */
  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('❌ Unhandled error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    });
  }
  
  /**
   * Start the server
   */
  async start() {
    await this.initialize();
    
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`🌟 APIA Server running on port ${this.port}`);
        console.log(`📍 Health check: http://localhost:${this.port}/health`);
        console.log(`📊 Status: http://localhost:${this.port}/status`);
        resolve();
      });
    });
  }
  
  /**
   * Stop the server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('🛑 APIA Server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = APIAServer; 