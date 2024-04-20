/**
 * @fileoverview Handles container deployment and removal via Docker. This module sets up routes
 * to create and delete Docker containers based on configurations provided through HTTP requests.
 * Utilizes Dockerode for Docker API interactions to manage container lifecycle, including image
 * pulling, container creation, starting, and deletion.
 */

const express = require('express');
const router = express.Router();
const config = require('../config.json');
const Docker = require('dockerode');
const fs = require('node:fs');
const path = require('path');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();

const docker = new Docker({ socketPath: config.docker.socket });

/**
 * POST /create
 * Creates and starts a new Docker container with specifications provided in the request body.
 * The specifications include Docker image, command, environment variables, port bindings,
 * memory, and CPU allocation. Also handles the creation of a unique volume for persistent data.
 * Logs the deployment process and returns the newly created container's ID and volume ID upon success.
 *
 * @param {Object} req - The HTTP request object, containing body with container specs.
 * @param {Object} res - The HTTP response object used to return status and container info.
 * @returns {Response} JSON response with success message and container details or error message.
 */
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
            name: Name,
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
        log.error('deployment failed')
        res.status(500).json({ message: err.message });
    }
});

/**
 * DELETE /:id
 * Removes a Docker container identified by the ID provided in the URL parameter. This endpoint
 * handles the complete removal of the container, ensuring that all associated resources are cleaned up.
 * Returns a success message if the container is removed successfully or an error message if the removal fails.
 *
 * @param {Object} req - The HTTP request object, containing the container ID as a URL parameter.
 * @param {Object} res - The HTTP response object used to return the operation's success or error message.
 * @returns {Response} JSON response with success or error message depending on the outcome of the deletion.
 */
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
