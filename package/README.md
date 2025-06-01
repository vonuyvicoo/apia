# APIA - API Engine for Enterprise Software

A modular build system for API flow definitions with masterlist generation and reference validation.

## Features

- **Masterlist Generation**: Automatically generates a masterlist.json mapping flow names to their file paths
- **Reference Validation**: Validates that all referenced flows and subflows have corresponding JSON files
- **Duplicate Detection**: Throws build errors if duplicate flow names are found
- **Modular Architecture**: Clean separation of concerns with dedicated modules

## Installation

```bash
npm install
```

## Usage

### CLI Commands

```bash
# Build the project
apia build

# Show help
apia help
```

### Programmatic Usage

```javascript
const { build, generateMasterlist, utils } = require('./lib');

// Build with default options
const result = build();

// Build with custom options
const result = build({
  srcDir: './custom/src',
  buildDir: './custom/build',
  cleanBuild: false
});

// Generate masterlist only
const masterlist = generateMasterlist('./src');
```

## Project Structure

```
package/
├── index.js              # Main CLI entry point
├── lib/
│   ├── index.js          # Library exports
│   ├── builder.js        # Build process logic
│   ├── masterlist.js     # Masterlist generation and validation
│   ├── cli.js            # Command-line interface
│   └── utils.js          # Utility functions
├── package.json
└── README.md
```

## Module Overview

### `lib/builder.js`
Handles the main build process including:
- Copying source files to build directory
- Generating build artifacts
- Managing build configuration

### `lib/masterlist.js`
Manages masterlist generation and validation:
- Traverses flows and subflows directories
- Extracts references from JSON files
- Validates reference integrity
- Detects duplicate definitions

### `lib/cli.js`
Command-line interface logic:
- Argument parsing
- Command routing
- Help system

### `lib/utils.js`
Common utility functions:
- File system operations
- JSON parsing and writing
- Directory traversal

## Build Process

1. **Clean Build Directory**: Removes existing build artifacts
2. **Copy Source Files**: Copies flows and subflows to build directory
3. **Generate Masterlist**: Creates masterlist.json with validation
4. **Copy Configuration**: Copies global config files
5. **Generate Environment**: Creates .env file

## Error Handling

The build system provides detailed error messages for:
- **Missing References**: When referenced flows/subflows don't exist
- **Duplicate Definitions**: When the same flow name exists in multiple files
- **Parse Errors**: When JSON files are malformed
- **Missing Directories**: When expected directories don't exist

## Example Masterlist Output

```json
{
  "main": "flows/main.json",
  "subflow-1": "subflows/subflow-1.json",
  "set-payload-1": "subflows/set-payload-1.json"
}
```

## Development

The package follows a modular architecture for easy maintenance and testing:

- Each module has a single responsibility
- Functions are well-documented with JSDoc
- Error handling is consistent across modules
- Configuration is centralized in the builder module 