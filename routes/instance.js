/**
 * @fileoverview Provides routes for managing Docker container instances within the Skyport Daemon.
 * This module allows for listing all Docker containers and retrieving detailed information about
 * a specific container. Utilizes Dockerode to interact with the Docker engine via its API, handling
 * container queries and detailed inspections.
 */

const express = require('express');
const router = express.Router();
const Docker = require('dockerode');

const docker = new Docker({ socketPath: process.env.dockerSocket });

/**
 * GET /
 * Retrieves a list of all Docker containers on the host, regardless of their state (running, stopped, etc.).
 * Uses Dockerode's `listContainers` method to fetch container data. Returns a JSON list of containers or
 * an error message if the listing fails.
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object used to return the containers list or an error message.
 * @returns {Response} JSON response containing an array of all containers or an error message.
 */
router.get('/', (req, res) => {
    docker.listContainers({ all: true }, (err, containers) => {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        res.json(containers);
    });
});

/**
 * GET /:id
 * Fetches detailed information about a specific Docker container identified by the ID provided in the URL parameter.
 * This endpoint uses Dockerode to call the `inspect` method on the specified container, returning all available
 * details about the container's configuration and state. Responds with the detailed data or an error message if
 * the container cannot be found.
 *
 * @param {Object} req - The HTTP request object, containing the container ID as a URL parameter.
 * @param {Object} res - The HTTP response object used to return detailed container data or an error message.
 * @returns {Response} JSON response with detailed container information or an error message indicating the container was not found.
 */
router.get('/:id', (req, res) => {
    if (req.params.id) return res.send('no id')
    const container = docker.getContainer(req.params.id);
    container.inspect((err, data) => {
        if (err) {
            return res.status(404).json({ message: "Container not found" });
        }
        res.json(data);
    });
});

// List all ports for a specific Docker container
router.get('/:id/ports', (req, res) => {
    if (!req.params.id) return res.status(400).json({ message: 'Container ID is required' });
    const container = docker.getContainer(req.params.id);
    container.inspect((err, data) => {
        if (err) {
            return res.status(404).json({ message: "Container not found" });
        }
        const ports = data.NetworkSettings.Ports || {};
        const portList = Object.keys(ports).map(key => ({ port: key }));
        res.json(portList);
    });
});

router.get('/:id/delete', (req, res) => {
    if (!req.params.id) return res.status(400).json({ message: 'Container ID is required' });
    const container = docker.getContainer(req.params.id);
    container.remove({ force: true }, (err, data) => {
        if (err) {
            return res.status(404).json({ message: "Container not found" });
        }
        res.json(data);
    });
});

router.get('/purge/all', (req, res) => {
    docker.listContainers({ all: true }, (err, containers) => {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        containers.forEach(container => {
            docker.getContainer(container.Id).remove({ force: true }, (err, data) => {
                if (err) {
                    return res.status(404).json({ message: "Container not found" });
                }
                res.json(data);
            });
        });
    });
});

module.exports = router;
