/*
 *           __                          __      __
 *     _____/ /____  ______  ____  _____/ /_____/ /
 *    / ___/ //_/ / / / __ \/ __ \/ ___/ __/ __  / 
 *   (__  ) ,< / /_/ / /_/ / /_/ / /  / /_/ /_/ /  
 *  /____/_/|_|\__, / .___/\____/_/   \__/\__,_/   
 *            /____/_/                        
 * 
 *  Skyport Daemon v1 (Firestorm)
 *  (c) 2024 Matt James and contributers
 * 
*/

/**
 * @fileoverview Main entry file for the Skyport Daemon. This module sets up an
 * Express server integrated with Docker for container management and WebSocket for real-time communication.
 * It includes routes for instance management, deployment, and power control, as well as WebSocket endpoints
 * for real-time container stats and logs. Authentication is enforced using basic authentication.
 * 
 * The server initializes with logging and configuration, sets up middleware for body parsing and authentication,
 * and dynamically handles WebSocket connections for various operational commands and telemetry.
 */
process.env.dockerSocket = process.platform === "win32" ? "//./pipe/docker_engine" : "/var/run/docker.sock";
const express = require('express');
const Docker = require('dockerode');
const basicAuth = require('express-basic-auth');
const bodyParser = require('body-parser');
const CatLoggr = require('cat-loggr');
const WebSocket = require('ws');
const http = require('http');
const fs = require('node:fs');
const path = require('path');
const chalk = require('chalk')
const ascii = fs.readFileSync('./handlers/ascii.txt', 'utf8');
const { exec } = require('child_process');
const { init } = require('./handlers/init.js');
const { seed } = require('./handlers/seed.js');
const { start, createNewVolume } = require('./routes/ftp.js')
const config = require('./config.json');

const docker = new Docker({ socketPath: process.env.dockerSocket });

/**
 * Initializes a WebSocket server tied to the HTTP server. This WebSocket server handles real-time
 * interactions such as authentication, container statistics reporting, logs streaming, and container
 * control commands (start, stop, restart). The WebSocket server checks for authentication on connection
 * and message reception, parsing messages as JSON and handling them according to their specified event type.
 */
const app = express();
const server = http.createServer(app);

const log = new CatLoggr();

/**
 * Sets up Express application middleware for JSON body parsing and basic authentication using predefined
 * user keys from the configuration. Initializes routes for managing Docker instances, deployments, and
 * power controls. These routes are grouped under the '/instances' path.
 */
console.log(chalk.gray(ascii) + chalk.white(`version v${config.version}\n`));
init();
seed();

app.use(bodyParser.json());
app.use(basicAuth({
    users: { 'Skyport': config.key },
    challenge: true
}));

const instanceRouter = require('./routes/instance');
const deploymentRouter = require('./routes/deployment');
const filesystemRouter = require('./routes/filesystem');
const powerRouter = require('./routes/power');

// Use routes
app.use('/instances', instanceRouter);
app.use('/instances', deploymentRouter);
app.use('/instances', powerRouter);

// fs
app.use('/fs', filesystemRouter);

// FTP
start();
app.get('/ftp/info/:id', (req, res) => {
    const filePath = './ftp/user-' + req.params.id + '.json';
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            res.status(500).json({ error: 'Error reading file' });
            return;
        }
        res.json(JSON.parse(data));
    });
});

/**
 * Initializes a WebSocket server tied to the HTTP server. This WebSocket server handles real-time
 * interactions such as authentication, container statistics reporting, logs streaming, and container
 * control commands (start, stop, restart). The WebSocket server checks for authentication on connection
 * and message reception, parsing messages as JSON and handling them according to their specified event type.
 * 
 * @param {http.Server} server - The HTTP server to bind the WebSocket server to.
 */
function initializeWebSocketServer(server) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        let isAuthenticated = false;

        ws.on('message', async (message) => {
            log.debug('got ' + message);
            let msg = {};
            try {
                msg = JSON.parse(message);
            } catch (error) {
                ws.send('Invalid JSON');
                return;
            }

            if (msg.event === 'auth' && msg.args) {
                authenticateWebSocket(ws, req, msg.args[0], (authenticated, containerId) => {
                    if (authenticated) {
                        isAuthenticated = true;
                        handleWebSocketConnection(ws, req, containerId);
                    } else {
                        ws.send('Authentication failed');
                        ws.close(1008, "Authentication failed");
                    }
                });
            } else if (isAuthenticated) {
                const urlParts = req.url.split('/');
                const containerId = urlParts[2];

                if (!containerId) {
                    ws.close(1008, "Container ID not specified");
                    return;
                }

                const container = docker.getContainer(containerId);

                switch (msg.event) {
                    case 'cmd':
                        // Do absolutely fucking nothing. Not handling it here.
                        break;
                    case 'power:start':
                        performPowerAction(ws, container, 'start');
                        break;
                    case 'power:stop':
                        performPowerAction(ws, container, 'stop');
                        break;
                    case 'power:restart':
                        performPowerAction(ws, container, 'restart');
                        break;
                    default:
                        ws.send('Unsupported event');
                        break;
                }
            } else {
                ws.send('Unauthorized access');
                ws.close(1008, "Unauthorized access");
            }
        });

        function authenticateWebSocket(ws, req, password, callback) {
            if (password === config.key) {
                log.info('successful authentication on ws');
                ws.send(`\x1b[36;1m[skyportd] \x1b[0mconsole connected!`);
                const urlParts = req.url.split('/');
                const containerId = urlParts[2];

                if (!containerId) {
                    ws.close(1008, "Container ID not specified");
                    callback(false, null);
                    return;
                }
                callback(true, containerId);
            } else {
                log.warn('authentication failure on websocket!');
                callback(false, null);
            }
        }

        function handleWebSocketConnection(ws, req, containerId) {
            const container = docker.getContainer(containerId);

            container.inspect(async (err, data) => {
                if (err) {
                    ws.send('Container not found');
                    return;
                }

                if (req.url.startsWith('/exec/')) {
                    setupExecSession(ws, container);
                } else if (req.url.startsWith('/stats/')) {
                    setupStatsStreaming(ws, container);
                } else {
                    ws.close(1002, "URL must start with /exec/ or /stats/");
                }
            });
        }

        async function setupExecSession(ws, container) {
            const logStream = await container.logs({
                follow: true,
                stdout: true,
                stderr: true,
                tail: 25
            });

            logStream.on('data', chunk => {
                ws.send(chunk.toString());
            });

            ws.on('message', (msg) => {
                if (isAuthenticated) {
                    const command = JSON.parse(msg).command;
                    executeCommand(ws, container, command);
                }
            });

            ws.on('close', () => {
                logStream.destroy();
                log.info('WebSocket client disconnected');
            });
        }

        function setupStatsStreaming(ws, container) {
            const fetchStats = () => {
                container.stats({ stream: false }, (err, stats) => {
                    if (err) {
                        ws.send(JSON.stringify({ error: 'Failed to fetch stats' }));
                        return;
                    }
                    ws.send(JSON.stringify(stats));
                });
            };
            fetchStats();
            const statsInterval = setInterval(fetchStats, 3000);

            ws.on('close', () => {
                clearInterval(statsInterval);
                log.info('WebSocket client disconnected');
            });
        }

        async function executeCommand(ws, container, command) {
            log.info('Executing command:', command);
            try {
                const stream = await container.attach({
                    stream: true,
                    stdin: true,
                    stdout: true,
                    stderr: true,
                    hijack: true
                });
        
                stream.on('data', (chunk) => {
                    //ws.send(chunk.toString('utf8'));
                });
        
                stream.on('end', () => {
                    log.info('Attach stream ended');
                    ws.send('\nCommand execution completed');
                });
        
                stream.on('error', (err) => {
                    log.error('Attach stream error:', err);
                    ws.send(`Error in attach stream: ${err.message}`);
                });
        
                // Write the command to the stream
                stream.write(command + '\n');
        
            } catch (err) {
                log.error('Failed to attach to container:', err);
                ws.send(`Failed to attach to container: ${err.message}`);
            }
        }

        function performPowerAction(ws, container, action) {
            ws.send(`\u001b[1m\u001b[33m[daemon] \u001b[0mworking on it...`);

            const actionMap = {
                'start': container.start.bind(container),
                'stop': container.kill.bind(container),
                'restart': container.restart.bind(container),
            };

            actionMap[action]((err, data) => {
                if (err) {
                    ws.send(`\u001b[1m\u001b[33m[daemon] \u001b[0maction failed!`);
                    return;
                }
                ws.send(`\u001b[1m\u001b[33m[daemon] \u001b[0mdone! new power state: ${action}`);
            });
        }
    });
}

// Start the websocket server
initializeWebSocketServer(server);

/**
 * Default HTTP GET route that provides basic daemon status information including Docker connectivity
 * and system info. It performs a health check on Docker to ensure it's running and accessible, returning
 * the daemon's status and any pertinent Docker system information in the response.
 */
app.get('/', async (req, res) => {
    try {
        const dockerInfo = await docker.info();  // Fetches information about the docker
        const isDockerRunning = await docker.ping();  // Checks if the docker is up (which it probably is or this will err)

        // Prepare the response object with Docker status
        const response = {
            versionFamily: 1,
            versionRelease: 'skyportd 1.0.0',
            online: true,
            remote: config.remote,
            docker: {
                status: isDockerRunning ? 'running' : 'not running',
                systemInfo: dockerInfo
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Error fetching Docker status:', error);
        res.status(500).json({ error: 'Docker is not running - skyportd will not function properly.' });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something has... gone wrong!');
});

/**
 * Starts the HTTP server with WebSocket support after a short delay, listening on the configured port.
 * Logs a startup message indicating successful listening. This delayed start allows for any necessary
 * initializations to complete before accepting incoming connections.
 */
const port = config.port;
setTimeout(function (){
  server.listen(port, () => {
    log.info('skyportd is listening on port ' + port);
  });
}, 2000);
