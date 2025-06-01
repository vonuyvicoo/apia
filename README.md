![Group 1](https://github.com/user-attachments/assets/11490ac3-195d-4b5f-82f1-a05daf0d9479)
# APIA - API Builder and Runtime Engine

APIA is a visual flow-based API framework that allows developers to build, configure, and manage APIs through a declarative JSON-based approach with a modern web-based GUI.

## Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
- [Getting Started](#getting-started)
- [Flow Architecture](#flow-architecture)
- [Configuration Files](#configuration-files)
- [Build System](#build-system)
- [Commands](#commands)
- [Connector Types](#connector-types)
- [Development Workflow](#development-workflow)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

APIA enables developers to:
- **Build APIs visually** using a drag-and-drop interface
- **Define flows declaratively** using JSON configuration files
- **Connect to multiple data sources** (MySQL, MongoDB, PostgreSQL, etc.)
- **Transform data** using JavaScript code snippets
- **Route requests** through configurable endpoints
- **Deploy automatically** with a built-in build system

## Project Structure

```
apia/
├── README.md                    # This file
├── package/                     # Core APIA framework
│   ├── gui/                     # Web-based visual editor
│   │   ├── src/
│   │   │   ├── components/      # React components
│   │   │   ├── contexts/        # React contexts
│   │   │   └── pages/           # Application pages
│   │   ├── package.json
│   │   └── next.config.js
│   └── lib/                     # Runtime engine
│       ├── runtime.js           # Main runtime engine
│       ├── builder.js           # Build system
│       ├── connectors/          # Connector implementations
│       │   ├── mysql.js
│       │   ├── mongodb.js
│       │   ├── transform.js
│       │   └── httpListener.js
│       └── package.json
└── testfolder/                  # Example project (your workspace)
    ├── src/                     # Source files (where you develop)
    │   ├── flows/               # Main flow definitions
    │   ├── subflows/            # Reusable subflow components
    │   │   ├── handlers/        # Business logic handlers
    │   │   └── callouts/        # External system connectors
    │   └── config/              # Configuration files
    │       ├── global.config.json
    │       └── router.config.json
    ├── .apia/                   # Build output (generated)
    │   ├── flows/               # Compiled flows
    │   ├── connectors/          # Connector modules
    │   ├── masterlist.json      # Flow registry
    │   ├── router.config.json   # Routing configuration
    │   └── global.config.json   # Global settings
    ├── package.json
    └── server.js                # Runtime server
```

## Core Concepts

### Flows
**Main orchestration units** that define complete API endpoints and their processing logic.

```json
{
  "flow-reference-name": "main-flow",
  "description": "Main application flow",
  "router": "router.config.json",
  "subflows": [
    { "subflow-reference-name": "subflow-create-user" },
    { "subflow-reference-name": "subflow-get-user" }
  ]
}
```

### Subflows
**Reusable components** that can be referenced by multiple flows. Two types:

#### 1. Handler Subflows (Multi-step processes)
```json
{
  "flow-reference-name": "subflow-create-user-handler",
  "description": "Handler for creating a new user",
  "subflows": [
    {
      "subflow-reference-name": "validate-input",
      "type": "connector",
      "connectorType": "transform"
    },
    {
      "subflow-reference-name": "subflow-create-user-callout"
    }
  ]
}
```

#### 2. Callout Subflows (Single connector operations)
```json
{
  "flow-reference-name": "subflow-create-user-callout",
  "description": "Create a new user in MySQL database",
  "type": "connector",
  "connectorType": "mysql",
  "config": {
    "method": "create",
    "table": "users",
    "inputMapping": {
      "name": "payload.name",
      "email": "payload.email"
    }
  }
}
```

### Connectors
**Individual processing units** that perform specific operations:

- **httpListener**: Receives HTTP requests
- **mysql/mongodb/postgresql**: Database operations
- **transform**: JavaScript data transformation
- **decision**: Conditional branching

## Flow Architecture

### Execution Flow
```
HTTP Request → Router → Main Flow → Subflows → Connectors → Response
```

### Traversal System
APIA uses a **depth-first traversal** system:

1. **Router** matches incoming requests to flows
2. **Runtime Engine** loads the target flow
3. **Subflows** are executed in sequence
4. **Connectors** within subflows process data
5. **Payload** is passed between all components
6. **Response** is returned to the client

### Payload Structure
The payload object carries data through the entire flow:

```javascript
{
  request: {
    method: "POST",
    path: "/users",
    body: { name: "John", email: "john@example.com" },
    params: { id: "123" },
    query: { limit: "10" },
    headers: { "content-type": "application/json" }
  },
  response: {
    statusCode: 200,
    body: { success: true, user: {...} }
  },
  // Custom data added by connectors
  dbResult: { insertId: 456, affectedRows: 1 },
  userId: 123
}
```

## Configuration Files

### Global Configuration (`global.config.json`)
**Shared settings** for all connectors:

```json
{
  "mysql": {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "password",
    "database": "apia_db"
  },
  "mongodb": {
    "url": "mongodb://localhost:27017",
    "database": "apia_db"
  }
}
```

### Router Configuration (`router.config.json`)
**HTTP endpoint mappings**:

```json
[
  {
    "method": "post",
    "path": "/users",
    "flowReference": "subflow-create-user"
  },
  {
    "method": "get",
    "path": "/users/:id",
    "flowReference": "subflow-get-user"
  }
]
```

### Masterlist (`masterlist.json`)
**Flow registry** (auto-generated during build):

```json
{
  "main-flow": "flows/main-flow.json",
  "subflow-create-user": "flows/subflows/subflow-create-user.json",
  "subflow-create-user-callout": "flows/callouts/subflow-create-user-callout.json"
}
```

## Build System

### Build Process
The build system (`package/lib/builder.js`) performs:

1. **Scans** `src/` directory for flow files
2. **Validates** JSON syntax and structure
3. **Generates** masterlist registry
4. **Copies** files to `.apia/` directory
5. **Processes** global configuration
6. **Creates** environment files

### Build Output (`.apia/` directory)
```
.apia/
├── flows/                   # Compiled flow definitions
│   ├── main-flow.json
│   ├── handlers/
│   └── callouts/
├── connectors/              # Connector modules (symlinked)
├── masterlist.json          # Flow registry
├── router.config.json       # HTTP routing
├── global.config.json       # Global settings
└── .env                     # Environment variables
```

## Commands

### Development Commands

```bash
# Install dependencies
npm install

# Start development server with GUI
npm run dev

# Build the project
npm run build

# Start production server
npm start

# Watch for changes and rebuild
npm run watch
```

### GUI Commands
```bash
# Start the visual editor (from package/gui/)
cd package/gui
npm run dev
# Access at http://localhost:3000
```

### Runtime Commands
```bash
# Start the API server (from your project folder)
cd testfolder
npm start
# API available at http://localhost:8080
```

## Connector Types

### HTTP Listener
**Receives incoming HTTP requests**

```json
{
  "type": "connector",
  "connectorType": "httpListener",
  "config": {
    "method": "post",
    "path": "/users"
  }
}
```

### Database Connectors

#### MySQL
```json
{
  "type": "connector",
  "connectorType": "mysql",
  "config": {
    "method": "create",
    "table": "users",
    "inputMapping": {
      "name": "request.body.name",
      "email": "request.body.email"
    }
  }
}
```

#### MongoDB
```json
{
  "type": "connector",
  "connectorType": "mongodb",
  "config": {
    "method": "insert",
    "collection": "users",
    "document": {
      "name": "request.body.name",
      "email": "request.body.email"
    }
  }
}
```

### Transform Connector
**JavaScript data transformation**

```json
{
  "type": "connector",
  "connectorType": "transform",
  "config": {
    "code": "payload.userId = parseInt(payload.params.id); return payload;"
  }
}
```

### Decision Connector
**Conditional branching**

```json
{
  "type": "connector",
  "connectorType": "decision",
  "config": {
    "condition": "payload.request.body.email",
    "trueFlow": "validate-email",
    "falseFlow": "reject-request"
  }
}
```

## Development Workflow

### 1. Project Setup
```bash
# Create new project
mkdir my-api-project
cd my-api-project
npm init -y

# Install APIA
npm install apia

# Initialize project structure
npx apia init
```

### 2. Define Your API
Create flows in `src/` directory:

```
src/
├── flows/
│   └── main-flow.json
├── subflows/
│   ├── handlers/
│   │   └── user-handler.json
│   └── callouts/
│       └── mysql-callout.json
└── config/
    ├── global.config.json
    └── router.config.json
```

### 3. Configure Global Settings
Edit `src/config/global.config.json`:

```json
{
  "mysql": {
    "host": "localhost",
    "port": 3306,
    "user": "your_user",
    "password": "your_password",
    "database": "your_database"
  }
}
```

### 4. Define Routes
Edit `src/config/router.config.json`:

```json
[
  {
    "method": "post",
    "path": "/api/users",
    "flowReference": "create-user-flow"
  }
]
```

### 5. Build and Test
```bash
# Build the project
npm run build

# Start the server
npm start

# Test your API
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}'
```

### 6. Visual Development
```bash
# Start the GUI for visual editing
npm run gui

# Open http://localhost:3000
# Drag and drop connectors
# Configure visually
# Save changes
```

## Examples

### Complete User Management API

#### Router Configuration
```json
[
  { "method": "post", "path": "/users", "flowReference": "subflow-create-user" },
  { "method": "get", "path": "/users/:id", "flowReference": "subflow-get-user" },
  { "method": "put", "path": "/users/:id", "flowReference": "subflow-update-user" },
  { "method": "delete", "path": "/users/:id", "flowReference": "subflow-delete-user" }
]
```

#### Create User Flow
```json
{
  "flow-reference-name": "subflow-create-user",
  "description": "Create a new user",
  "subflows": [
    {
      "flow-reference-name": "validate-input",
      "type": "connector",
      "connectorType": "transform",
      "config": {
        "code": "if (!payload.request.body.name || !payload.request.body.email) throw new Error('Name and email required'); return payload;"
      }
    },
    {
      "subflow-reference-name": "subflow-create-user-callout"
    },
    {
      "flow-reference-name": "format-response",
      "type": "connector",
      "connectorType": "transform",
      "config": {
        "code": "payload.response = { statusCode: 201, body: { success: true, userId: payload.insertedId } }; return payload;"
      }
    }
  ]
}
```

#### MySQL Callout
```json
{
  "flow-reference-name": "subflow-create-user-callout",
  "description": "Create user in database",
  "type": "connector",
  "connectorType": "mysql",
  "config": {
    "method": "create",
    "table": "users",
    "inputMapping": {
      "name": "request.body.name",
      "email": "request.body.email",
      "created_at": "new Date().toISOString()"
    }
  }
}
```

### Data Transformation Examples

#### Extract User ID from URL
```javascript
// Transform connector code
payload.userId = parseInt(payload.params.id);
console.log('Extracted user ID:', payload.userId);
return payload;
```

#### Validate and Transform Request
```javascript
// Validation and transformation
const { name, email } = payload.request.body;

if (!name || !email) {
  throw new Error('Name and email are required');
}

if (!email.includes('@')) {
  throw new Error('Invalid email format');
}

payload.validatedData = {
  name: name.trim(),
  email: email.toLowerCase(),
  created_at: new Date().toISOString()
};

return payload;
```

#### Format API Response
```javascript
// Response formatting
const user = payload.dbResult.rows[0];

payload.response = {
  statusCode: user ? 200 : 404,
  body: user ? {
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at
    }
  } : {
    success: false,
    error: 'User not found'
  }
};

return payload;
```

## Troubleshooting

### Common Issues

#### 1. Build Failures
```bash
# Check for JSON syntax errors
npm run build 2>&1 | grep -i error

# Validate individual files
node -e "console.log(JSON.parse(require('fs').readFileSync('src/flows/my-flow.json')))"
```

#### 2. Runtime Errors
```bash
# Enable debug logging
DEBUG=apia:* npm start

# Check masterlist generation
cat .apia/masterlist.json
```

#### 3. Database Connection Issues
```bash
# Test MySQL connection
mysql -h localhost -u root -p your_database

# Check global config
cat .apia/global.config.json
```

#### 4. Routing Problems
```bash
# Verify router config
cat .apia/router.config.json

# Test endpoint
curl -v http://localhost:8080/your-endpoint
```

### Debug Tips

#### Enable Verbose Logging
```javascript
// Add to transform connectors
console.log('Payload at this step:', JSON.stringify(payload, null, 2));
return payload;
```

#### Check Flow Execution
```bash
# Monitor server logs
tail -f logs/apia.log

# Use curl with verbose output
curl -v -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com"}'
```

#### Validate Flow Structure
```javascript
// Check if flow exists in masterlist
const masterlist = require('./.apia/masterlist.json');
console.log('Available flows:', Object.keys(masterlist));
```

### Performance Optimization

#### 1. Database Connections
- Use connection pooling in global config
- Implement proper indexing
- Monitor query performance

#### 2. Flow Design
- Minimize transform operations
- Cache frequently accessed data
- Use efficient routing patterns

#### 3. Build Optimization
- Exclude unnecessary files from build
- Use .apiaignore for large assets
- Implement incremental builds

## Contributing

### Development Setup
```bash
# Clone the repository
git clone https://github.com/your-org/apia.git
cd apia

# Install dependencies
npm install

# Start development environment
npm run dev:all
```

### Testing
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Test specific connector
npm run test:connector mysql
```

### Adding New Connectors
1. Create connector file in `package/lib/connectors/`
2. Implement the connector interface
3. Add to connector registry
4. Update GUI components
5. Write tests and documentation

---

## License

MIT License - see LICENSE file for details.
