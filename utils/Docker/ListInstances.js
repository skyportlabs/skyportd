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
const listInstances = (req, res) => {
  docker.listContainers({ all: true }, (err, containers) => {
    if (err) {
      return res.status(500).json({ message: err.message });
    }
    res.json(containers);
  });
};

module.exports = listInstances;