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

wss.on('connection', (ws, req) => {
    const urlParts = req.url.split('/');
    const containerId = urlParts[2];

    if (!req.url.startsWith('/logs/')) {
        ws.close(1002, "URL must start with /logs/");
        return;
    }

    if (!containerId) {
        ws.close(1008, "Container ID not specified");
        return;
    }

    const container = docker.getContainer(containerId);

    // Check if the container exists and is running
    container.inspect((err, data) => {
        if (err) {
            ws.send('Container not found');
            return;
        }

        // Set up a function to execute commands inside the container
        const executeCommand = (command) => {
            container.exec({
                AttachStdin: true,
                AttachStdout: true,
                AttachStderr: true,
                Cmd: ['/bin/sh', '-c', command],
                Tty: false
            }, (err, exec) => {
                if (err) {
                    ws.send('Failed to execute command');
                    return;
                }

                exec.start({ hijack: true, stdin: true }, (err, stream) => {
                    if (err) {
                        ws.send('Execution error');
                        return;
                    }

                    stream.on('data', (data) => {
                        ws.send(data.toString());
                    });
                });
            });
        };

        ws.on('message', message => {
            console.log('Received command:', message);
            executeCommand(message);
        });
    });

    ws.on('close', () => {
        console.log('Client disconnected');
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