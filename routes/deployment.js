/**
 * @fileoverview Handles container deployment and removal via Docker. This module sets up routes
 * to create and delete Docker containers based on configurations provided through HTTP requests.
 * Utilizes Dockerode for Docker API interactions to manage container lifecycle, including image
 * pulling, container creation, starting, and deletion.
 */

const express = require('express');
const router = express.Router();
const Docker = require('dockerode');
const fs = require('node:fs');
const path = require('path');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();
const https = require('https');

const docker = new Docker({ socketPath: process.env.dockerSocket });

/**
 * Downloads a file from a given URL to a specified directory.
 * @param {string} url - The URL of the file to download.
 * @param {string} dir - The directory to save the file in.
 * @param {string} filename - The name to save the file as.
 * @returns {Promise} A promise that resolves when the file is downloaded.
 */
const downloadFile = (url, dir, filename) => {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            const fileStream = fs.createWriteStream(path.join(dir, filename));
            response.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
};

/**
 * Downloads multiple files specified in the Scripts.Install array.
 * @param {Array} installScripts - Array of objects containing Uri and Path for each file.
 * @param {string} dir - The directory to save the files in.
 */
const downloadInstallScripts = async (installScripts, dir) => {
    for (const script of installScripts) {
        try {
            await downloadFile(script.Uri, dir, script.Path);
            log.info(`Successfully downloaded ${script.Path}`);
        } catch (err) {
            log.error(`Failed to download ${script.Path}: ${err.message}`);
        }
    }
};

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
    const { Image, Cmd, Env, Ports, Scripts, Memory, Cpu, PortBindings } = req.body;

    try {
        // Define the volume path
        let volumeId = new Date().getTime().toString();
        const volumePath = path.join(__dirname, '../volumes', volumeId); // Using timestamp for unique dir
        fs.mkdirSync(volumePath, { recursive: true });

        // Create the container with the configuration from the request
        const containerOptions = {
            Image,
            ExposedPorts: Ports,
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: true,
            OpenStdin: true,
            HostConfig: {
                PortBindings: PortBindings,
                Binds: [`${volumePath}:/app/data`],  // Setting binds directly here
                Memory: Memory * 1024 * 1024, // Convert MB to Bytes for Docker API
                CpuCount: Cpu  // Number of CPUs (threads)
            }
        };

        if (Cmd) containerOptions.Cmd = Cmd;
        if (Env) containerOptions.Env = Env;

        const container = await docker.createContainer(containerOptions);

        // Start the container
        await container.start();

        log.info('deployment completed! container: ' + container.id)
        res.status(201).json({ message: 'Container and volume created successfully', containerId: container.id, volumeId });

        if (Scripts && Scripts.Install && Array.isArray(Scripts.Install)) {
            const dir = path.join(__dirname, '../volumes/' + volumeId);
            await downloadInstallScripts(Scripts.Install, dir);
        }

    } catch (err) {
        log.error('deployment failed: ' + err)
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
