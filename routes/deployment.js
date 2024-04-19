const express = require('express');
const router = express.Router();
const config = require('../config.json');
const Docker = require('dockerode');
const fs = require('node:fs');
const path = require('path');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();

const docker = new Docker({ socketPath: config.docker.socket });

router.post('/create', async (req, res) => {
    log.info('deployment in progress...')
    const { Image, Cmd, Env, Ports, Memory, Cpu, Name, PortBindings } = req.body;

    try {
        // Pull the Docker image if not already available
        await docker.pull(Image);

        // Define the volume path
        let volumeId = new Date().getTime().toString();
        const volumePath = path.join(__dirname, '../volumes', volumeId); // Using timestamp for unique dir
        fs.mkdirSync(volumePath, { recursive: true });

        // Create the container with the configuration from the request
        const container = await docker.createContainer({
            Name,
            Image,
            Cmd,
            Env,
            ExposedPorts: Ports,
            HostConfig: {
                PortBindings: PortBindings,
                Binds: [`${volumePath}:/app/data`],  // Setting binds directly here
                Memory: Memory * 1024 * 1024, // Convert MB to Bytes for Docker API
                CpuCount: Cpu  // Number of CPUs (threads)
            }
        });

        // Start the container
        await container.start();

        log.info('deployment completed! container: ' + container.id)
        res.status(201).json({ message: 'Container and volume created successfully', containerId: container.id, volumeId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    const container = docker.getContainer(req.params.id);
    try {
        await container.remove();
        res.status(200).json({ message: 'Container removed successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
