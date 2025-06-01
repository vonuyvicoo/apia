Sanghaya Solutions: APIA
---

### 1. APIA RUNTIME ENGINE (Top-Left)

* **Objective**: Execute a “main flow,” read router config, map subflows to HTTP endpoints, and then run an Express-JS server that listens for incoming requests. When a request arrives, traverse into subflows (nested workflows) using a depth-first search (DFS) approach, executing connector logic step by step.

1. **Execute main flow**
   – At startup, the engine loads a “main.json” (main flow file) that defines the root flow.

2. **Read router config and map subflows to endpoints**
   – There is a separate `api-router-config.json` (or `router.config.json`) that specifies which subflows handle which HTTP methods + paths.
   – The runtime must generate Express-JS routes dynamically based on this config, hooking them to subflows by name.

3. **Run an ExpressJS server**
   – Launch an HTTP listener (e.g., using Express). Each route’s handler invokes the runtime engine’s traversal code.

4. **On listener events, traverse subflows (DFS)**
   – When a request arrives on a given route, the runtime locates the corresponding flow by “flow-reference-name” and begins recursively executing its subflows.
   – Connectors (e.g. database calls, transformations, choice connectors) are atomic steps in a subflow. If one connector triggers further subflows, the engine descends into those before backtracking.

---

### 2. TRAVERSAL OF SUBFLOW (Middle-Left)

1. **Subflows can be placed anywhere**
   – Physically on disk, subflow JSON files may reside in arbitrary subdirectories within a root “/src/subflows” (dev) or “.apia/flows” (build). The runtime cannot assume a flat folder—but it will build a global index.

2. **Global dictionary of subflows**
   – Each subflow JSON has a unique `"flow-reference-name"`. During a build step, the engine scans the `src/flows` and `src/subflows` folders, finds every JSON, and records a mapping `{ flow-reference-name → relative file path }` in a masterlist.

3. **Auto-generate dictionary on build**
   – The build process must traverse all flow files, read their `"flow-reference-name"`, and write out something like `.apia/masterlist.json`. This masterlist is used by the runtime to locate subflow definitions quickly (to avoid filesystem scanning at runtime).

4. **Runtime execution uses masterlist for dispatch**
   – At runtime, whenever the engine needs to “execute” a subflow named X, it looks up X in `masterlist.json`, loads the corresponding file (if not cached), and executes it.

---

### 3. UNIT FLOW FILE STRUCTURE (Top-Center)

* **Schema Sketch** (in conceptual diagram form):

  ```
  ┌──────────────────────┐  
  │  CONNECTOR          │  
  └────▲─────────────────┘  
       │  
  ┌────▼─────────────────┐  
  │  CONNECTOR          │  
  └────▲─────────────────┘  
       │  
  ┌────▼─────────────────┐  
  │  CONNECTOR          │  
  └─────────────────────┘  
  ```

  – Essentially, each “unit flow” JSON is a small directed graph (strictly linear, given the diagram: Connector → Connector → Connector).
  – In practice, each JSON file represents one subflow, and each subflow has:

  * `flow-reference-name` (string)
  * An optional `type` (e.g. `"connector"` or `"decision"`)
  * A list of **connectors** or **further subflows** (possibly in an array called `subflows` or some other key).

* **Implication**: A “unit flow” (subflow) may consist of N steps (each step is either a connector or a nested subflow). Connectors are atomic actions (e.g. do a DB CRUD, transform a payload). If a step is another subflow, the runtime recurses into it.

---

### 4. MAIN FLOW FILE STRUCTURE (Middle-Center)

* **Example JSON Structure**:

  ```jsonc
  {
    "flow-reference-name": "myflow",
    "router": "api-router-config.json",
    "subflows": [
      {
        "subflow-reference-name": "subflow-1"
      },
      {
        "subflow-reference-name": "subflow-2"
      },
      {
        "subflow-reference-name": "subflow-3"
      }
    ]
  }
  ```

  – **`flow-reference-name`**: Unique ID of this top-level flow.
  – **`router`**: Filename (JSON) containing route definitions.
  – **`subflows`**: Array of immediate children. Each array element has a `"subflow-reference-name"`. (In other words, the main flow is a container of N subflows.)

* **Runtime Semantics**:

  1. At startup, the engine loads `main.json`.
  2. It reads `"router": "api-router-config.json"`, loads that config to set up Express routes.
  3. It registers each `"subflow-reference-name"` found in the main flow (but it doesn’t execute them immediately—it simply records them).

---

### 5. MAIN FLOW / UNIT FLOW EXAMPLES (Top-Right & Middle-Right)

* **Main Flow Example** (annotated):

  ```jsonc
  {
    "flow-reference-name": "myflow",
    "router": "api-router-config.json",   // points to route definitions
    "subflows": [
      "subflow-1",
      "subflow-2",
      "subflow-3"
    ]
  }
  // ⇒ At build time, produce main.json → compile into .apia/flows/main.json
  ```

* **Unit Flow Example** (called `ex.json` or `subflow-1.json`):

  ```jsonc
  {
    "flow-reference-name": "subflow-1",
    "subflows": [
      {
        "subflow-reference-name": "mysql-connector-1"
      },
      {
        "subflow-reference-name": "transform-message-1"
      }
    ]
  }
  // This tells the engine: “To run subflow-1, first run connector mysql-connector-1, 
  // then run transform-message-1.” 
  ```

* **Note**: The unit flow example does not explicitly show a `"type"` field for the nested items—implying that if a JSON object in `"subflows"` has no `"type"`, the engine infers from the name that these are connectors. But in other places (e.g. the connector flow example), connectors have `"type": "connector"`. We’ll clarify in the implementation whether we require `"type"` in every subflow item, or infer it from convention (e.g. if the referenced name is registered as a connector in masterlist).

---

### 6. CONNECTOR MODULES (Middle-Left, below Traversal)

* **List of Supported Connector Types** (all accept a standardized “input payload” and produce an “output payload” for the next step):

  1. **MongoDB Connector (CRUD)**
  2. **MySQL Connector (CRUD)**
  3. **PostgreSQL Connector (CRUD)**
  4. **Zoho Connector (CRUD)**
  5. **Salesforce Connector (CRUD)**
  6. **Transform Message** (arbitrary JS or mapping function)
  7. **Set Payload** (set or override fields in the request/response payload)
  8. **HTTP Listener** (listen to incoming HTTP request, provide `req`/`res` objects or partner payload)
  9. **Choice Connector** (decision-making node, with “when” conditions and “goTo” logic)

* **Connector Behavior**:

  * Each connector is **“abstracted”**—meaning the runtime doesn’t know their internal details, only that:

    1. A connector carries a `type` field (e.g. `"type": "connector"` or `"type": "decision"`).
    2. It has a `"config"` object (e.g. database credentials, table name, query filter).
    3. The connector returns some “output payload” that the next node receives as “input payload.”

---

### 7. CONNECTOR FLOW EXAMPLE (Middle-Center, below Connector Modules)

* **Example JSON** (`ex.json` for a connector):

  ```jsonc
  {
    "flow-reference-name": "mysql-connector-1",
    "type": "connector",                  // indicates this node is a DB connector
    "config": global.config.mysql,        // reference to a config object (e.g. connection pool, host, user)
    "method": "create",                   // CRUD operation
    "input": "payload and inserts into db" // descriptive comment
  }
  ```

  – The runtime, upon “executing” this JSON, would:

  1. Instantiate a MySQL client (using `global.config.mysql`).
  2. Execute `INSERT` (because `method: "create"`) using fields extracted from the current “payload.”
  3. Return results (or updated payload) to the next step.

---

### 8. CHOICE CONNECTOR EXAMPLE (Top-Right, under Main Flow Example)

* **Example JSON**:

  ```jsonc
  {
    "flow-reference-name": "subflow-check-role",
    "type": "decision",    // indicates a choice connector
    "conditions": [
      {
        "when": "payload.user.isAdmin === true",
        "goTo": "subflow-admin"
      },
      {
        "when": "payload.user.isAdmin !== true",
        "goTo": "subflow-nonadmin"
      }
    ]
  }
  ```

  – **Semantics**: Evaluate the `conditions` array in order.

  * The runtime must evaluate each `when` expression (likely using `eval()` or a safe JavaScript sandbox given `payload` is available in context).
  * As soon as one `when` is truthy, it jumps to the `goTo` subflow.
  * This is a non-linear (branching) step—unlike simple connector chains, it forks based on logic.

---

### 9. APIA Built Structure (Lower-Center)

After running a build (compilation) step, the output directory looks like:

```
.apia
├── /flows
│     ├── main.json
│     └── subflow-1.json
│     └── subflow-2.json
│     └── … (all flow files)
│
├── /connectors
│     ├── mysql.js
│     ├── zoho.js
│     ├── mongodb.js
│     └── … (one file per connector type)
│
├── api-router-config.json      (compiled router file)
├── masterlist.json             (mapping flow-reference-name → filepath)
└── .env                        (environment variables for connectors, DB creds, etc.)
```

* **Implications**:

  1. The build step has already copied or compiled the “/src/flows” into `.apia/flows`, preserving names.
  2. It has created one aggregated `masterlist.json`.
  3. All connector implementations (JavaScript modules) live under `.apia/connectors`—each exporting a standardized interface (e.g. `execute(config, payload)` → returns Promise < payload >).
  4. The `api-router-config.json` lives at the top of `.apia` so that at runtime, the engine can simply do:

     ```js
     const routerConfig = require('./.apia/api-router-config.json');
     setupExpressRoutes(routerConfig);
     ```
  5. The existence of `.env` in `.apia` indicates that the runtime will load environment variables here (DB host/user/secret tokens, etc.).

---

### 10. APIA Dev Structure (Far Right)

In the **development** directory (pre-build), things look like:

```
/
└── /src
    ├── /flows
    │     └── main.json
    ├── /subflows
    │     └── subflow-1.json
    │     └── subflow-2.json
    │     └── …
    ├── /config
    │     ├── global.config.json   // holds DB URLs, API keys, etc. 
    │     └── router.config.json   // “human-writable” version of api-router config
    └── (possibly other dirs: e.g. /connectors but that’s optional—we could hand-write connectors)
```

* **To Build, run…** (text is partially cut off, but presumably something like `npm run build` or a custom script):

  1. Read all JSON in `/src/flows` and `/src/subflows`.
  2. Validate that each has a unique `flow-reference-name`.
  3. Generate `.apia/flows/*.json` (copy or transform).
  4. Generate `.apia/masterlist.json`.
  5. Copy `src/config/global.config.json` → `.apia/.env` (or read .env directly).
  6. Copy `src/config/router.config.json` → `.apia/api-router-config.json`.
  7. Ensure `/connectors` modules exist under `.apia/connectors` (either copy from `src/connectors` or transpile from TypeScript).
  8. (Optional) Minify or bundle connector code.

---

## Summary of Requirements

1. **Flow Definitions**

   * JSON files with fields:

     * `flow-reference-name` (string, unique)
     * Either:

       1. `"type": "connector"` plus connector-specific fields (`config`, `method`, etc.), **or**
       2. `"type": "decision"` (Choice Connector) with `conditions` array, **or**
       3. An array field (commonly `"subflows": [ … ]`) describing either nested connectors or nested subflow references.

   * The engine must be able to distinguish between a connector node and a subflow reference. In practice:

     * If a JSON object has `"type": "connector"` or `"type": "decision"`, treat it as an atomic connector.
     * Otherwise, if it has `"subflow-reference-name"`, treat it as a pointer to another subflow JSON (which must be looked up in `masterlist.json`).

2. **Directory Layout (Development vs. Build)**

   * **Development**:

     ```
     /src
       /flows
         main.json
       /subflows
         subflow-*.json
       /config
         global.config.json
         router.config.json
       /connectors    (optional: can be hand-written JS/TS modules)
     ```
   * **Build Output (`.apia`)**:

     ```
     .apia
       /flows
         *.json           (all flow + subflow files)
       /connectors
         *.js             (all connector module files)
       api-router-config.json
       masterlist.json
       .env
     ```

3. **Build Process**

   * **Scan** `/src/flows` + `/src/subflows` → Collect every JSON → Validate `flow-reference-name` is unique.
   * **Generate** `.apia/flows/<flow-file>.json` for each (copy or transpile).
   * **Write** `masterlist.json` in `.apia` as:

     ```json
     {
       "myflow": "./flows/main.json",
       "subflow-1": "./flows/subflow-1.json",
       "subflow-check-role": "./flows/subflow-check-role.json",
       ...
     }
     ```
   * **Copy** `src/config/global.config.json` → transform (if necessary) into `.apia/.env` or into a JSON that connectors can read.
   * **Copy** `src/config/router.config.json` → `.apia/api-router-config.json`.
   * **Ensure** `.apia/connectors/*.js` exist—either by copying from `src/connectors` or bundling TypeScript.

4. **Runtime Engine (Node.js + Express)**

   * **Initialize**:

     1. Load environment variables from `.apia/.env` (via `dotenv`).
     2. Load `masterlist.json` into memory (JS object mapping names → file paths).
     3. Load `api-router-config.json`.
     4. Instantiate Express app, then call a helper `registerRoutes(routerConfig)` which:

        * For each entry in `api-router-config.json` (likely an array of `{ method, path, flowReference }`):

          ```js
          app[method](path, async (req, res) => {
            try {
              const initialPayload = { req, res, body: req.body, params: req.params, query: req.query };
              await runtime.executeFlow(flowReference, initialPayload);
            } catch(err) {
              // error handling (400/500)
            }
          });
          ```
     5. Start Express listening on a configured port.

   * **Execution Model**:

     * Expose a function `async executeFlow(flowName: string, payload: object): Promise<object>`.
     * Algorithm (DFS traversal):

       1. **Lookup** `flowName` in `masterlist.json` → get relative file path (e.g. `./flows/subflow-1.json`).
       2. **Require/Read** that JSON file (or, for performance, preload and cache them in a Map).
       3. If the JSON node has `"type": "connector"`, call the corresponding connector implementation (e.g. if name starts with `"mysql-"` or based on a `"connectorType"` field) → return an output payload.
       4. If the JSON node has `"type": "decision"`, evaluate its `conditions`:

          * Iterate `conditions[]` in order, `if (evalCondition(condition.when, payload))`, then `nextFlow = condition.goTo`; break.
          * Recurse: `await executeFlow(nextFlow, payload)`.
       5. If the JSON node has a `"subflows": [ … ]` array, then for each item in that array (in series):

          * Each item may be of form `{ "subflow-reference-name": "XYZ" }` **or** a connector object (with `"type"`).
          * If it’s `{ "subflow-reference-name": "XYZ" }`, simply call `await executeFlow("XYZ", payload)` before moving on.
          * If it’s a connector object (has `"type": "connector"`), call the matching connector module (e.g. `connectors/mysql.js`).
          * Collect the return value of each step, pass it as `payload` into the next step in the array.
       6. Once all array items finish, return the final payload up to the parent call.
       7. Top-level routes (HTTP listener connectors) must eventually call `res.send(...)` or `res.json(...)` (or the listener connector must handle `res` directly—design choice).

   * **Connector Interface**:

     * Each connector module under `.apia/connectors` must export a standardized function, e.g.:

       ```js
       // .apia/connectors/mysql.js
       module.exports = {
         async execute(config, payload) {
           // config = { host, user, password, database, table, etc. }
           // payload = { body, params, query, req, res, … }
           // Perform CRUD, e.g. if config.method === "create", do INSERT, return new payload
           return updatedPayload;
         }
       };
       ```
     * At runtime, the engine must know how to route a connector-type subflow object to the correct module. We could use naming convention: if `flow-reference-name` starts with `"mysql-"`, pick `connectors/mysql.js`. Or, the JSON for a connector can explicitly have `"connectorType": "mysql"` so that the engine knows to load `./connectors/mysql.js`.

5. **Connector Types to Implement**

   * **Database Connectors (CRUD)**:

     1. **MongoDB**: Must use an official Node.js MongoDB client; accept `config` with connection URI, collection name, query/filter, etc.
     2. **MySQL**: Use `mysql2` or `mysql` package; accept `method` (`create | read | update | delete`), `table`, `whereClause` or `payload` fields.
     3. **PostgreSQL**: Use `pg` package; similar to MySQL.
     4. **Zoho**: Use Zoho’s REST APIs; `config` holds API keys and object types.
     5. **Salesforce**: Use Salesforce JS SDK or REST; `config` has credentials (username/password, client ID/secret, etc.).

   * **Transform Message Connector**:

     * Should accept an arbitrary JavaScript snippet or a reference to a named transformation function in `global.config.json`.
     * The JSON might look like:

       ```jsonc
       {
         "flow-reference-name": "transform-message-1",
         "type": "connector",
         "connectorType": "transform",
         "code": "payload.body = { greeting: `Hello, ${payload.body.name}` }; return payload;"
       }
       ```
     * The runtime will `eval()` or run in a sandbox:

       ```js
       const fn = new Function("payload", codeStr);
       const newPayload = await fn(payload);
       return newPayload;
       ```
     * Must guard against infinite loops or malicious code—so ideally run in a restricted context.

   * **Set Payload Connector**:

     * A simple connector that sets specific fields on the payload.

       ```jsonc
       {
         "flow-reference-name": "set-payload-1",
         "type": "connector",
         "connectorType": "setPayload",
         "fields": {
           "payload.user.role": "admin",
           "payload.isVerified": true
         }
       }
       ```
     * Implementation: Use a small utility to set nested keys (e.g. using lodash `_.set()`).

   * **HTTP Listener Connector**:

     * For the **root** flows, routing is handled by Express; but an “HTTP Listener” connector can also appear inside a subflow (if the engine supports chaining multiple HTTP interactions).
     * It would provide the connector with `req` and `res` (or some “partner” URL + method to call). If the connector is used at the top, it can immediately call `res.json(...)` to return to the client.

   * **Choice Connector (Decision)**:

     * Evaluate a set of `conditions[]`. Each has:

       * `when`: a JS boolean expression string referencing `payload`.
       * `goTo`: a `flow-reference-name` string to which to jump.
     * It must short-circuit on the first true `when`. If none match, throw an error or follow a default path (if provided).

---

## Detailed Implementation Plan

Below is a step-by-step roadmap to implement the entire APIA system—from repository layout and build scripts, through connector coding, to runtime orchestration, testing, and deployment.

---

### A. **Project Initialization**

1. **Initialize Git Repository & Package**

   * Create a new folder, e.g. `apiai-engine`.
   * Run `git init`.
   * Create `package.json` via `npm init -y`.
   * Install core dependencies:

     ```bash
     npm install express dotenv body-parser
     npm install mysql2 pg mongodb jsforce axios lodash
     ```

     * **express**: HTTP server.
     * **dotenv**: Load `.env` files for connector configs.
     * **body-parser**: Parse JSON request bodies.
     * **mysql2**, **pg**, **mongodb**, **jsforce** (Salesforce), **axios** (generic HTTP for Zoho, etc.).
     * **lodash**: Utility functions (e.g. `_.set()` to set nested fields).

2. **Set Up Directory Structure (Dev)**
   In the project root, create:

   ```
   /src
     /flows
       main.json
     /subflows
       subflow-1.json
       subflow-2.json
       subflow-check-role.json
       …
     /config
       global.config.json
       router.config.json
     /connectors         (optional—can hand-author custom connector modules here)
   /scripts
     build.js
     validateFlows.js
   .gitignore
   .env.example
   README.md
   ```

   * **.env.example**: template for environment variables (DB credentials, API keys).
   * **scripts/validateFlows.js**: Node script to scan flow definitions and ensure no duplicate `flow-reference-name`.
   * **scripts/build.js**: Node script to perform the build steps (generate `.apia` folder, copy JSONs, create `masterlist.json`, copy configs, etc.).

3. **Populate `src/config`**

   * **`global.config.json`**: A JSON object containing connection settings. For example:

     ```json
     {
       "mysql": {
         "host": "localhost",
         "port": 3306,
         "user": "root",
         "password": "secret",
         "database": "apiai_db"
       },
       "mongodb": {
         "uri": "mongodb://localhost:27017",
         "database": "apiai_mongo"
       },
       "postgresql": {
         "host": "localhost",
         "port": 5432,
         "user": "postgres",
         "password": "supersecret",
         "database": "apiai_pg"
       },
       "zoho": {
         "clientId": "ZOHO_CLIENT_ID",
         "clientSecret": "ZOHO_CLIENT_SECRET",
         "refreshToken": "ZOHO_REFRESH_TOKEN",
         "baseUrl": "https://www.zohoapis.com/crm/v2"
       },
       "salesforce": {
         "username": "sf_user",
         "password": "sf_password+security_token",
         "clientId": "SF_CLIENT_ID",
         "clientSecret": "SF_CLIENT_SECRET",
         "loginUrl": "https://login.salesforce.com"
       }
     }
     ```
   * **`router.config.json`**: Human-readable route configuration. For example:

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
       },
       {
         "method": "put",
         "path": "/users/:id",
         "flowReference": "subflow-update-user"
       }
       // etc.
     ]
     ```

4. **Populate Sample Flow Files in `src/flows` & `src/subflows`**

   * **`src/flows/main.json`**:

     ```jsonc
     {
       "flow-reference-name": "myflow",
       "router": "router.config.json",
       "subflows": [
         { "subflow-reference-name": "subflow-check-role" },      // example
         { "subflow-reference-name": "subflow-create-user" }
       ]
     }
     ```
   * **`src/subflows/subflow-check-role.json`** (Choice Connector Example):

     ```jsonc
     {
       "flow-reference-name": "subflow-check-role",
       "type": "decision",
       "conditions": [
         {
           "when": "payload.body.userRole === 'admin'",
           "goTo": "subflow-admin-logic"
         },
         {
           "when": "payload.body.userRole !== 'admin'",
           "goTo": "subflow-nonadmin-logic"
         }
       ]
     }
     ```
   * **`src/subflows/subflow-create-user.json`** (simple connector chain):

     ```jsonc
     {
       "flow-reference-name": "subflow-create-user",
       "subflows": [
         {
           "flow-reference-name": "http-listener",  // an embedded connector with type “listener”
           "type": "connector",
           "connectorType": "httpListener"
         },
         {
           "flow-reference-name": "mysql-connector-createUser",
           "type": "connector",
           "connectorType": "mysql",
           "method": "create",
           "table": "users",
           "inputMapping": {
             "payload.name": "body.name",
             "payload.email": "body.email"
           }
         },
         {
           "flow-reference-name": "transform-message-welcome",
           "type": "connector",
           "connectorType": "transform",
           "code": "payload.response = { message: `User ${payload.insertedId} created.` }; return payload;"
         }
       ]
     }
     ```
   * **Note**: We use `"flow-reference-name"` redundantly inside connectors just to give each node a unique identifier. Some implementations might omit `flow-reference-name` for connectors and rely purely on naming conventions—either approach must be consistent.

5. **Populate Connector Modules in `src/connectors` (Optional)**

   * If you want to author your own connector code in TypeScript or custom JavaScript (and then copy them to `.apia/connectors` at build time), place them here. For initial scaffolding, you might create stubs:

     ```
     src/connectors/mysql.js
     src/connectors/mongodb.js
     src/connectors/postgresql.js
     src/connectors/zoho.js
     src/connectors/salesforce.js
     src/connectors/transform.js
     src/connectors/setPayload.js
     src/connectors/httpListener.js
     src/connectors/choice.js
     ```
   * Each connector must export an `async execute(config, payload)` function. For instance, `src/connectors/mysql.js`:

     ```js
     // src/connectors/mysql.js
     const mysql = require('mysql2/promise');
     module.exports = {
       async execute(config, payload) {
         const conn = await mysql.createConnection({
           host: config.host,
           user: config.user,
           password: config.password,
           database: config.database
         });
         let result;
         switch (config.method) {
           case "create":
             {
               // assume inputMapping tells us which fields to insert
               const columns = Object.keys(config.inputMapping).map(col => col);
               const values = columns.map(col => {
                 const path = config.inputMapping[col]; // e.g. "body.email"
                 return getNested(payload, path);
               });
               const placeholders = columns.map(_ => "?").join(",");
               const [res] = await conn.execute(
                 `INSERT INTO ${config.table} (${columns.join(",")}) VALUES (${placeholders})`,
                 values
               );
               payload.insertedId = res.insertId;
               result = payload;
             }
             break;
           // handle read | update | delete similarly
           default:
             throw new Error(`Unknown method ${config.method} in mysql connector`);
         }
         await conn.end();
         return result;
       }
     };

     // helper to get nested value (e.g. "body.email" from payload)
     function getNested(obj, path) {
       return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj);
     }
     ```
   * Similarly implement `mongodb.js`, `postgresql.js` (using `pg`), `zoho.js` (using `axios` to call Zoho APIs), `salesforce.js` (using the `jsforce` library).
   * **`transform.js`** might look like:

     ```js
     module.exports = {
       async execute(config, payload) {
         const code = config.code; // raw JS as string
         // Caution: using eval. In production, replace with a proper sandbox.
         const fn = new Function("payload", code);
         const newPayload = await fn(payload);
         return newPayload;
       }
     };
     ```
   * **`setPayload.js`**:

     ```js
     const _ = require("lodash");
     module.exports = {
       async execute(config, payload) {
         // config.fields is an object: { "payload.user.role": "admin", … }
         for (const [fieldPath, value] of Object.entries(config.fields)) {
           _.set(payload, fieldPath, value);
         }
         return payload;
       }
     };
     ```
   * **`httpListener.js`** (used only at the top of a flow to extract `req`/`res`):

     ```js
     module.exports = {
       async execute(config, payload) {
         // In practice, the Express handler already provided payload = { req, res, body, params, query }
         // So this connector might do nothing but return the payload unmodified.
         return payload;
       }
     };
     ```
   * **`choice.js`**:

     ```js
     module.exports = {
       async execute(config, payload) {
         for (const cond of config.conditions) {
           // Evaluate cond.when in the context where “payload” is in scope
           const fn = new Function("payload", `return (${cond.when});`);
           if (await fn(payload)) {
             return { _nextFlow: cond.goTo, payload }; 
             // marker that the runtime should “jump” to cond.goTo with this payload
           }
         }
         throw new Error(`No condition matched in choice connector ${config["flow-reference-name"]}`);
       }
     };
     ```

---

### B. **Validation Script (`scripts/validateFlows.js`)**

Before building, we want to ensure:

1. **No duplicate `flow-reference-name`** across all JSON in `/src/flows` and `/src/subflows`.

2. **Each JSON must have a valid top-level structure**:

   * `"flow-reference-name"`: nonempty string.
   * If `"type"` exists, it must be either `"connector"` or `"decision"`.
   * If `"type": "decision"`, must have `conditions` array with objects `{ when: string, goTo: string }`.
   * If `"type": "connector"`, must have a valid `connectorType`.
   * Otherwise, if no `"type"`, must have `"subflows"`, which is a nonempty array.
   * No unknown fields.

3. **All referenced `"subflow-reference-name"` or `"goTo"`** must correspond to an existing JSON file. (We can check this only after building the masterlist, or in dev mode, scan the directory structure.)

**Outline of `validateFlows.js`:**

```js
/**
 * scripts/validateFlows.js
 * Scans src/flows & src/subflows to validate JSON syntax, ensure uniqueness of flow-reference-name,
 * and verify that all referenced subflows/choice branches actually exist.
 */
const fs = require("fs");
const path = require("path");

const FLOW_DIRS = [
  path.join(__dirname, "../src/flows"),
  path.join(__dirname, "../src/subflows")
];

async function main() {
  const flowMap = new Map(); // flowName → filepath
  const errors = [];

  // 1. Load all flow JSONs
  for (const dir of FLOW_DIRS) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    for (const fname of files) {
      const fullpath = path.join(dir, fname);
      let json;
      try {
        json = JSON.parse(fs.readFileSync(fullpath, "utf8"));
      } catch (e) {
        errors.push(`[${fullpath}] JSON parse error: ${e.message}`);
        continue;
      }
      if (!json["flow-reference-name"] || typeof json["flow-reference-name"] !== "string") {
        errors.push(`[${fullpath}] Missing or invalid flow-reference-name`);
        continue;
      }
      const flowName = json["flow-reference-name"];
      if (flowMap.has(flowName)) {
        errors.push(`Duplicate flow-reference-name "${flowName}" in files: ${flowMap.get(flowName)} and ${fullpath}`);
      } else {
        flowMap.set(flowName, fullpath);
      }
      // Basic structure validation
      if (json.type === "decision") {
        if (!Array.isArray(json.conditions)) {
          errors.push(`[${fullpath}] type="decision" but no conditions array`);
        } else {
          for (const [i, cond] of json.conditions.entries()) {
            if (typeof cond.when !== "string" || typeof cond.goTo !== "string") {
              errors.push(`[${fullpath}].conditions[${i}] must have string 'when' and string 'goTo'`);
            }
          }
        }
      } else if (json.type === "connector") {
        if (!json.connectorType || typeof json.connectorType !== "string") {
          errors.push(`[${fullpath}] type="connector" must have connectorType`);
        }
      } else {
        // Must have subflows
        if (!Array.isArray(json.subflows)) {
          errors.push(`[${fullpath}] Missing 'subflows' array for non-connector, non-decision flow`);
        } else {
          json.subflows.forEach((node, idx) => {
            if (!node["subflow-reference-name"] && !node.type) {
              errors.push(`[${fullpath}].subflows[${idx}] must have either subflow-reference-name or type`);
            }
          });
        }
      }
    }
  }

  // 2. Validate references (subflow-reference-name and choice goTo) only if we want to catch unresolved references now.
  //    For simplicity, we can optionally skip cross-file references until build time.

  if (errors.length) {
    console.error("Validation found errors:");
    errors.forEach(err => console.error("  - " + err));
    process.exit(1);
  } else {
    console.log("All flow files passed validation.");
  }
}

main();
```

* **Usage**: `node scripts/validateFlows.js`
* **Hook**: In `package.json`, add a script:

  ```json
  "scripts": {
    "validate": "node scripts/validateFlows.js",
    ...
  }
  ```

---

### C. **Build Script (`scripts/build.js`)**

The build script’s job is to:

1. **Create** a fresh `.apia` directory (deleting any existing one).
2. **Scan** `src/flows` + `src/subflows` → build a `masterlist.json`.
3. **Copy** each flow JSON into `.apia/flows/` preserving filenames.
4. **Copy** `src/config/global.config.json` → `.apia/.env` (possibly converting JSON keys into environment variables).
5. **Copy** `src/config/router.config.json` → `.apia/api-router-config.json`.
6. **Copy or transpile** connector modules from `src/connectors/` → `.apia/connectors/`.
7. **Report** success (or exit with error code if any step fails).

**Detailed Steps:**

```js
/**
 * scripts/build.js
 * Compiles all flow definitions, copies connector modules, and creates the .apia directory structure.
 */

const fs = require("fs");
const path = require("path");
const rimraf = require("rimraf"); // npm install rimraf
const dotenv = require("dotenv");

const SRC_DIR = path.join(__dirname, "../src");
const BUILD_DIR = path.join(__dirname, "../.apia");
const FLOW_SRC_DIRS = [
  path.join(SRC_DIR, "flows"),
  path.join(SRC_DIR, "subflows")
];
const FLOW_DEST_DIR = path.join(BUILD_DIR, "flows");
const CONNECTOR_SRC_DIR = path.join(SRC_DIR, "connectors");
const CONNECTOR_DEST_DIR = path.join(BUILD_DIR, "connectors");
const CONFIG_DIR = path.join(SRC_DIR, "config");

async function main() {
  // 1. Remove existing .apia folder if it exists
  if (fs.existsSync(BUILD_DIR)) {
    rimraf.sync(BUILD_DIR);
  }
  fs.mkdirSync(BUILD_DIR);
  fs.mkdirSync(FLOW_DEST_DIR);
  fs.mkdirSync(CONNECTOR_DEST_DIR);

  // 2. Scan flow files and build masterlist
  const masterlist = {};
  for (const srcDir of FLOW_SRC_DIRS) {
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".json"));
    for (const fname of files) {
      const srcPath = path.join(srcDir, fname);
      const json = JSON.parse(fs.readFileSync(srcPath, "utf8"));
      const flowName = json["flow-reference-name"];
      if (!flowName) {
        console.error(`[BUILD ERROR] Flow file ${srcPath} missing flow-reference-name.`);
        process.exit(1);
      }
      const destPath = `./flows/${fname}`; // relative path inside .apia
      if (masterlist[flowName]) {
        console.error(`[BUILD ERROR] Duplicate flow-reference-name ${flowName} in ${srcPath}`);
        process.exit(1);
      }
      masterlist[flowName] = destPath;

      // Copy flow JSON to .apia/flows
      const content = JSON.stringify(json, null, 2);
      fs.writeFileSync(path.join(FLOW_DEST_DIR, fname), content, "utf8");
    }
  }

  // 3. Write masterlist.json
  fs.writeFileSync(
    path.join(BUILD_DIR, "masterlist.json"),
    JSON.stringify(masterlist, null, 2),
    "utf8"
  );
  console.log(`[BUILD] masterlist.json created with ${Object.keys(masterlist).length} entries.`);

  // 4. Copy router.config.json → api-router-config.json
  const routerSrc = path.join(CONFIG_DIR, "router.config.json");
  const routerDest = path.join(BUILD_DIR, "api-router-config.json");
  if (!fs.existsSync(routerSrc)) {
    console.error("[BUILD ERROR] Missing router.config.json in src/config");
    process.exit(1);
  }
  fs.copyFileSync(routerSrc, routerDest);
  console.log("[BUILD] api-router-config.json copied.");

  // 5. Copy global.config.json → .env (or just copy the JSON)
  const globalConfigSrc = path.join(CONFIG_DIR, "global.config.json");
  if (!fs.existsSync(globalConfigSrc)) {
    console.error("[BUILD ERROR] Missing global.config.json in src/config");
    process.exit(1);
  }
  // Option A: Convert JSON to .env style
  const globalConfig = JSON.parse(fs.readFileSync(globalConfigSrc, "utf8"));
  const envLines = [];
  for (const [section, settings] of Object.entries(globalConfig)) {
    for (const [key, value] of Object.entries(settings)) {
      // e.g. MYSQL_HOST=localhost
      const upperKey = `${section.toUpperCase()}_${key.toUpperCase()}`;
      envLines.push(`${upperKey}=${value}`);
    }
  }
  fs.writeFileSync(path.join(BUILD_DIR, ".env"), envLines.join("\n"), "utf8");
  console.log("[BUILD] .env created from global.config.json.");

  // 6. Copy connector modules
  if (fs.existsSync(CONNECTOR_SRC_DIR)) {
    const connectorFiles = fs.readdirSync(CONNECTOR_SRC_DIR).filter(f => f.endsWith(".js"));
    for (const file of connectorFiles) {
      fs.copyFileSync(
        path.join(CONNECTOR_SRC_DIR, file),
        path.join(CONNECTOR_DEST_DIR, file)
      );
    }
    console.log(`[BUILD] Copied ${connectorFiles.length} connector modules.`);
  } else {
    console.warn("[BUILD WARNING] No src/connectors directory found. Connectors must exist in .apia/connectors for runtime to work.");
  }

  console.log("[BUILD] Build completed successfully. Output directory: .apia/");
}

main().catch(err => {
  console.error("[BUILD ERROR]", err);
  process.exit(1);
});
```

* **Usage**: `node scripts/build.js`
* **Hook in `package.json`**:

  ```json
  "scripts": {
    "validate": "node scripts/validateFlows.js",
    "build": "npm run validate && node scripts/build.js"
  }
  ```

---

### D. **Runtime Engine Implementation (`src/runtime.js`)**

This module lives in the root of the project (next to `scripts/`) or in `src/` and will be compiled/copied to `.apia/runtime.js`. It is responsible for:

1. **Loading** `.apia/masterlist.json` into a `Map<string, string>`.
2. **Preloading/Caching** flow JSONs on first access (to avoid repeated disk I/O).
3. **Providing** an `executeFlow(flowName: string, payload: object)` method that performs DFS/traversal.
4. **Dynamically loading** connector modules from `.apia/connectors/<connectorType>.js` when needed.

**File: `src/runtime.js`**

```js
/**
 * src/runtime.js
 * Core runtime for executing APIA flows.
 */
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const _ = require("lodash");

// 1. Initialize environment
dotenv.config({ path: path.resolve(__dirname, "../.apia/.env") });

// 2. Load masterlist
const MASTERLIST_PATH = path.resolve(__dirname, "../.apia/masterlist.json");
let masterlist;
try {
  masterlist = JSON.parse(fs.readFileSync(MASTERLIST_PATH, "utf8"));
} catch (e) {
  console.error(`[Runtime Error] Could not load masterlist.json: ${e.message}`);
  process.exit(1);
}

// 3. Cache for flow JSONs
const flowCache = new Map(); // flowName → parsed JSON object

/**
 * Load and cache a flow (subflow) JSON by name
 */
function loadFlowDefinition(flowName) {
  if (flowCache.has(flowName)) {
    return flowCache.get(flowName);
  }
  const relativePath = masterlist[flowName];
  if (!relativePath) {
    throw new Error(`Flow "${flowName}" not found in masterlist.json`);
  }
  const absPath = path.resolve(__dirname, "../.apia", relativePath);
  const json = JSON.parse(fs.readFileSync(absPath, "utf8"));
  flowCache.set(flowName, json);
  return json;
}

/**
 * Dynamically load a connector module given its connectorType
 */
function loadConnectorModule(connectorType) {
  const modulePath = path.resolve(__dirname, "../.apia/connectors", `${connectorType}.js`);
  if (!fs.existsSync(modulePath)) {
    throw new Error(`Connector module for type "${connectorType}" not found at ${modulePath}`);
  }
  // Clear require cache to allow hot-reload if desired (optional)
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

/**
 * Evaluate a JavaScript boolean expression in the context of the payload.
 * WARNING: This uses Function() for dynamic evaluation. In production, consider a secure sandbox.
 */
function evalCondition(conditionStr, payload) {
  const fn = new Function("payload", `return (${conditionStr});`);
  return fn(payload);
}

/**
 * executeFlow: Recursively execute a flow (connector chain / decision / nested subflows)
 * @param {string} flowName - Unique name of the flow to run
 * @param {object} payload - Arbitrary payload object (carries HTTP req, res, body, etc.)
 * @returns {Promise<object>} - Resolves to the final payload after all steps
 */
async function executeFlow(flowName, payload) {
  const flowDef = loadFlowDefinition(flowName);

  // If this node is a decision connector
  if (flowDef.type === "decision") {
    // Load choice.js connector
    const choiceModule = loadConnectorModule("choice");
    const choiceResult = await choiceModule.execute(flowDef, payload);
    /*
      choiceResult is expected to be { _nextFlow: string, payload: object }
      so we jump to the nextFlow
    */
    if (!choiceResult._nextFlow) {
      throw new Error(`Choice connector "${flowName}" returned no _nextFlow`);
    }
    return executeFlow(choiceResult._nextFlow, choiceResult.payload);
  }

  // If this node is an atomic connector
  if (flowDef.type === "connector") {
    const connectorType = flowDef.connectorType;
    const module = loadConnectorModule(connectorType);
    // The connector’s own config is likely embedded under flowDef (or loaded from global config)
    const config = flowDef.config || {};
    const resultPayload = await module.execute(config, payload);
    // If the connector wants to “jump” to another flow (rare, but possible), check for a marker
    if (resultPayload && resultPayload._nextFlow) {
      const nextFlow = resultPayload._nextFlow;
      delete resultPayload._nextFlow;
      return executeFlow(nextFlow, resultPayload);
    }
    return resultPayload;
  }

  // Otherwise, assume flowDef has a "subflows" array
  if (Array.isArray(flowDef.subflows)) {
    let currentPayload = payload;
    for (const node of flowDef.subflows) {
      if (node["subflow-reference-name"]) {
        // Simple nested subflow reference
        const childName = node["subflow-reference-name"];
        currentPayload = await executeFlow(childName, currentPayload);
      } else if (node.type === "connector") {
        // Inline connector definition (rare, but supported if user places a connector object directly)
        const connectorType = node.connectorType;
        const module = loadConnectorModule(connectorType);
        const config = node.config || {};
        currentPayload = await module.execute(config, currentPayload);
      } else if (node.type === "decision") {
        // Inline choice connector
        const choiceMod = loadConnectorModule("choice");
        const choiceResult = await choiceMod.execute(node, currentPayload);
        if (!choiceResult._nextFlow) {
          throw new Error(`Inline choice connector in flow "${flowName}" did not specify _nextFlow`);
        }
        currentPayload = await executeFlow(choiceResult._nextFlow, choiceResult.payload);
      } else {
        throw new Error(`Invalid node inside "subflows" of "${flowName}": ${JSON.stringify(node)}`);
      }
    }
    return currentPayload;
  }

  // If we reach here, the flowDef is malformed
  throw new Error(`Flow "${flowName}" has no valid execution path (no type, no subflows)`);
}

module.exports = {
  executeFlow
};
```

---

### E. **Express App & HTTP Server (`src/index.js`)**

This is the entry point. It will:

1. **Require** the runtime module (`runtime.js`).
2. **Load** the `api-router-config.json` from `.apia`.
3. **Set up** Express and dynamic routes.
4. **Start** the server.

```js
/**
 * src/index.js
 * Entry point: boots runtime, registers routes, and starts Express.
 */
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const { executeFlow } = require("./runtime");

(async function main() {
  const app = express();
  app.use(bodyParser.json()); // parse JSON bodies

  // 1. Load router config
  const routerConfigPath = path.resolve(__dirname, "../.apia/api-router-config.json");
  let routerConfig;
  try {
    routerConfig = JSON.parse(require("fs").readFileSync(routerConfigPath, "utf8"));
  } catch (e) {
    console.error(`[Startup Error] Cannot load router config: ${e.message}`);
    process.exit(1);
  }

  // 2. Register each route
  routerConfig.forEach(route => {
    const method = route.method.toLowerCase();
    const endpoint = route.path;
    const targetFlow = route.flowReference;

    if (!app[method]) {
      console.warn(`[Router Warning] Unsupported method: ${method} in router config. Skipping.`);
      return;
    }

    console.log(`[Router] Registering ${method.toUpperCase()} ${endpoint} → ${targetFlow}`);
    app[method](endpoint, async (req, res) => {
      // Construct initial payload
      const initialPayload = {
        req,
        res,
        body: req.body,
        params: req.params,
        query: req.query,
        headers: req.headers
      };
      try {
        const finalPayload = await executeFlow(targetFlow, initialPayload);
        // If the flow never wrote to res, send something by default
        if (!res.headersSent) {
          // User may have set finalPayload.response
          if (finalPayload && finalPayload.response !== undefined) {
            res.json(finalPayload.response);
          } else {
            res.json({ status: "OK", result: finalPayload });
          }
        }
      } catch (err) {
        console.error(`[Runtime Error] Flow "${targetFlow}" failed: ${err.stack}`);
        if (!res.headersSent) {
          res.status(500).json({ error: err.message });
        }
      }
    });
  });

  // 3. Default route (optional)
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // 4. Start listening
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`APIA Runtime Engine listening on port ${port}`);
  });
})();
```

* **Build Step**: Copy `src/index.js` into `.apia/index.js` (or simply run `node src/index.js` after build).
* **Run**:

  1. `npm run build`
  2. `node src/index.js` (or from `.apia`: `node index.js` if you copy files in build)

---

### F. **Connector Module Details**

Below is a more thorough sketch of each connector, its expected JSON properties, and how the runtime invokes it. These will ultimately live under `.apia/connectors/*.js`.

---

#### **F.1. MySQL Connector (`mysql.js`)**

* **Expected JSON** (example):

  ```jsonc
  {
    "flow-reference-name": "mysql-connector-createUser",
    "type": "connector",
    "connectorType": "mysql",
    "method": "create",
    "table": "users",
    "inputMapping": {
      "name": "body.name",
      "email": "body.email",
      "role": "payload.role"      // any nested path
    },
    "outputMapping": {
      "insertedId": "payload.insertedId"
    }
  }
  ```
* **Implementation**:

  ```js
  // .apia/connectors/mysql.js
  const mysql = require("mysql2/promise");
  const _ = require("lodash");

  module.exports = {
    async execute(config, payload) {
      // config: { method, table, inputMapping, outputMapping, other DB settings may come from process.env }
      const dbConfig = {
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        port: process.env.MYSQL_PORT || 3306
      };
      const conn = await mysql.createConnection(dbConfig);
      let newPayload = { ...payload };

      switch (config.method) {
        case "create":
          {
            const columns = Object.keys(config.inputMapping);
            const values = columns.map(col => {
              const path = config.inputMapping[col];
              return _.get(payload, path.replace(/^payload\./, "").replace(/^body\./, "body."));
            });
            const placeholders = columns.map(_ => "?").join(",");
            const [res] = await conn.execute(
              `INSERT INTO ${config.table} (${columns.join(",")}) VALUES (${placeholders})`,
              values
            );
            newPayload.insertedId = res.insertId;
            // Optionally do outputMapping
            if (config.outputMapping) {
              for (const [outKey, outPath] of Object.entries(config.outputMapping)) {
                _.set(newPayload, outPath.replace(/^payload\./, ""), newPayload[outKey]);
              }
            }
          }
          break;
        case "read":
          {
            // e.g. config.whereClause: "id = ?"; config.whereParams: ["body.id"]
            let queryStr = `SELECT * FROM ${config.table}`;
            let results;
            if (config.whereClause) {
              const params = config.whereParams.map(pth => _.get(payload, pth.replace(/^payload\./, "")));
              queryStr += ` WHERE ${config.whereClause}`;
              [results] = await conn.query(queryStr, params);
            } else {
              [results] = await conn.query(queryStr);
            }
            newPayload.queryResult = results;
          }
          break;
        case "update":
          {
            // e.g. config.setFields: { "name": "body.name", "email": "body.email" }
            const setCols = Object.keys(config.setFields);
            const setVals = setCols.map(col => _.get(payload, config.setFields[col].replace(/^payload\./, "")));
            const setClause = setCols.map(col => `${col} = ?`).join(",");
            // config.whereClause, config.whereParams same as read
            const whereParams = config.whereParams.map(pth => _.get(payload, pth.replace(/^payload\./, "")));
            const [result] = await conn.execute(
              `UPDATE ${config.table} SET ${setClause} WHERE ${config.whereClause}`,
              [...setVals, ...whereParams]
            );
            newPayload.affectedRows = result.affectedRows;
          }
          break;
        case "delete":
          {
            // config.whereClause, config.whereParams
            const whereParams = config.whereParams.map(pth => _.get(payload, pth.replace(/^payload\./, "")));
            const [result] = await conn.execute(
              `DELETE FROM ${config.table} WHERE ${config.whereClause}`,
              whereParams
            );
            newPayload.deletedRows = result.affectedRows;
          }
          break;
        default:
          throw new Error(`Unknown method ${config.method} in MySQL connector`);
      }

      await conn.end();
      return newPayload;
    }
  };
  ```
* **Key Points**:

  * All DB credentials come from environment variables (which the build script created from `global.config.json`).
  * Input/Output mapping uses `lodash.get`/`lodash.set` to pull from `payload` or `payload.body`.
  * After each operation, attach results (e.g. `insertedId`, `queryResult`, `affectedRows`) to `payload` for subsequent connectors.

---

#### **F.2. MongoDB Connector (`mongodb.js`)**

* **Expected JSON** (example):

  ```jsonc
  {
    "flow-reference-name": "mongo-connector-insertLog",
    "type": "connector",
    "connectorType": "mongodb",
    "collection": "logs",
    "method": "create",
    "inputMapping": {
      "message": "body.message",
      "createdAt": "body.timestamp"
    }
  }
  ```
* **Implementation**:

  ```js
  // .apia/connectors/mongodb.js
  const { MongoClient } = require("mongodb");
  const _ = require("lodash");

  module.exports = {
    async execute(config, payload) {
      const mongoUri = process.env.MONGODB_URI; // e.g. "mongodb://localhost:27017"
      const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
      await client.connect();
      const dbName = process.env.MONGODB_DATABASE;
      const db = client.db(dbName);
      const collection = db.collection(config.collection);

      let newPayload = { ...payload };

      switch (config.method) {
        case "create":
          {
            const doc = {};
            for (const [key, path] of Object.entries(config.inputMapping)) {
              _.set(doc, key, _.get(payload, path.replace(/^payload\./, "").replace(/^body\./, "")));
            }
            const result = await collection.insertOne(doc);
            newPayload.insertedId = result.insertedId.toString();
          }
          break;
        case "read":
          {
            const filter = {};
            for (const [key, path] of Object.entries(config.filterMapping || {})) {
              _.set(filter, key, _.get(payload, path.replace(/^payload\./, "").replace(/^body\./, "")));
            }
            const docs = await collection.find(filter).toArray();
            newPayload.queryResult = docs;
          }
          break;
        case "update":
          {
            const filter = {};
            for (const [key, path] of Object.entries(config.filterMapping || {})) {
              _.set(filter, key, _.get(payload, path.replace(/^payload\./, "").replace(/^body\./, "")));
            }
            const update = { $set: {} };
            for (const [key, path] of Object.entries(config.updateMapping || {})) {
              _.set(update.$set, key, _.get(payload, path.replace(/^payload\./, "").replace(/^body\./, "")));
            }
            const result = await collection.updateMany(filter, update);
            newPayload.modifiedCount = result.modifiedCount;
          }
          break;
        case "delete":
          {
            const filter = {};
            for (const [key, path] of Object.entries(config.filterMapping || {})) {
              _.set(filter, key, _.get(payload, path.replace(/^payload\./, "").replace(/^body\./, "")));
            }
            const result = await collection.deleteMany(filter);
            newPayload.deletedCount = result.deletedCount;
          }
          break;
        default:
          throw new Error(`Unknown MongoDB method ${config.method}`);
      }

      await client.close();
      return newPayload;
    }
  };
  ```

---

#### **F.3. PostgreSQL Connector (`postgresql.js`)**

* Similar to MySQL connector, but leveraging the `pg` package.
* **Expected JSON**:

  ```jsonc
  {
    "flow-reference-name": "pg-connector-getOrders",
    "type": "connector",
    "connectorType": "postgresql",
    "method": "read",
    "table": "orders",
    "filterMapping": {
      "customer_id": "body.customerId"
    }
  }
  ```
* **Implementation**:

  ```js
  // .apia/connectors/postgresql.js
  const { Pool } = require("pg");
  const _ = require("lodash");

  module.exports = {
    async execute(config, payload) {
      const pool = new Pool({
        host: process.env.POSTGRESQL_HOST,
        user: process.env.POSTGRESQL_USER,
        password: process.env.POSTGRESQL_PASSWORD,
        database: process.env.POSTGRESQL_DATABASE,
        port: process.env.POSTGRESQL_PORT || 5432
      });
      let client;
      try {
        client = await pool.connect();
        let newPayload = { ...payload };

        switch (config.method) {
          case "read":
            {
              const keys = Object.keys(config.filterMapping || {});
              let queryStr = `SELECT * FROM ${config.table}`;
              let params = [];
              if (keys.length) {
                const clauses = keys.map((k, idx) => {
                  const val = _.get(payload, config.filterMapping[k].replace(/^payload\./, "").replace(/^body\./, ""));
                  params.push(val);
                  return `${k} = $${idx + 1}`;
                });
                queryStr += ` WHERE ` + clauses.join(" AND ");
              }
              const res = await client.query(queryStr, params);
              newPayload.queryResult = res.rows;
            }
            break;
          // handle create | update | delete analogously
          default:
            throw new Error(`Unsupported PostgreSQL method ${config.method}`);
        }
        return newPayload;
      } finally {
        if (client) client.release();
        pool.end();
      }
    }
  };
  ```

---

#### **F.4. Zoho Connector (`zoho.js`)**

* **Use Case**: Interact with Zoho CRM (or other Zoho services) via REST API.
* **Authentication**: Using OAuth 2.0 refresh token to obtain access token, then call endpoints.
* **Expected JSON** (example):

  ```jsonc
  {
    "flow-reference-name": "zoho-connector-createLead",
    "type": "connector",
    "connectorType": "zoho",
    "module": "Leads",
    "method": "create",
    "inputMapping": {
      "Company": "body.company",
      "Last_Name": "body.lastName",
      "First_Name": "body.firstName",
      "Email": "body.email"
    }
  }
  ```
* **Implementation**:

  ```js
  // .apia/connectors/zoho.js
  const axios = require("axios");
  const _ = require("lodash");
  let cachedAccessToken = null;
  let tokenExpiry = 0;

  async function getAccessToken() {
    const now = Date.now() / 1000;
    if (cachedAccessToken && now < tokenExpiry) {
      return cachedAccessToken;
    }
    // Fetch new token using refresh token from ENV
    const params = new URLSearchParams();
    params.append("refresh_token", process.env.ZOHO_REFRESH_TOKEN);
    params.append("client_id", process.env.ZOHO_CLIENT_ID);
    params.append("client_secret", process.env.ZOHO_CLIENT_SECRET);
    params.append("grant_type", "refresh_token");

    const resp = await axios.post("https://accounts.zoho.com/oauth/v2/token", params);
    const data = resp.data;
    cachedAccessToken = data.access_token;
    tokenExpiry = now + data.expires_in - 60; // buffer 1 min
    return cachedAccessToken;
  }

  module.exports = {
    async execute(config, payload) {
      const token = await getAccessToken();
      const apiBase = process.env.ZOHO_BASE_URL; // e.g. "https://www.zohoapis.com/crm/v2"
      const headers = { Authorization: `Zoho-oauthtoken ${token}` };
      let newPayload = { ...payload };

      const data = {};
      for (const [key, path] of Object.entries(config.inputMapping || {})) {
        _.set(data, key, _.get(payload, path.replace(/^payload\./, "").replace(/^body\./, "")));
      }

      switch (config.method) {
        case "create":
          {
            const resp = await axios.post(`${apiBase}/${config.module}`, { data: [ data ] }, { headers });
            newPayload.zohoResult = resp.data;
          }
          break;
        case "update":
          {
            const id = _.get(payload, config.idMapping);
            const resp = await axios.put(`${apiBase}/${config.module}/${id}`, { data: [ data ] }, { headers });
            newPayload.zohoResult = resp.data;
          }
          break;
        case "get":
          {
            const id = _.get(payload, config.idMapping);
            const resp = await axios.get(`${apiBase}/${config.module}/${id}`, { headers });
            newPayload.zohoResult = resp.data;
          }
          break;
        default:
          throw new Error(`Unsupported Zoho method ${config.method}`);
      }
      return newPayload;
    }
  };
  ```

---

#### **F.5. Salesforce Connector (`salesforce.js`)**

* **Use Case**: Use JSForce to authenticate (username–password OAuth) and call Salesforce REST APIs.
* **Expected JSON**:

  ```jsonc
  {
    "flow-reference-name": "salesforce-connector-createAccount",
    "type": "connector",
    "connectorType": "salesforce",
    "sobject": "Account",
    "method": "create",
    "inputMapping": {
      "Name": "body.accountName",
      "Phone": "body.phone"
    }
  }
  ```
* **Implementation**:

  ```js
  // .apia/connectors/salesforce.js
  const jsforce = require("jsforce");
  const _ = require("lodash");
  let conn;
  let connPromise;

  async function getConnection() {
    if (conn) return conn;
    if (connPromise) return connPromise;
    connPromise = (async () => {
      const connection = new jsforce.Connection({
        loginUrl: process.env.SALESFORCE_LOGIN_URL
      });
      await connection.login(
        process.env.SALESFORCE_USERNAME,
        process.env.SALESFORCE_PASSWORD
      );
      return connection;
    })();
    conn = await connPromise;
    return conn;
  }

  module.exports = {
    async execute(config, payload) {
      const connection = await getConnection();
      let newPayload = { ...payload };
      const sobject = connection.sobject(config.sobject);
      switch (config.method) {
        case "create":
          {
            const record = {};
            for (const [key, path] of Object.entries(config.inputMapping || {})) {
              _.set(record, key, _.get(payload, path.replace(/^payload\./, "").replace(/^body\./, "")));
            }
            const resp = await sobject.create(record);
            newPayload.salesforceResult = resp;
          }
          break;
        case "find":
          {
            // config.query: "SELECT Id, Name FROM Account WHERE Name = '{body.accountName}'"
            // We replace placeholders in config.query
            let queryStr = config.query.replace(/\{(.+?)\}/g, (_, group) => {
              return _.get(payload, group.replace(/^payload\./, "").replace(/^body\./, ""));
            });
            const resp = await connection.query(queryStr);
            newPayload.salesforceResult = resp.records;
          }
          break;
        // handle update/delete similarly
        default:
          throw new Error(`Unsupported Salesforce method ${config.method}`);
      }
      return newPayload;
    }
  };
  ```

---

#### **F.6. Transform Message Connector (`transform.js`)**

* **Expected JSON**:

  ```jsonc
  {
    "flow-reference-name": "transform-message-welcome",
    "type": "connector",
    "connectorType": "transform",
    "code": "payload.response = { greeting: `Welcome ${payload.body.name}!` }; return payload;"
  }
  ```
* **Implementation**: (same as sketch above)

  ```js
  // .apia/connectors/transform.js
  module.exports = {
    async execute(config, payload) {
      const code = config.code; // raw JS snippet
      const fn = new Function("payload", code);
      const returned = fn(payload);
      // If code returns a Promise or direct object, await it
      if (returned && typeof returned.then === "function") {
        return await returned;
      }
      return returned || payload;
    }
  };
  ```

---

#### **F.7. Set Payload Connector (`setPayload.js`)**

* **Expected JSON**:

  ```jsonc
  {
    "flow-reference-name": "set-isVerified",
    "type": "connector",
    "connectorType": "setPayload",
    "fields": {
      "user.isVerified": true,
      "response.status": "pending"
    }
  }
  ```
* **Implementation**:

  ```js
  // .apia/connectors/setPayload.js
  const _ = require("lodash");
  module.exports = {
    async execute(config, payload) {
      for (const [fieldPath, value] of Object.entries(config.fields || {})) {
        _.set(payload, fieldPath, value);
      }
      return payload;
    }
  };
  ```

---

#### **F.8. HTTP Listener Connector (`httpListener.js`)**

* Because Express already populates `req`, `res`, `body`, `params`, `query` in the initial payload, this connector may simply be a no-op that returns `payload` unchanged. But in more complex workflows, you might want to initiate an **outgoing** HTTP request to a third-party API. In that case, rename it to something like “httpRequest” and use `axios` to call other services. For this plan, assume the HTTP listener is only at the very top, so:

  ```js
  // .apia/connectors/httpListener.js
  module.exports = {
    async execute(config, payload) {
      // Do nothing, just return what we received
      return payload;
    }
  };
  ```

---

#### **F.9. Choice Connector (`choice.js`)**

* **Expected JSON**:

  ```jsonc
  {
    "flow-reference-name": "subflow-check-role",
    "type": "decision",
    "conditions": [
      { "when": "payload.body.userRole === 'admin'", "goTo": "subflow-admin" },
      { "when": "payload.body.userRole !== 'admin'", "goTo": "subflow-nonadmin" }
    ]
  }
  ```
* **Implementation**: (same as sketch above)

  ```js
  // .apia/connectors/choice.js
  module.exports = {
    async execute(config, payload) {
      for (const cond of config.conditions) {
        const fn = new Function("payload", `return (${cond.when});`);
        const result = fn(payload);
        if (result) {
          return { _nextFlow: cond.goTo, payload };
        }
      }
      throw new Error(`Choice connector "${config["flow-reference-name"]}" found no matching condition.`);
    }
  };
  ```

---

### G. **Error Handling & Logging**

1. **Flow-Level Errors**

   * If **any** connector throws an exception or rejects, we catch it in the Express handler and respond with HTTP 500 (unless the connector itself handled the `res`).
   * Each connector should attach additional context to errors (e.g. include `flow-reference-name`, `connectorType`) for debugging.

2. **Invalid Flow Definitions**

   * During **build**, `scripts/validateFlows.js` should catch structural issues.
   * At **runtime**, if a flow JSON misses a required field (e.g. a connector without `connectorType`), `executeFlow` should throw a descriptive error.

3. **Missing Connector Implementation**

   * If `loadConnectorModule(connectorType)` can’t find a matching JS file, throw an error at startup or the moment that connector is first invoked.

4. **Logging**

   * Use a simple console-based logging (stdout/stderr). If desired, swap out for a more robust logger (e.g. `winston`, `pino`).
   * Log at each major step:

     * “Starting execution of flow X”
     * “Invoking connector Y of type Z with config {…}”
     * “Choice connector Y → jumping to flow W”
     * “Connector Y returned payload {…}” (optional, can be verbose)
     * “Flow X completed, returning payload {…}”

---

### H. **Testing Strategy**

1. **Unit Tests for Connector Modules**

   * For each connector (`mysql.js`, `mongodb.js`, etc.), write tests that:

     * Supply dummy `config` and `payload` (perhaps using a test DB) → assert correct output.
     * Mock external dependencies (e.g. use a test MySQL instance or an in-memory MongoDB).
   * Use a testing framework like **Jest** or **Mocha/Chai**.

2. **Integration Tests for Flows**

   * Spin up the Express server on a random port (e.g. using `supertest`) and send HTTP requests to defined endpoints.
   * For example:

     ```js
     const request = require("supertest");
     const { app, closeServer } = require("../.apia/index"); // if we export the express app for testing

     describe("API Flow Tests", () => {
       afterAll(async () => {
         await closeServer();
       });

       test("POST /users/create should create a user", async () => {
         const resp = await request(app)
           .post("/users/create")
           .send({ name: "Alice", email: "alice@example.com" });
         expect(resp.status).toBe(200);
         expect(resp.body).toHaveProperty("message", expect.stringContaining("created"));
       });
     });
     ```
   * Mock external services (Zoho, Salesforce) using request-intercepting libraries (e.g. `nock`) so tests do not hit real APIs.

3. **Flow Validation Tests**

   * Write tests that intentionally break a flow (e.g. reference a non-existent subflow in a choice connector) → ensure that `validateFlows.js` or runtime throws an expected error.

---

### I. **Documentation & Examples**

1. **Write a Clear README**

   * Overview of “What is APIA?”

   * **Getting Started**:

     1. Install dependencies: `npm install`
     2. Copy `.env.example` → `.env` and fill in credentials.
     3. Write your flows in `/src/flows` and `/src/subflows`.
     4. Define connector logic in `/src/connectors`.
     5. Define `global.config.json` with your connection settings.
     6. Define `router.config.json` with your route mappings.
     7. Run `npm run build`.
     8. Run `node src/index.js` to start server.

   * **Flow Definition Reference**: Document the JSON schema for:

     * Top-level flow files (`flow-reference-name`, `router`, `subflows`).
     * Unit flows / subflows (connectors, nested subflows).
     * Connector JSON fields for each connector type (MySQL, MongoDB, Zoho, Salesforce, transform, setPayload, choice).

   * **Connector Development Guide**:

     * How to write a new connector (export an `execute(config, payload)` function).
     * How to configure credentials (via `global.config.json` → `.env`).

   * **Best Practices**:

     * Keep connectors small and single-purpose.
     * Validate inputs early in a “validate-input” flow.
     * Use choice connectors to split logic by user role, config flags, etc.

2. **Inline Comments in Code**

   * Ensure every function in `runtime.js`, `index.js`, and connector modules has descriptive JSDoc comments.
   * Example:

     ```js
     /**
      * executeFlow
      * Recursively executes a flow definition identified by flowName.
      * 
      * @param {string} flowName - The unique identifier of the flow to run.
      * @param {object} payload - Arbitrary context object (e.g. req, res, body).
      * @returns {Promise<object>} - Resolves to the payload after all steps complete.
      */
     async function executeFlow(flowName, payload) { … }
     ```

---

### J. **Deployment & Operations**

1. **Dockerization** (optional but recommended)

   * **Dockerfile** (simple Node image):

     ```dockerfile
     FROM node:16-alpine

     WORKDIR /usr/src/app

     COPY package*.json ./
     RUN npm install --production

     # Copy the rest of the code
     COPY . .

     # Build flows & connectors
     RUN npm run build

     # Expose port (optional: use ENV PORT)
     EXPOSE 3000

     # Start the server from the .apia folder
     CMD ["node", "src/index.js"]
     ```
   * **.dockerignore**:

     ```
     node_modules
     .git
     .apia
     src
     scripts
     *.md
     ```
   * Then:

     ```bash
     docker build -t apiai-engine .
     docker run -d -p 3000:3000 --env-file .env apiai-engine
     ```

2. **Environment Configuration**

   * **During Build**: `.env` is created from `global.config.json`. If any sensitive credentials are needed, they should be injected at container runtime via `--env-file .env`.
   * **Port**: `process.env.PORT` or default `3000`.

3. **Monitoring & Logging**

   * In production, consider piping logs from `console.log` and `console.error` into a centralized log aggregator (e.g. ELK stack or a managed service).
   * Each connector should emit meaningful log messages (e.g. “MySQL: Inserted row with ID = X” or “Choice: payload.user.isAdmin = false, jumping to subflow-nonadmin”). Use log levels (info, warn, error).

4. **Error Notifications**

   * If a critical flow fails (e.g. DB is down), the error stack should appear in logs. Optionally, integrate Sentry (or similar) to capture unhandled exceptions.

5. **Scaling**

   * Because the runtime is stateless (apart from DB connections), deploy behind a load balancer.
   * Use connection pooling in DB connectors to avoid too many open connections.
   * For high throughput, consider caching frequently used flows in memory (the current `flowCache` does this).

---

### K. **Putting It All Together: Step-by-Step Implementation Timeline**

Below is a chronological sequence of tasks, from initial scaffolding to final deployment:

1. **Day 1: Set Up Repository & Basic Structure**

   * Initialize Git, `package.json`.
   * Create `/src/flows`, `/src/subflows`, `/src/config`, `/scripts`, `/src/connectors`.
   * Write a minimal “Hello World” flow and a trivial `httpListener` connector:

     * `src/flows/main.json` calls one subflow that immediately sets `res.json({ hello: "world" })`.
     * Confirm that the Express server starts and returns “Hello World” at `/test` route.

2. **Day 2: Implement Build & Validation Scripts**

   * Write `scripts/validateFlows.js` and ensure it catches duplicate flow names.
   * Write `scripts/build.js` that:

     * Deletes existing `.apia` folder.
     * Copies flow JSONs → `.apia/flows`.
     * Generates `masterlist.json`.
     * Copies `router.config.json`, `global.config.json` → `.apia/.env`.
     * Copies connector stubs → `.apia/connectors`.
   * Run `npm run build` and inspect `.apia` folder; ensure everything is in place.

3. **Day 3: Implement Runtime Engine (`src/runtime.js`)**

   * Write `loadFlowDefinition`, `loadConnectorModule`, and skeleton of `executeFlow`.
   * Hard-code one connector (e.g. `httpListener`) to test the recursion:

     * Create a test flow that calls `httpListener` → next step is to set a JSON response.
     * Call `executeFlow("myflow", { req, res, body: {...}, params: {...}, query: {...} })` and confirm the flow logic runs.
   * Log each step for visibility.

4. **Day 4: Build Connector Modules**

   * Flesh out **MySQL**, **MongoDB**, **PostgreSQL** connector modules, using minimal sample DB (e.g. local SQLite for testing, then switch to real DB later).
   * Implement **Transform** connector with a safe `new Function` approach.
   * Implement **Set Payload** connector.
   * Implement **Choice** connector.
   * Write basic unit tests for each connector (unrelated to Express) to verify correct logic.

5. **Day 5: Integrate Runtime + Connectors + Express**

   * Write `src/index.js` (Express app).
   * Load `api-router-config.json` dynamically, register routes.
   * For each route, call `executeFlow(...)`.
   * Create a sample `router.config.json` with 2–3 routes, and sample subflows in `/src/subflows`.
   * Run `npm run build` → `node src/index.js`, then call the endpoints via `curl` or Postman.
   * Confirm that:

     * Route is registered.
     * Initial connector is `httpListener`, so the `payload` has `req`, `res`, etc.
     * Next connector (e.g. `mysql-connector-createUser`) writes to DB.
     * Transform connector builds a response.
     * Express sends the final payload.

6. **Day 6: Implement Advanced Connectors (Zoho, Salesforce)**

   * Implement Zoho connector with test account / sandbox.
   * Implement Salesforce connector with sandbox org or scratch org.
   * Write flow files that:

     * Retrieve data from Zoho/Salesforce.
     * Branch on results (use choice connector).
     * Write back to DB or to another system.

7. **Day 7: Complete Choice Connector Logic & Error Handling**

   * Ensure choice connector can handle nested subflows with multiple conditions.
   * Add fallback or default `else` condition if none match.
   * Enhance runtime to catch if a choice returns no `_nextFlow` (throw descriptive error).
   * Add logging around “Entering flow X” and “Exiting flow X with payload { … }”.

8. **Day 8: Comprehensive Testing**

   * Write unit tests (Jest) for each connector outside of the Express context.
   * Write integration tests (using `supertest`) for HTTP routes.
   * Write tests for “edge cases”:

     * Flow references a non-existent connector.
     * Choice connector’s `when` is invalid JS.
     * Database is down (simulate by providing wrong credentials).

9. **Day 9: Documentation & Examples**

   * Flesh out the **README.md**.
   * Provide one or two full example flows:

     1. **User Signup Flow**:

        * HTTP Listener → Check if email already exists (MySQL read) → If exists, Choice connector returns 400 with “Email in use.” → else: Create user (MySQL create) → Send welcome email (use a hypothetical “email” connector or an HTTP request to an email service) → Transform final payload
     2. **Order Processing Flow**:

        * HTTP Listener → Read order from DB (PostgreSQL) → Choice connector (if `order.status == "pending"`) → call Zoho CRM to create a lead → Update order status in DB → send response.

10. **Day 10: Deployment & Dockerization**

    * Write **Dockerfile**.
    * Build Docker image (`docker build -t apiai-engine .`).
    * Run container locally, ensure it passes environment variables from host.
    * Test in a staging environment (cloud VM, Kubernetes, or similar).
    * Set up readiness/liveness probes if deploying in Kubernetes (e.g. a health check route `/health` that simply returns 200).
    * Monitor logs and fix any runtime errors.

11. **Beyond Day 10: Ongoing Enhancements**

    * **Runtime Performance**:

      * Cache frequently used flows in memory (already done via `flowCache`).
      * Use connection pooling for DB connectors instead of opening/closing on each invocation (pool clients in a singleton).
    * **Security**:

      * Sanitize/validate any user-provided payload before passing into a `new Function(...)` for the transform connector. Possibly use a safe JS sandbox (e.g. `vm2`).
      * Ensure environment variables (stored in `.env`) are never committed.
      * Add authentication/authorization in Express (e.g. JWT middleware) before triggering flows.
    * **Observability**:

      * Integrate with a metrics library (e.g. Prometheus client) to track:

        * Number of flow executions per endpoint.
        * Average duration of each connector.
        * Error rates.
      * Add structured logging (including correlation IDs for each request).

---

## Final Deliverable: Detailed Checklist

Below is a concise, but comprehensive to-do list to track implementation progress. Each bullet can be ticked off as you complete it.

1. **Project & Repository Setup**

   * [ ] Initialize Git, create `package.json`.
   * [ ] Install dependencies (Express, DB clients, Axios, lodash, dotenv, etc.).
   * [ ] Create directory skeleton: `/src/flows`, `/src/subflows`, `/src/config`, `/src/connectors`, `/scripts`.

2. **Configuration Files**

   * [ ] `src/config/global.config.json` with DB, Zoho, Salesforce credentials.
   * [ ] `src/config/router.config.json` with route definitions.
   * [ ] `.env.example` template for environment variables.
   * [ ] Example `.gitignore` to exclude `node_modules` and `.apia`.

3. **Flow Definitions (Dev)**

   * [ ] Create `src/flows/main.json` referencing top-level subflows.
   * [ ] Create several `src/subflows/*.json` for:

     * A simple connector chain.
     * Choice connector.
     * Nested subflows (subflow calls another subflow which calls connectors).
   * [ ] Ensure each file has a unique `"flow-reference-name"`.

4. **Connector Stubs (Dev)**

   * [ ] Scaffold `src/connectors/mysql.js`, `mongodb.js`, `postgresql.js`, `zoho.js`, `salesforce.js`, `transform.js`, `setPayload.js`, `httpListener.js`, `choice.js`.
   * [ ] In each stub, export `async execute(config, payload)` that throws “Not Implemented” for now.

5. **Validation Script**

   * [ ] Write `scripts/validateFlows.js` to scan flow JSONs, ensure unique names, correct structure.
   * [ ] Hook into `package.json` as `npm run validate`.

6. **Build Script**

   * [ ] Write `scripts/build.js`:

     * Remove existing `.apia`.
     * Copy flows → `.apia/flows`.
     * Generate `masterlist.json`.
     * Copy `router.config.json` → `.apia/api-router-config.json`.
     * Copy `global.config.json` → `.apia/.env`.
     * Copy connectors → `.apia/connectors`.
   * [ ] Hook into `package.json` as `npm run build` (which first runs `npm run validate`).

7. **Runtime Engine**

   * [ ] Implement `src/runtime.js`:

     * Load `.apia/masterlist.json`.
     * `loadFlowDefinition`, `loadConnectorModule`.
     * `executeFlow` with DFS logic for:

       * **Decision** connectors.
       * **Connector** connectors.
       * **`subflows[]`** array nodes (recursion).
   * [ ] Test `executeFlow` manually in a Node REPL with a trivial flow.

8. **Express App**

   * [ ] Implement `src/index.js`:

     * Load `api-router-config.json`.
     * Register routes dynamically (`app[method](path, handler)`).
     * In each handler, assemble `initialPayload` and call `executeFlow`.
     * Send `res.json(...)` or `res.send(...)` based on final payload.
   * [ ] Test with a “Hello World” flow first.

9. **Connector Implementations (Full)**

   * [ ] Finish `mysql.js` connector (CRUD methods, input/output mapping).
   * [ ] Finish `mongodb.js` connector (CRUD).
   * [ ] Finish `postgresql.js` connector.
   * [ ] Finish `zoho.js` connector (OAuth2 flow + REST calls).
   * [ ] Finish `salesforce.js` connector (JSForce, login + sObject ops).
   * [ ] Finish `transform.js` connector (`new Function(...)`).
   * [ ] Finish `setPayload.js` connector (`lodash.set`).
   * [ ] Finish `httpListener.js` connector (no-op).
   * [ ] Finish `choice.js` connector (evaluate conditions + return `_nextFlow`).

10. **Basic Integration Testing**

    * [ ] Create sample flows:

      1. **User Creation** (HTTP → MySQL → Transform → respond).
      2. **Role Check** (HTTP → choice connector → branch to admin vs nonadmin subflows).
      3. **Multi-DB Flow** (HTTP → PostgreSQL read → if not found → MySQL create).
    * [ ] Run `npm run build && node src/index.js`; exercise via `curl`/Postman.
    * [ ] Verify that:

      * Express registers correct routes.
      * DFS traversal of subflows occurs.
      * Connectors run in order, payload is passed properly.

11. **Automated Testing**

    * [ ] Install **Jest** or **Mocha**.
    * [ ] Write **unit tests** for each connector:

      * MySQL: Insert, Read, Update, Delete.
      * MongoDB: Insert, Query, Update, Delete.
      * PostgreSQL: Query.
      * Zoho/Salesforce: Use `nock` to mock HTTP.
      * Transform: Evaluate simple code, verify payload change.
      * SetPayload: Verify nested keys are set.
      * Choice: Provide a payload that matches a condition → ensure correct `_nextFlow`.
    * [ ] Write **integration tests** for Express routes (`supertest`).
    * [ ] Add test scripts to `package.json` (e.g. `"test": "jest"`).

12. **Documentation**

    * [ ] Write **README.md**: overview, install, run, flow reference, connector specs.
    * [ ] Document each connector’s JSON schema.
    * [ ] Provide a couple of fully fleshed sample flows.
    * [ ] Optionally create a `docs/` folder with rendered HTML or Markdown pages.

13. **Docker & CI/CD**

    * [ ] Create **Dockerfile**.
    * [ ] Ensure environment variables are passed at runtime (via `.env`).
    * [ ] Add `.dockerignore`.
    * [ ] Set up a day 1 CI pipeline (e.g. GitHub Actions) to:

      * Run `npm run validate`.
      * Run `npm test`.
      * Build the Docker image.
      * (Optional) Push to a container registry if tests pass.

14. **Production Readiness**

    * [ ] Integrate a proper **connection pool** for DB connectors.
    * [ ] Securely handle the “transform” connector—use a safe JS sandbox (e.g. `vm2`) or restrict code to simple templates (avoid arbitrary `new Function`).
    * [ ] Add **input validation** steps in flows to avoid SQL injection, malicious payloads.
    * [ ] Enhance logging (structured with correlation IDs).
    * [ ] Set up monitoring/metrics (e.g. Prometheus client in Node).
    * [ ] Create a `/health` route that simply returns 200 (for Kubernetes liveness probes).
    * [ ] Set up a rolling-update deployment in your chosen environment (AWS ECS, Kubernetes, Heroku, etc.).

---

## Conclusion

This exhaustive plan covers every phase of building, testing, and deploying the APIA runtime engine as depicted in the provided image:

1. **Analyzed** the diagram to understand the abstract design:

   * Flows composed of connectors or nested subflows, identified by `flow-reference-name`.
   * A build process that compiles JSON files into a single `.apia` folder with a `masterlist.json`.
   * A runtime engine (Node.js + Express) that dynamically sets up routes and traverses flows DFS.
   * Connector modules (DB, transform, decision, etc.) that perform atomic actions on a “payload” object.

2. **Outlined** a concrete directory structure (dev vs. build), configuration files, and naming conventions to ensure clarity and consistency.

3. **Detailed** the **build** step (`scripts/build.js`), which generates `.apia/flows`, copies connectors, and writes out `masterlist.json`.

4. **Specified** the **runtime engine** design (`src/runtime.js`), including:

   * Loading and caching flow definitions.
   * A general `executeFlow` function that handles:

     * **`type: "connector"`** nodes → load connector module → run.
     * **`type: "decision"`** nodes → choice logic → jump to another flow.
     * **`subflows[]`** arrays → iterate each item, recursing or invoking connectors.
   * Error handling and payload propagation.

5. **Enumerated** **connector implementations** for MySQL, MongoDB, PostgreSQL, Zoho, Salesforce, Transform, SetPayload, HTTP Listener, and Choice. Each connector’s expected JSON schema is described, and sample code sketches are provided for each.

6. **Elaborated** on **Express** setup (`src/index.js`), which reads `api-router-config.json`, registers routes, constructs the initial payload (`req, res, body, params, query`), invokes `executeFlow`, and finally sends a JSON response.

7. **Outlined** **testing** (unit + integration), **documentation**, and **deployment** (Docker) strategies to ensure production readiness.

By following this plan step by step, a development team can implement the entire APIA architecture—validating flows, building the runtime, writing connectors, and deploying a robust, JSON-driven workflow engine that operates over HTTP endpoints. Once complete, adding new connectors or flows is simply a matter of authoring JSON files and implementing (or customizing) the connector modules—no further changes to the core engine are needed.
