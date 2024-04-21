const axios = require('axios');
const Docker = require('dockerode');
const config = require('../config.json');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();

// Initialize Docker connection
const docker = new Docker({ socketPath: config.docker.socket });

async function seed() {
    try {
        log.init('retrieving image list from skyport...');
        // Fetch image configurations from the remote server
        const response = await axios.get(config.remote + '/images/list', {
            auth: {
                username: 'Skyport',
                password: config.remoteKey
            }
        });

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
        // Exit if the server connection cannot be established
        process.exit();
    }

    log.info('done!');
}

module.exports = { seed };
