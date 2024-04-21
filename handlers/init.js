const axios = require('axios');
const Docker = require('dockerode');
const config = require('../config.json')
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();

// Initialize Docker connection
const docker = new Docker({ socketPath: config.docker.socket });

async function init() {
    try {
        log.init('getting instances from skyport...')
        // Fetch container configurations from the remote server
        const response = await axios.get(config.remote + '/instances/list', {
            auth: {
                username: 'Skyport',
                password: config.remoteKey
            }
        });

        const remoteContainers = response.data;
        log.init('checking instances...')

        for (const remoteContainer of remoteContainers) {
            const container = docker.getContainer(remoteContainer.ContainerId);
            log.init('performing checks on container...')

            // Check if the container exists in this Docker
            try {
                const localContainerInfo = await container.inspect();

                // Ensure the container is running
                if (!localContainerInfo.State.Running) {
                    await container.start();
                    log.info(`state: container ${remoteContainer.ContainerId} booting...`);
                }

                // Check and log discrepancies for memory and CPU settings
                //console.log(localContainerInfo.HostConfig.Memory)
                //console.log(remoteContainer.Memory)
                // No clue what formats these are in? ...
                if (localContainerInfo.HostConfig.Memory !== remoteContainer.Memory) {
                    //log.warn(`settings (RAM) discrepancy detected for container: ${remoteContainer.ContainerId}`);
                }
                if (localContainerInfo.HostConfig.CpuCount !== remoteContainer.Cpu) {
                    //log.warn(`settings (CPU) discrepancy detected for container: ${remoteContainer.ContainerId}`);
                }

                // Environment variables
                const localEnv = localContainerInfo.Config.Env.reduce((acc, cur) => {
                    const [key, value] = cur.split('=');
                    acc[key] = value;
                    return acc;
                }, {});

                remoteContainer.Env.forEach(envVar => {
                    const [key, value] = envVar.split('=');
                    if (localEnv[key] !== value) {
                        console.log(`environment variable ${key} mismatch for container ${remoteContainer.ContainerId}. Expected ${value}, found ${localEnv[key]}.`);
                    }
                });

                // Port bindings
                const localPorts = localContainerInfo.HostConfig.PortBindings || {};
                const requiredPorts = remoteContainer.PortBindings || {};

                Object.keys(requiredPorts).forEach(port => {
                    if (!localPorts[port] || localPorts[port][0].HostPort !== requiredPorts[port][0].HostPort) {
                        log.error(`port binding discrepancy for ${port} on container ${remoteContainer.ContainerId}. Expected ${requiredPorts[port][0].HostPort}, found ${localPorts[port] ? localPorts[port][0].HostPort : 'none'}.`);
                    }
                });

            } catch (error) {
                if (error.statusCode === 404) {
                    log.info(`container ${remoteContainer.ContainerId} not found on local Docker, possibly for a different node!`);
                } else {
                    log.info(`error inspecting container ${remoteContainer.ContainerId}:`, error);
                }
            }
        }
    } catch (error) {
        log.error('failed to fetch containers from remote! the panel is probably down. error: ', error);

        // Nothing we can do
        // The Panel is probably down
        process.exit();
    }

    log.info('done!')
}

module.exports = { init }