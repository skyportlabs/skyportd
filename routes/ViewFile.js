const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { safePath } = require('../utils/SafePath');
const { isEditable } = require('../utils/FileType');

/**
 * GET /:id/files/view/:filename
 * Retrieves the content of a specific file within a volume, provided the file type is supported for viewing.
 * This endpoint checks if the file is editable to determine if its content can be viewed.
 *
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to view.
 * @returns {Response} JSON response containing the content of the file if viewable, or an error message.
 */
router.get('/fs/:id/files/view/:filename', async (req, res) => {
    const { id, filename } = req.params;
    const volumePath = path.join(__dirname, '../volumes', id);

    if (!id || !filename) return res.status(400).json({ message: 'No volume ID or filename provided' });
    
    const dirPath = req.query.path;
    
    let formattedPath = dirPath ? path.join(dirPath, filename) : filename;

    try {
        const filePath = safePath(volumePath, formattedPath);
        if (!isEditable(filePath)) {
            return res.status(400).json({ message: 'File type not supported for viewing' });
        }
        const content = await fs.readFile(filePath, 'utf8');
        res.json({ content });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;