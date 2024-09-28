const axios = require('axios');
const Docker = require('dockerode');
const config = require('../config.json');
const CatLoggr = require('cat-loggr');
const { createVolumesFolder } = require('./init.js')
const log = new CatLoggr();

// Initialize Docker connection
const docker = new Docker({ socketPath: process.env.dockerSocket });

async function seed() {
    try {
        createVolumesFolder();

        // Goodbye seed images system * 28 Sept 2024
    } catch (error) {
        log.error('failed to retrieve image list from remote! the panel might be down. error:', error.message);
        process.exit();
    }

    log.info('done!');
}

module.exports = { seed };
