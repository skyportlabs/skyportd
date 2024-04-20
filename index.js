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
const config = require('./config.json');

const dockerSocket = config.docker.socket;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const docker = new Docker({ socketPath: dockerSocket });

const log = new CatLoggr();

// Initialize skyportd
console.log(chalk.gray(ascii) + chalk.white(`version v${config.version}\n`));
init();

app.use(bodyParser.json());
app.use(basicAuth({
    users: { 'Skyport': config.key },
    challenge: true
}));

// Routes
const instanceRouter = require('./routes/instance');
const deploymentRouter = require('./routes/deployment');
const powerRouter = require('./routes/power');

// Use routes
app.use('/instances', instanceRouter);
app.use('/instances', deploymentRouter);
app.use('/instances', powerRouter);

wss.on('connection', (ws) => {
    let isAuthenticated = false;

    ws.on('message', async (message) => {
        let msg = {};
        try {
            msg = JSON.parse(message);
        } catch (error) {
            ws.send('Invalid JSON');
            return;
        }

        if (msg.event === 'auth' && msg.args) {
            const password = msg.args[0];
            if (password === config.key) {
                isAuthenticated = true;
                ws.send('Authentication successful');
            } else {
                ws.send('Authentication failed');
                ws.close(1008, "Authentication failed");
                return;
            }
        } else if (isAuthenticated) {
            const urlParts = ws.upgradeReq.url.split('/');
            const containerId = urlParts[2];

            if (!containerId) {
                ws.close(1008, "Container ID not specified");
                return;
            }

            const container = docker.getContainer(containerId);

            container.inspect(async (err, data) => {
                if (err) {
                    ws.send('Container not found');
                    return;
                }

                if (ws.upgradeReq.url.startsWith('/stats/')) {
                    const fetchStats = () => {
                        container.stats({stream: false}, (err, stats) => {
                            if (err) {
                                ws.send(JSON.stringify({ error: 'Failed to fetch stats' }));
                                return;
                            }
                            ws.send(JSON.stringify(stats));
                        });
                    };
                    fetchStats();
                    const statsInterval = setInterval(fetchStats, 5000);

                    ws.on('close', () => {
                        clearInterval(statsInterval);
                        console.log('Client disconnected');
                    });

                } else if (ws.upgradeReq.url.startsWith('/logs/')) {
                    const logStream = await container.logs({
                        follow: true,
                        stdout: true,
                        stderr: true,
                        tail: 10
                    });

                    logStream.on('data', chunk => {
                        ws.send(chunk.toString());
                    });

                    ws.on('close', () => {
                        logStream.destroy();
                        console.log('Client disconnected');
                    });

                } else {
                    ws.close(1002, "URL must start with either /stats/ or /logs/");
                }
            });
        } else {
            ws.send('Unauthorized access');
            ws.close(1008, "Unauthorized access");
        }
    });
});

app.get('/', async (req, res) => {
    try {
        const dockerInfo = await docker.info();  // Fetches information about the Docker system
        const isDockerRunning = await docker.ping();  // Checks if Docker daemon is running and accessible

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

        res.json(response);  // Send the JSON response
    } catch (error) {
        console.error('Error fetching Docker status:', error);
        res.status(500).json({ error: 'Docker is not running - skyportd will not function properly.' });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something has... gone wrong!');
});

const port = config.port;
setTimeout(function (){
  server.listen(port, () => {
    log.info('skyportd is listening on port ' + port);
  });
}, 2000);