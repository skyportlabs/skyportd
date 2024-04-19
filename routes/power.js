const express = require('express');
const router = express.Router();
const config = require('../config.json')
const Docker = require('dockerode');

const docker = new Docker({ socketPath: config.docker.socket });

router.post('/:id/:power', async (req, res) => {
    const { power } = req.params;
    const container = docker.getContainer(req.params.id);
    try {
        switch (power) {
            case 'start':
            case 'stop':
            case 'restart':
            case 'pause':
            case 'unpause':
            case 'kill':
                await container[power]();
                res.status(200).json({ message: `Container ${power}ed successfully` });
                break;
            default:
                res.status(400).json({ message: 'Invalid power action' });
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
