const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const docker = new Docker({ socketPath: process.env.dockerSocket });

/**
 * GET /purge/all
 * Deletes all Docker containers and their associated volumes.
 *
 * @param {Object} req - The HTTP request object.
 * @param {Object} res - The HTTP response object used to return the result of the purge operation.
 * @returns {Response} JSON response indicating success or failure of the purge operation.
 */
const purgeAllInstances = async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });

    for (const containerInfo of containers) {
      const container = docker.getContainer(containerInfo.Id);

      try {
        const { Name } = await container.inspect();
        const nameWithoutSlash = Name.startsWith('/') ? Name.slice(1) : Name;
        const volumeDir = path.join(__dirname, '../volumes', nameWithoutSlash);
        await container.remove({ force: true });
        if (fs.existsSync(volumeDir)) {
          fs.rmSync(volumeDir, { recursive: true, force: true });
          console.log(`Deleted volume directory: ${volumeDir}`);
        }
      } catch (err) {
        console.error(`Error deleting container or volume for ${containerInfo.Id}:`, err.message);
      }
    }

    const volumesBaseDir = path.join(__dirname, '../volumes');
    if (fs.existsSync(volumesBaseDir)) {
      const volumeFolders = fs.readdirSync(volumesBaseDir, { withFileTypes: true });
      for (const dirent of volumeFolders) {
        const dirPath = path.join(volumesBaseDir, dirent.name);
        if (dirent.isDirectory()) {
          fs.rmSync(dirPath, { recursive: true, force: true });
          console.log(`Deleted remaining volume directory: ${dirPath}`);
        }
      }
    }

    res.json({ message: 'All containers and volume directories deleted' });
  } catch (err) {
    console.error('Error during purge:', err.message);
    res.status(500).json({ message: err.message });
  }
};

module.exports = purgeAllInstances;