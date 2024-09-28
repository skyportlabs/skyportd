const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { safePath } = require('../utils/SafePath');

/**
 * POST /:id/files/create/:filename
 * Creates a file with the specified filename and content within a volume, optionally within a subdirectory.
 * The path to the subdirectory can be provided via a query parameter.
 * 
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to create.
 * @param {string} content - The content to write to the file.
 * @returns {Response} JSON response indicating the result of the file creation operation.
 */
router.post('/fs/:id/files/create/:filename', async (req, res) => {
    const { id, filename } = req.params;
    const { content } = req.body;
    const volumePath = path.join(__dirname, '../volumes', id);
    const subPath = req.query.path || '';

    try {
        const fullPath = safePath(path.join(volumePath, subPath), filename);

        await fs.writeFile(fullPath, content);
        res.json({ message: 'File created successfully' });
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.status(404).json({ message: 'Specified path not found' });
        } else {
            res.status(500).json({ message: err.message });
        }
    }
});

module.exports = router;