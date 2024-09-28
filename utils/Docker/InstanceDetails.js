const Docker = require('dockerode');
const docker = new Docker({ socketPath: process.env.dockerSocket });

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
const getInstanceDetails = (req, res) => {
  if (!req.params.id) return res.status(400).json({ message: 'Container ID is required' });
  const container = docker.getContainer(req.params.id);
  container.inspect((err, data) => {
    if (err) {
      return res.status(404).json({ message: 'Container not found' });
    }
    res.json(data);
  });
};

module.exports = getInstanceDetails;