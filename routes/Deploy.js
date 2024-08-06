const express = require('express');
const router = express.Router();
const Docker = require('dockerode');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();
const https = require('https');
const { pipeline } = require('stream/promises');

const docker = new Docker({ socketPath: process.env.dockerSocket });

const downloadFile = (url, dir, filename) => {
    return new Promise((resolve, reject) => {
        const filePath = path.join(dir, filename);
        https.get(url, async (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${filename}: HTTP status code ${response.statusCode}`));
                return;
            }
            const writeStream = fsSync.createWriteStream(filePath);
            try {
                await pipeline(response, writeStream);
                resolve();
            } catch (err) {
                reject(err);
            }
        }).on('error', (err) => {
            fsSync.unlink(filePath, () => {}); // Delete the file if download failed
            reject(err);
        });
    });
};

const downloadInstallScripts = async (installScripts, dir, variables) => {
    const parsedVariables = JSON.parse(variables);

    for (const script of installScripts) {
        try {
            let updatedUri = script.Uri;

            if (parsedVariables) {
                for (const [key, value] of Object.entries(parsedVariables)) {
                    updatedUri = updatedUri.replace(`{{${key}}}`, value);
                    log.info(`Replaced ${key} with ${value} in ${updatedUri}`);
                }
            }

            await downloadFile(updatedUri, dir, script.Path);
            log.info(`Successfully downloaded ${script.Path}`);
        } catch (err) {
            log.error(`Failed to download ${script.Path}: ${err.message}`);
        }
    }
};


const replaceVariables = async (dir, variables) => {
    const files = await fs.readdir(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile() && !file.endsWith('.jar')) {
            let content = await fs.readFile(filePath, 'utf8');
            for (const [key, value] of Object.entries(variables)) {
                const regex = new RegExp(`{{${key}}}`, 'g');
                content = content.replace(regex, value);
            }
            await fs.writeFile(filePath, content, 'utf8');
            log.info(`Variables replaced in ${file}`);
        }
    }
};

router.post('/create', async (req, res) => {
    log.info('deployment in progress...')
    const { Image, Id, Cmd, Env, Ports, Scripts, Memory, Cpu, PortBindings } = req.body;
    const variables2 = req.body.variables;

    try {
        let volumeId = Id;
        const volumePath = path.join(__dirname, '../volumes', volumeId);
        await fs.mkdir(volumePath, { recursive: true });

        const containerOptions = {
            name: volumeId,
            Image,
            ExposedPorts: Ports,
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: true,
            OpenStdin: true,
            HostConfig: {
                PortBindings: PortBindings,
                Binds: [`${volumePath}:/app/data`],
                Memory: Memory * 1024 * 1024,
                CpuCount: Cpu,
                NetworkMode: 'host'
            }
        };

        if (Cmd) containerOptions.Cmd = Cmd;
        if (Env) containerOptions.Env = Env;

        const container = await docker.createContainer(containerOptions);
        await container.start();

        log.info('deployment completed! container: ' + container.id)
        res.status(201).json({ message: 'Container and volume created successfully', containerId: container.id, volumeId });

        if (Scripts && Scripts.Install && Array.isArray(Scripts.Install)) {
            const dir = path.join(__dirname, '../volumes', volumeId);
            await downloadInstallScripts(Scripts.Install, dir, variables2);

            // Prepare variables for replacement
            const variables = {
                primaryPort: Object.values(PortBindings)[0][0].HostPort,
                containerName: container.id.substring(0, 12),
                timestamp: new Date().toISOString(),
                randomString: Math.random().toString(36).substring(7)
            };

            // Replace variables in downloaded files
            await replaceVariables(dir, variables);
        }
    } catch (err) {
        log.error('deployment failed: ' + err)
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

router.post('/redeploy/:id', async (req, res) => {
    const { id } = req.params;
    const container = docker.getContainer(id);
    try {

        await container.remove();

        const { Image, Id, Ports, Memory, Cpu, PortBindings, Env } = req.body;
        const volumePath = path.join(__dirname, '../volumes', Id);

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
                Binds: [`${volumePath}:/app/data`],
                Memory: Memory * 1024 * 1024,
                CpuCount: Cpu,
                NetworkMode: 'host'
            }
        };

        if (Env) containerOptions.Env = Env;


        const newContainer = await docker.createContainer(containerOptions);
        await newContainer.start();
        res.status(200).json({ message: 'Container ReDeloyed successfully', containerId: newContainer.id });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.put('/edit/:id', async (req, res) => {
    const { id } = req.params;
    const { Image, Memory, Cpu, VolumeId } = req.body;

    try {
        log.info(`Editing container: ${id}`);

        // Get the existing container
        const container = docker.getContainer(id);
        const containerInfo = await container.inspect();

        // Extract existing configuration
        const existingConfig = containerInfo.Config;
        const existingHostConfig = containerInfo.HostConfig;

        // Prepare new configuration
        const newContainerOptions = {
            Image: Image || existingConfig.Image,
            ExposedPorts: existingConfig.ExposedPorts,
            Cmd: existingConfig.Cmd,
            Env: existingConfig.Env,
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: true,
            Tty: true,
            OpenStdin: true,
            HostConfig: {
                PortBindings: existingHostConfig.PortBindings,
                Binds: [`${path.join(__dirname, '../volumes', VolumeId)}:/app/data`],
                Memory: Memory ? Memory * 1024 * 1024 : existingHostConfig.Memory,
                CpuCount: Cpu || existingHostConfig.CpuCount,
                NetworkMode: 'host'
            }
        };

        // Stop and remove the existing container
        log.info(`Stopping container: ${id}`);
        await container.stop();
        log.info(`Removing container: ${id}`);
        await container.remove();

        // Create and start a new container with the updated configuration
        log.info('Creating new container with updated configuration');
        const newContainer = await docker.createContainer(newContainerOptions);
        await newContainer.start();

        log.info(`Edit completed! New container ID: ${newContainer.id}`);
        res.status(200).json({ 
            message: 'Container edited successfully', 
            oldContainerId: id, 
            newContainerId: newContainer.id 
        });

    } catch (err) {
        log.error(`Edit failed: ${err}`);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
