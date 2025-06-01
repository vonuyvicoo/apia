/**
 * MySQL Connector
 * Handles MySQL database operations (CRUD)
 */
const mysql = require('mysql2/promise');

module.exports = {
  /**
   * Execute MySQL operation
   * @param {Object} config - Connector configuration
   * @param {string} config.host - Database host
   * @param {number} config.port - Database port
   * @param {string} config.user - Database user
   * @param {string} config.password - Database password
   * @param {string} config.database - Database name
   * @param {string} config.table - Table name
   * @param {string} config.method - CRUD method (create, read, update, delete)
   * @param {Object} config.where - WHERE conditions for read/update/delete
   * @param {Object} config.inputMapping - Field mapping for create/update operations
   * @param {Object} payload - Current payload
   * @returns {Promise<Object>} Updated payload with database results
   */
  async execute(config, payload) {
    console.log('      🗄️  MySQL: Executing database operation...');
    
    try {
      // Create MySQL connection
      const connection = await mysql.createConnection({
        host: config.host || 'localhost',
        port: config.port || 3306,
        user: config.user || 'root',
        password: config.password || '',
        database: config.database
      });
      
      const method = config.method || 'read';
      const table = config.table || 'default_table';
      
      console.log(`      📊 MySQL operation: ${method.toUpperCase()} on table "${table}"`);
      
      let result;
      
      switch (method.toLowerCase()) {
        case 'create':
          {
            const inputMapping = config.inputMapping || {};
            const columns = Object.keys(inputMapping);
            const values = columns.map(column => {
              const path = inputMapping[column];
              return getNestedValue(payload, path);
            });
            
            const placeholders = columns.map(() => '?').join(',');
            const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
            
            console.log(`      📝 SQL: ${sql}`);
            console.log(`      📊 Values:`, values);
            
            const [insertResult] = await connection.execute(sql, values);
            
            result = {
              insertId: insertResult.insertId,
              affectedRows: insertResult.affectedRows
            };
            
            console.log(`      ✅ Created record with ID: ${result.insertId}`);
            
            // Add result to payload
            payload.insertedId = result.insertId;
            payload.dbResult = result;
          }
          break;
          
        case 'read':
          {
            let sql = `SELECT * FROM ${table}`;
            let values = [];
            
            if (config.where) {
              const whereConditions = [];
              for (const [column, path] of Object.entries(config.where)) {
                whereConditions.push(`${column} = ?`);
                values.push(getNestedValue(payload, path));
              }
              sql += ` WHERE ${whereConditions.join(' AND ')}`;
            }
            
            console.log(`      📝 SQL: ${sql}`);
            console.log(`      📊 Values:`, values);
            
            const [rows] = await connection.execute(sql, values);
            
            result = {
              rows: rows,
              count: rows.length
            };
            
            console.log(`      ✅ Retrieved ${result.count} records`);
            
            // Add result to payload
            payload.dbResult = result;
          }
          break;
          
        case 'update':
          {
            const inputMapping = config.inputMapping || {};
            const setColumns = Object.keys(inputMapping);
            const setValues = setColumns.map(column => {
              const path = inputMapping[column];
              return getNestedValue(payload, path);
            });
            
            const setClause = setColumns.map(column => `${column} = ?`).join(',');
            let sql = `UPDATE ${table} SET ${setClause}`;
            let values = [...setValues];
            
            if (config.where) {
              const whereConditions = [];
              for (const [column, path] of Object.entries(config.where)) {
                whereConditions.push(`${column} = ?`);
                values.push(getNestedValue(payload, path));
              }
              sql += ` WHERE ${whereConditions.join(' AND ')}`;
            }
            
            console.log(`      📝 SQL: ${sql}`);
            console.log(`      📊 Values:`, values);
            
            const [updateResult] = await connection.execute(sql, values);
            
            result = {
              affectedRows: updateResult.affectedRows,
              changedRows: updateResult.changedRows
            };
            
            console.log(`      ✅ Updated ${result.affectedRows} records`);
            
            // Add result to payload
            payload.dbResult = result;
          }
          break;
          
        case 'delete':
          {
            let sql = `DELETE FROM ${table}`;
            let values = [];
            
            if (config.where) {
              const whereConditions = [];
              for (const [column, path] of Object.entries(config.where)) {
                whereConditions.push(`${column} = ?`);
                values.push(getNestedValue(payload, path));
              }
              sql += ` WHERE ${whereConditions.join(' AND ')}`;
            }
            
            console.log(`      📝 SQL: ${sql}`);
            console.log(`      📊 Values:`, values);
            
            const [deleteResult] = await connection.execute(sql, values);
            
            result = {
              affectedRows: deleteResult.affectedRows
            };
            
            console.log(`      ✅ Deleted ${result.affectedRows} records`);
            
            // Add result to payload
            payload.dbResult = result;
          }
          break;
          
        default:
          throw new Error(`Unsupported MySQL method: ${method}`);
      }
      
      // Close connection
      await connection.end();
      
      return payload;
      
    } catch (error) {
      console.error('      ❌ MySQL operation failed:', error.message);
      throw new Error(`MySQL connector failed: ${error.message}`);
    }
  }
};

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to get value from
 * @param {string} path - Dot notation path (e.g., 'request.body.name' or 'payload.id')
 * @returns {*} Value at path
 */
function getNestedValue(obj, path) {
  // If path starts with 'payload.', create a context with payload reference
  if (path.startsWith('payload.')) {
    const context = { payload: obj };
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, context);
  }
  
  // Otherwise, use the object directly (for paths like 'id', 'request.body.name', etc.)
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
} 