const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { safePath } = require('../utils/SafePath');

/**
 * POST /:id/files/rename/:filename/:newfilename
 * Renames a specific file within a volume. Validates the file paths to ensure they are within the designated volume directory.
 *
 * @param {string} id - The volume identifier.
 * @param {string} filename - The current name of the file to rename.
 * @param {string} newfilename - The new name for the file.
 * @param {string} [path] - Optional query parameter. A subdirectory within the volume where the file is located.
 * @returns {Response} JSON response indicating the result of the rename operation.
 */
router.post('/fs/:id/files/rename/:filename/:newfilename', async (req, res) => {
    const { id, filename, newfilename } = req.params;
    const volumePath = path.join(__dirname, '../volumes', id);
    const subPath = req.query.path || '';

    try {
        const oldPath = safePath(path.join(volumePath, subPath), filename);
        const newPath = safePath(path.join(volumePath, subPath), newfilename);

        // Check if the new filename already exists
        try {
            await fs.access(newPath);
            return res.status(400).json({ message: 'A file with the new name already exists' });
        } catch (err) {
            // If fs.access throws an error, it means the file doesn't exist, which is what we want
            if (err.code !== 'ENOENT') {
                throw err;
            }
        }

        await fs.rename(oldPath, newPath);
        res.json({ message: 'File renamed successfully' });
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.status(404).json({ message: 'File not found' });
        } else {
            res.status(500).json({ message: err.message });
        }
    }
});

module.exports = router;