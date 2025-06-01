# APIA Framework - Flows and Subflows Documentation

## Table of Contents
1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Recursive Flow Structure](#recursive-flow-structure)
4. [Router Configuration](#router-configuration)
5. [Flow Execution (DFS Traversal)](#flow-execution-dfs-traversal)
6. [Available Connectors](#available-connectors)
7. [Examples](#examples)
8. [Best Practices](#best-practices)

## Overview

The APIA framework uses a **recursive, tree-based architecture** where:
- **Flows and Subflows** have the **SAME structure** - they are both flow definitions that can contain other flows/subflows
- **Execution** uses **Depth-First Search (DFS)** traversal through the flow tree
- **Connectors** are atomic operations (database, HTTP, transformations) that can be embedded anywhere in the tree
- **Decision nodes** provide branching logic within the flow tree

## Project Structure

```
src/
├── flows/
│   └── main.json              # Main flow definition (entry point)
├── subflows/
│   ├── subflow-get-user.json  # Individual flow files (same structure as main)
│   ├── subflow-create-user.json
│   └── ...
└── config/
    ├── router.config.json     # HTTP routing configuration
    └── global-config.json     # Global application settings
```

**Key Insight**: Files in `flows/` and `subflows/` have the **SAME JSON structure**. The distinction is only organizational - `main.json` is the entry point, while `subflows/` contains reusable flow components.

## Recursive Flow Structure

### Universal Flow Schema

**Every flow file** (whether in `flows/` or `subflows/`) follows this recursive structure:

```json
{
  "flow-reference-name": "unique-flow-name",
  "description": "Optional description",
  "router": "router.config.json",  // Only for main flow
  "subflows": [
    // Array of execution steps - can contain:
    
    // 1. Reference to another flow/subflow
    {
      "subflow-reference-name": "another-flow-name"
    },
    
    // 2. Inline connector
    {
      "flow-reference-name": "connector-instance-name",
      "type": "connector",
      "connectorType": "mysql",
      "config": { /* connector config */ }
    },
    
    // 3. Inline decision node
    {
      "flow-reference-name": "decision-instance-name", 
      "type": "decision",
      "conditions": [
        {
          "when": "payload.user.role === 'admin'",
          "goTo": "admin-flow"
        }
      ]
    }
  ]
}
```

### Flow Properties:
- `flow-reference-name`: **Required** - Unique identifier across all flows
- `description`: Optional human-readable description
- `router`: **Only for main flow** - Points to router configuration
- `subflows`: **Required** - Array of execution steps (can be empty)

### Subflow Array Items:
Each item in the `subflows` array can be:

1. **Flow Reference**: `{ "subflow-reference-name": "flow-name" }`
2. **Inline Connector**: `{ "flow-reference-name": "name", "type": "connector", "connectorType": "...", "config": {...} }`
3. **Inline Decision**: `{ "flow-reference-name": "name", "type": "decision", "conditions": [...] }`

## Router Configuration

The router configuration (`src/config/router.config.json`) maps HTTP endpoints to flow entry points:

```json
[
  {
    "method": "post",
    "path": "/users/create",
    "flowReference": "subflow-create-user"
  },
  {
    "method": "get", 
    "path": "/users/:id",
    "flowReference": "subflow-get-user"
  }
]
```

## Flow Execution (DFS Traversal)

The APIA runtime executes flows using **Depth-First Search (DFS)** traversal:

### Execution Algorithm:

1. **Start**: HTTP request arrives → Router maps to initial flow
2. **Load Flow**: Runtime loads flow definition by `flow-reference-name`
3. **Execute**: For each item in `subflows` array (in order):
   
   **If item is a flow reference:**
   - Recursively call `executeFlow(subflow-reference-name, payload)`
   - Wait for completion before proceeding to next item
   
   **If item is an inline connector:**
   - Load connector module by `connectorType`
   - Call `connector.execute(config, payload)`
   - Continue with returned payload
   
   **If item is an inline decision:**
   - Evaluate conditions in order
   - Jump to `goTo` flow when condition matches
   - Recursively execute the target flow

4. **Return**: Final payload bubbles back up the call stack

### DFS Example:

```
main-flow
├── subflow-auth
│   ├── validate-token (connector)
│   └── check-permissions (decision) → admin-flow
│       └── admin-operations
│           ├── mysql-read (connector)
│           └── transform-response (connector)
└── subflow-response
    └── send-json (connector)
```

Execution order: `main-flow` → `subflow-auth` → `validate-token` → `check-permissions` → `admin-flow` → `admin-operations` → `mysql-read` → `transform-response` → `subflow-response` → `send-json`

## Available Connectors

### 1. HTTP Listener (`httpListener`)
Processes incoming HTTP requests and extracts request data.

```json
{
  "flow-reference-name": "http-listener",
  "type": "connector",
  "connectorType": "httpListener"
}
```

### 2. Transform (`transform`)
Executes custom JavaScript code to transform the payload.

```json
{
  "flow-reference-name": "transform-data",
  "type": "connector", 
  "connectorType": "transform",
  "config": {
    "code": "payload.userId = parseInt(payload.params.id); return payload;"
  }
}
```

### 3. MySQL (`mysql`)
Performs database operations.

```json
{
  "flow-reference-name": "mysql-operation",
  "type": "connector",
  "connectorType": "mysql", 
  "config": {
    "method": "read",
    "table": "users",
    "where": {
      "id": "userId"
    }
  }
}
```

### 4. Set Payload (`setPayload`)
Sets specific fields on the payload object.

```json
{
  "flow-reference-name": "set-response",
  "type": "connector",
  "connectorType": "setPayload",
  "config": {
    "fields": {
      "response.statusCode": 200,
      "response.body.message": "Success"
    }
  }
}
```

### 5. Decision (`decision`)
Provides conditional branching logic.

```json
{
  "flow-reference-name": "role-check",
  "type": "decision",
  "conditions": [
    {
      "when": "payload.user.role === 'admin'",
      "goTo": "admin-flow"
    },
    {
      "when": "payload.user.role === 'user'", 
      "goTo": "user-flow"
    }
  ]
}
```

## Examples

### Example 1: Simple Linear Flow

```json
{
  "flow-reference-name": "subflow-get-user",
  "description": "Retrieve a user by ID",
  "subflows": [
    {
      "flow-reference-name": "http-listener",
      "type": "connector",
      "connectorType": "httpListener"
    },
    {
      "flow-reference-name": "extract-user-id", 
      "type": "connector",
      "connectorType": "transform",
      "config": {
        "code": "payload.userId = parseInt(payload.params.id); return payload;"
      }
    },
    {
      "flow-reference-name": "mysql-get-user",
      "type": "connector", 
      "connectorType": "mysql",
      "config": {
        "method": "read",
        "table": "users",
        "where": { "id": "userId" }
      }
    },
    {
      "subflow-reference-name": "format-user-response"
    }
  ]
}
```

### Example 2: Nested Flow with Decision

```json
{
  "flow-reference-name": "subflow-user-operation",
  "description": "Handle user operations with role-based logic",
  "subflows": [
    {
      "subflow-reference-name": "authenticate-user"
    },
    {
      "flow-reference-name": "role-decision",
      "type": "decision", 
      "conditions": [
        {
          "when": "payload.user.role === 'admin'",
          "goTo": "admin-user-operations"
        },
        {
          "when": "payload.user.role === 'user'",
          "goTo": "regular-user-operations"
        }
      ]
    }
  ]
}
```

### Example 3: Complex Nested Structure

```json
{
  "flow-reference-name": "main-flow",
  "description": "Main application flow",
  "router": "router.config.json",
  "subflows": [
    {
      "subflow-reference-name": "global-middleware"
    },
    {
      "subflow-reference-name": "route-handler"
    },
    {
      "subflow-reference-name": "response-formatter"
    }
  ]
}
```

Where `global-middleware` might contain:

```json
{
  "flow-reference-name": "global-middleware",
  "description": "Global request processing",
  "subflows": [
    {
      "flow-reference-name": "cors-handler",
      "type": "connector",
      "connectorType": "setPayload", 
      "config": {
        "fields": {
          "response.headers.Access-Control-Allow-Origin": "*"
        }
      }
    },
    {
      "subflow-reference-name": "rate-limiting"
    },
    {
      "subflow-reference-name": "authentication"
    }
  ]
}
```

## Best Practices

### 1. Flow Organization
- **Main Flow**: Keep simple, delegate to subflows
- **Subflows**: Make them focused and reusable
- **Nesting**: Use reasonable depth (avoid deep nesting)

### 2. Naming Conventions
- Use descriptive `flow-reference-name`: `subflow-get-user`, `validate-input`
- Use consistent prefixes: `subflow-`, `connector-`, `decision-`

### 3. Recursive Design
- **Composition over Inheritance**: Build complex flows from simple, reusable subflows
- **Single Responsibility**: Each flow should have one clear purpose
- **Testability**: Design flows to be testable in isolation

### 4. DFS Considerations
- **Order Matters**: Items in `subflows` array execute sequentially
- **Payload Flow**: Each step receives payload from previous step
- **Error Handling**: Errors bubble up the call stack

### 5. Performance
- **Avoid Deep Recursion**: Very deep flow trees can cause stack overflow
- **Cache Flow Definitions**: Runtime caches loaded flows for performance
- **Minimize Payload Size**: Large payloads slow down execution

## Running Your Application

1. **Start the server:**
   ```bash
   node ../package/index.js run
   ```

2. **Test endpoints:**
   ```bash
   # Health check
   curl -X GET http://localhost:3000/health
   
   # Create user
   curl -X POST http://localhost:3000/users/create \
     -H "Content-Type: application/json" \
     -d '{"name":"John Doe","email":"john@example.com"}'
   
   # Get user  
   curl -X GET http://localhost:3000/users/1
   ```

3. **Monitor execution:**
   The framework logs the DFS traversal, showing which flows and connectors execute in order.

## Summary

The APIA framework's power comes from its **recursive, tree-based architecture**:

- **Flows and subflows are identical** in structure
- **DFS execution** provides predictable, sequential processing
- **Composition** allows building complex applications from simple, reusable components
- **Flexibility** supports inline connectors, flow references, and decision branching

This recursive design enables you to build sophisticated applications while maintaining clarity and reusability at every level. 