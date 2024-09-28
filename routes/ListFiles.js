const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { safePath } = require('../utils/SafePath');
const { getFilePurpose, isEditable, formatFileSize } = require('../utils/FileType');

/**
 * GET /:id/files
 * Retrieves a list of files and directories within a specified volume, optionally within a subdirectory.
 * Provides enhanced details about each file or directory, including its type, editability, size, last updated timestamp, and purpose.
 *
 * @param {string} id - The volume identifier.
 * @param {string} [path] - Optional. A subdirectory within the volume to list files from.
 * @returns {Response} JSON response containing detailed information about files within the specified path.
 */
router.get('/fs/:id/files', async (req, res) => {
    const volumeId = req.params.id;
    const subPath = req.query.path || '';
    const volumePath = path.join(__dirname, '../volumes', volumeId);

    if (!volumeId) return res.status(400).json({ message: 'No volume ID' });

    try {
        const fullPath = safePath(volumePath, subPath);
        const files = await fs.readdir(fullPath, { withFileTypes: true });
        
        const detailedFiles = await Promise.all(files.map(async (file) => {
            const filePath = path.join(fullPath, file.name);
            const stats = await fs.stat(filePath);
            
            return {
                name: file.name,
                isDirectory: file.isDirectory(),
                isEditable: isEditable(file.name),
                size: formatFileSize(stats.size),
                lastUpdated: stats.mtime.toISOString(),
                purpose: file.isDirectory() ? 'folder' : getFilePurpose(file.name),
                extension: path.extname(file.name).toLowerCase(),
                permissions: stats.mode.toString(8).slice(-3) // Unix-style permissions
            };
        }));
        
        res.json({ files: detailedFiles });
    } catch (err) {
        if (err.message.includes('Attempting to access outside of the volume')) {
            res.status(400).json({ message: err.message });
        } else {
            res.status(500).json({ message: err.message });
        }
    }
});

module.exports = router;