const express = require('express');
const router = express.Router();
const config = require('../config.json')
const Docker = require('dockerode');

const docker = new Docker({ socketPath: config.docker.socket });

router.get('/', (req, res) => {
    docker.listContainers({ all: true }, (err, containers) => {
        if (err) {
            return res.status(500).json({ message: err.message });
        }
        res.json(containers);
    });
});

router.get('/:id', (req, res) => {
    const container = docker.getContainer(req.params.id);
    container.inspect((err, data) => {
        if (err) {
            return res.status(404).json({ message: "Container not found" });
        }
        res.json(data);
    });
});

module.exports = router;
