const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { safePath } = require('../utils/SafePath');

/**
 * DELETE /:id/files/delete/:filename
 * Deletes a specific file within a volume. Validates the file path to ensure it is within the designated volume directory.
 *
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to delete.
 * @returns {Response} JSON response indicating the result of the delete operation.
 */
router.delete('/fs/:id/files/delete/:filename', async (req, res) => {
    const { id, filename } = req.params;
    const volumePath = path.join(__dirname, '../volumes', id);
    const subPath = req.query.path || '';

    try {
        const filePath = safePath(path.join(volumePath, subPath), filename);
        const stats = await fs.lstat(filePath);

        if (stats.isDirectory()) {
            await fs.rm(filePath, { recursive: true, force: true });
        } else {
            await fs.unlink(filePath);
        }

        res.json({ message: 'File deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;