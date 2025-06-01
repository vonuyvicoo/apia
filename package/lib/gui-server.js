const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * Start the APIA GUI server with terminal functionality
 * @param {string} projectDir - Project directory
 * @param {number} port - Port to run on
 */
async function startGuiServer(projectDir, port = 3001) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const guiDir = path.join(__dirname, '../gui');
  
  // Start Next.js dev server
  console.log('🔨 Starting Next.js dev server...');
  const nextDevPort = port + 100; // Use a different port for Next.js dev server
  const nextDev = spawn('npm', ['run', 'dev', '--', '--port', nextDevPort.toString()], {
    cwd: guiDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      APIA_PROJECT_DIR: projectDir
    }
  });

  nextDev.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Ready')) {
      console.log('✅ Next.js dev server ready');
    }
  });

  nextDev.stderr.on('data', (data) => {
    console.error('Next.js dev server error:', data.toString());
  });

  // Middleware
  app.use(express.json());

  // API endpoint to get flow data
  app.get('/api/flows', (req, res) => {
    try {
      const srcPath = path.join(projectDir, 'src');
      const flows = readFlowsFromDirectory(srcPath);
      const routerConfig = readRouterConfig(srcPath);
      
      res.json({
        flows,
        routerConfig,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error reading flows:', error);
      res.status(500).json({ error: 'Failed to read flow data' });
    }
  });

  // API endpoint to run APIA commands
  app.post('/api/run', (req, res) => {
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    // Execute APIA command
    const child = spawn('node', [path.join(__dirname, '../index.js'), ...command.split(' ')], {
      cwd: projectDir,
      stdio: 'pipe'
    });

    let output = '';
    let error = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      res.json({
        success: code === 0,
        output,
        error,
        exitCode: code
      });
    });
  });

  // WebSocket for terminal functionality
  io.on('connection', (socket) => {
    console.log('🔌 GUI client connected');
    
    socket.on('run-command', (data) => {
      const { command, workingDir } = data;
      const cwd = workingDir || projectDir;
      console.log(`🚀 Running command: ${command} in ${cwd}`);
      
      // Execute command in specified directory
      const child = spawn('sh', ['-c', command], {
        cwd: cwd,
        stdio: 'pipe'
      });

      // Send output in real-time
      child.stdout.on('data', (data) => {
        socket.emit('command-output', {
          type: 'stdout',
          data: data.toString()
        });
      });

      child.stderr.on('data', (data) => {
        socket.emit('command-output', {
          type: 'stderr',
          data: data.toString()
        });
      });

      child.on('close', (code) => {
        socket.emit('command-complete', {
          exitCode: code,
          success: code === 0
        });
      });

      child.on('error', (error) => {
        socket.emit('command-output', {
          type: 'stderr',
          data: `Error: ${error.message}\n`
        });
        socket.emit('command-complete', {
          exitCode: 1,
          success: false
        });
      });
    });

    socket.on('disconnect', () => {
      console.log('🔌 GUI client disconnected');
    });
  });

  // Proxy all other requests to Next.js dev server
  app.use('*', createProxyMiddleware({
    target: `http://localhost:${nextDevPort}`,
    changeOrigin: true,
    ws: true, // Enable WebSocket proxying
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>APIA Flow Designer</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: system-ui;">
              <div style="text-align: center;">
                <h1>🎨 APIA Flow Designer</h1>
                <p>Starting GUI... Please wait a moment and refresh.</p>
                <p style="color: #666; font-size: 14px;">Next.js dev server is starting up...</p>
                <script>
                  setTimeout(() => window.location.reload(), 3000);
                </script>
              </div>
            </div>
          </body>
        </html>
      `);
    }
  }));

  // Start server
  server.listen(port, () => {
    console.log(`🎨 APIA Flow Designer running at http://localhost:${port}`);
    console.log(`📁 Project directory: ${projectDir}`);
    console.log(`🔧 Next.js dev server on port: ${nextDevPort}`);
    console.log('🔌 Terminal functionality enabled via WebSocket');
    
    // Try to open browser after a delay to let Next.js start
    setTimeout(() => {
      const open = require('open');
      open(`http://localhost:${port}`).catch(() => {
        console.log('💡 Please open http://localhost:' + port + ' in your browser');
      });
    }, 3000);
  });

  // Cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down GUI server...');
    nextDev.kill();
    process.exit(0);
  });

  return server;
}

/**
 * Read flows from directory structure
 */
function readFlowsFromDirectory(srcPath) {
  const flows = {};
  
  const flowsPath = path.join(srcPath, 'flows');
  const subflowsPath = path.join(srcPath, 'subflows');
  
  [flowsPath, subflowsPath].forEach(dir => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        if (file.endsWith('.json')) {
          try {
            const content = fs.readFileSync(path.join(dir, file), 'utf8');
            const flowData = JSON.parse(content);
            if (flowData['flow-reference-name']) {
              flows[flowData['flow-reference-name']] = flowData;
            }
          } catch (error) {
            console.error(`Error reading ${file}:`, error);
          }
        }
      });
    }
  });
  
  return flows;
}

/**
 * Read router configuration
 */
function readRouterConfig(srcPath) {
  const routerPath = path.join(srcPath, 'config', 'router.config.json');
  
  if (fs.existsSync(routerPath)) {
    try {
      const content = fs.readFileSync(routerPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Error reading router config:', error);
    }
  }
  
  return [];
}

module.exports = {
  startGuiServer
}; 