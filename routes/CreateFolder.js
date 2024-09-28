const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { safePath } = require('../utils/SafePath');

/**
 * POST /:id/folders/create/:foldername
 * Creates a folder within a specified volume, optionally within a subdirectory.
 * The path to the subdirectory can be provided via a query parameter.
 * 
 * @param {string} id - The volume identifier.
 * @param {string} foldername - The name of the folder to create.
 * @returns {Response} JSON response indicating the result of the folder creation operation.
 */
router.post('/fs/:id/folders/create/:foldername', async (req, res) => {
    const { id, foldername } = req.params;
    const volumePath = path.join(__dirname, '../volumes', id);
    const subPath = req.query.path || '';

    try {
        const fullPath = safePath(volumePath, subPath);
        const targetFolderPath = path.join(fullPath, foldername);

        await fs.mkdir(targetFolderPath, { recursive: true });
        res.json({ message: 'Folder created successfully' });
    } catch (err) {
        if (err.code === 'EEXIST') {
            res.status(400).json({ message: 'Folder already exists' });
        } else {
            res.status(500).json({ message: err.message });
        }
    }
});

module.exports = router;