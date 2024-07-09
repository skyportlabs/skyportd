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
        log.init('retrieving image list from skyport...');
        const response = await axios.get(config.remote + '/images/list');

        const images = response.data;
        log.init('pulling images...');

        for (const image of images) {
            try {
                log.info(`attempting to pull image: ${image.Image}...`);
                await docker.pull(image.Image, (err, stream) => {
                    if (err) {
                        log.error(`failed to pull image ${image.Image}:`, err.message);
                        return;
                    }
                    docker.modem.followProgress(stream, onFinished, onProgress);

                    function onFinished(err, output) {
                        if (err) {
                            log.error(`error after pulling image ${image.Image}:`, err.message);
                        } else {
                            log.info(`successfully pulled image ${image.Image}`);
                        }
                    }

                    function onProgress(event) {
                        log.info(`pulling ${image.Image}: ${event.status}`);
                    }
                });
            } catch (err) {
                log.error(`error pulling image ${image.Image}:`, err.message);
            }
        }
    } catch (error) {
        log.error('failed to retrieve image list from remote! the panel might be down. error:', error.message);
        process.exit();
    }

    log.info('done!');
}

module.exports = { seed };
