#!/usr/bin/env node

/**
 * APIA Validation Script
 * Validates flow definitions, configurations, and project structure
 */

const fs = require('fs');
const path = require('path');

class APIAValidator {
  constructor(projectDir = '.') {
    this.projectDir = path.resolve(projectDir);
    this.errors = [];
    this.warnings = [];
  }
  
  /**
   * Run all validations
   */
  async validate() {
    console.log('🔍 Starting APIA project validation...');
    console.log(`📁 Project directory: ${this.projectDir}`);
    console.log('');
    
    try {
      // Validate project structure
      this.validateProjectStructure();
      
      // Validate package.json
      this.validatePackageJson();
      
      // Validate flow definitions
      await this.validateFlowDefinitions();
      
      // Validate configuration files
      this.validateConfigurations();
      
      // Validate connector implementations
      this.validateConnectors();
      
      // Report results
      this.reportResults();
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  }
  
  /**
   * Validate project structure
   */
  validateProjectStructure() {
    console.log('📂 Validating project structure...');
    
    const requiredDirs = [
      'lib',
      'lib/connectors',
      'flows',
      'config',
      'scripts'
    ];
    
    const requiredFiles = [
      'package.json',
      'lib/index.js',
      'lib/runtime.js',
      'lib/server.js',
      'lib/main.js',
      'scripts/build.js'
    ];
    
    // Check directories
    requiredDirs.forEach(dir => {
      const dirPath = path.join(this.projectDir, dir);
      if (!fs.existsSync(dirPath)) {
        this.errors.push(`Missing required directory: ${dir}`);
      }
    });
    
    // Check files
    requiredFiles.forEach(file => {
      const filePath = path.join(this.projectDir, file);
      if (!fs.existsSync(filePath)) {
        this.errors.push(`Missing required file: ${file}`);
      }
    });
    
    console.log('  ✅ Project structure validation complete');
  }
  
  /**
   * Validate package.json
   */
  validatePackageJson() {
    console.log('📦 Validating package.json...');
    
    const packagePath = path.join(this.projectDir, 'package.json');
    
    if (!fs.existsSync(packagePath)) {
      this.errors.push('package.json not found');
      return;
    }
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Check required fields
      const requiredFields = ['name', 'version', 'main', 'scripts'];
      requiredFields.forEach(field => {
        if (!packageJson[field]) {
          this.errors.push(`package.json missing required field: ${field}`);
        }
      });
      
      // Check required scripts
      const requiredScripts = ['build', 'start', 'validate'];
      if (packageJson.scripts) {
        requiredScripts.forEach(script => {
          if (!packageJson.scripts[script]) {
            this.warnings.push(`package.json missing recommended script: ${script}`);
          }
        });
      }
      
      // Check dependencies
      const requiredDeps = ['express', 'body-parser'];
      if (packageJson.dependencies) {
        requiredDeps.forEach(dep => {
          if (!packageJson.dependencies[dep]) {
            this.warnings.push(`package.json missing recommended dependency: ${dep}`);
          }
        });
      }
      
    } catch (error) {
      this.errors.push(`Invalid package.json: ${error.message}`);
    }
    
    console.log('  ✅ package.json validation complete');
  }
  
  /**
   * Validate flow definitions
   */
  async validateFlowDefinitions() {
    console.log('🔄 Validating flow definitions...');
    
    const flowsDir = path.join(this.projectDir, 'flows');
    
    if (!fs.existsSync(flowsDir)) {
      this.errors.push('flows directory not found');
      return;
    }
    
    const flowFiles = fs.readdirSync(flowsDir).filter(file => file.endsWith('.json'));
    
    if (flowFiles.length === 0) {
      this.warnings.push('No flow definitions found');
      return;
    }
    
    for (const flowFile of flowFiles) {
      const flowPath = path.join(flowsDir, flowFile);
      
      try {
        const flowDef = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
        
        // Validate flow structure
        this.validateFlowStructure(flowDef, flowFile);
        
      } catch (error) {
        this.errors.push(`Invalid flow definition ${flowFile}: ${error.message}`);
      }
    }
    
    console.log(`  ✅ Validated ${flowFiles.length} flow definitions`);
  }
  
  /**
   * Validate individual flow structure
   */
  validateFlowStructure(flowDef, fileName) {
    // Check required fields
    const requiredFields = ['name', 'type'];
    requiredFields.forEach(field => {
      if (!flowDef[field]) {
        this.errors.push(`Flow ${fileName} missing required field: ${field}`);
      }
    });
    
    // Validate flow type
    if (flowDef.type && !['flow', 'connector', 'decision'].includes(flowDef.type)) {
      this.errors.push(`Flow ${fileName} has invalid type: ${flowDef.type}`);
    }
    
    // Validate subflows if present
    if (flowDef.subflows) {
      if (!Array.isArray(flowDef.subflows)) {
        this.errors.push(`Flow ${fileName} subflows must be an array`);
      } else {
        flowDef.subflows.forEach((subflow, index) => {
          this.validateSubflow(subflow, fileName, index);
        });
      }
    }
  }
  
  /**
   * Validate subflow structure
   */
  validateSubflow(subflow, fileName, index) {
    if (typeof subflow === 'string') {
      // String reference is valid
      return;
    }
    
    if (typeof subflow === 'object') {
      // Check required fields for object subflows
      if (!subflow.name) {
        this.errors.push(`Flow ${fileName} subflow ${index} missing name`);
      }
      
      if (!subflow.type) {
        this.errors.push(`Flow ${fileName} subflow ${index} missing type`);
      }
      
      // Validate connector subflows
      if (subflow.type === 'connector' && !subflow.connectorType) {
        this.errors.push(`Flow ${fileName} subflow ${index} missing connectorType`);
      }
      
      // Validate decision subflows
      if (subflow.type === 'decision') {
        if (!subflow.conditions || !Array.isArray(subflow.conditions)) {
          this.errors.push(`Flow ${fileName} subflow ${index} decision missing conditions array`);
        }
      }
    }
  }
  
  /**
   * Validate configuration files
   */
  validateConfigurations() {
    console.log('⚙️  Validating configuration files...');
    
    const configDir = path.join(this.projectDir, 'config');
    
    if (!fs.existsSync(configDir)) {
      this.warnings.push('config directory not found');
      return;
    }
    
    // Validate router.config.json
    const routerConfigPath = path.join(configDir, 'router.config.json');
    if (fs.existsSync(routerConfigPath)) {
      try {
        const routerConfig = JSON.parse(fs.readFileSync(routerConfigPath, 'utf8'));
        
        if (routerConfig.routes && Array.isArray(routerConfig.routes)) {
          routerConfig.routes.forEach((route, index) => {
            if (!route.method || !route.path || !route.flow) {
              this.errors.push(`router.config.json route ${index} missing required fields`);
            }
          });
        }
        
      } catch (error) {
        this.errors.push(`Invalid router.config.json: ${error.message}`);
      }
    } else {
      this.warnings.push('router.config.json not found');
    }
    
    // Validate global.config.json
    const globalConfigPath = path.join(configDir, 'global.config.json');
    if (fs.existsSync(globalConfigPath)) {
      try {
        JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
      } catch (error) {
        this.errors.push(`Invalid global.config.json: ${error.message}`);
      }
    } else {
      this.warnings.push('global.config.json not found');
    }
    
    console.log('  ✅ Configuration validation complete');
  }
  
  /**
   * Validate connector implementations
   */
  validateConnectors() {
    console.log('🔌 Validating connector implementations...');
    
    const connectorsDir = path.join(this.projectDir, 'lib', 'connectors');
    
    if (!fs.existsSync(connectorsDir)) {
      this.errors.push('lib/connectors directory not found');
      return;
    }
    
    const connectorFiles = fs.readdirSync(connectorsDir).filter(file => file.endsWith('.js'));
    
    if (connectorFiles.length === 0) {
      this.warnings.push('No connector implementations found');
      return;
    }
    
    connectorFiles.forEach(connectorFile => {
      const connectorPath = path.join(connectorsDir, connectorFile);
      
      try {
        const connector = require(connectorPath);
        
        if (!connector.execute || typeof connector.execute !== 'function') {
          this.errors.push(`Connector ${connectorFile} missing execute function`);
        }
        
      } catch (error) {
        this.errors.push(`Failed to load connector ${connectorFile}: ${error.message}`);
      }
    });
    
    console.log(`  ✅ Validated ${connectorFiles.length} connector implementations`);
  }
  
  /**
   * Report validation results
   */
  reportResults() {
    console.log('');
    console.log('📊 Validation Results:');
    console.log('='.repeat(50));
    
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ All validations passed! Project is ready.');
    } else {
      if (this.errors.length > 0) {
        console.log(`❌ Errors (${this.errors.length}):`);
        this.errors.forEach(error => {
          console.log(`   • ${error}`);
        });
        console.log('');
      }
      
      if (this.warnings.length > 0) {
        console.log(`⚠️  Warnings (${this.warnings.length}):`);
        this.warnings.forEach(warning => {
          console.log(`   • ${warning}`);
        });
        console.log('');
      }
      
      if (this.errors.length > 0) {
        console.log('❌ Validation failed. Please fix the errors above.');
        process.exit(1);
      } else {
        console.log('✅ Validation passed with warnings.');
      }
    }
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  const validator = new APIAValidator(process.argv[2] || '.');
  validator.validate();
}

module.exports = APIAValidator; 