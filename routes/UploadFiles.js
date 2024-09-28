const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const upload = multer({ dest: 'tmp/' });
const { safePath } = require('../utils/SafePath');

/**
 * POST /:id/files/upload
 * Uploads one or more files to a specified volume, optionally within a subdirectory.
 * 
 * @param {string} id - The volume identifier.
 * @param {string} [path] - Optional. A subdirectory within the volume where files should be stored.
 */
router.post('/fs/:id/files/upload', upload.array('files'), async (req, res) => {
    const { id } = req.params;
    const volumePath = path.join(__dirname, '../volumes', id);
    const subPath = req.query.path || '';

    try {
        const fullPath = safePath(volumePath, subPath);

        await Promise.all(req.files.map(file => {
            const destPath = path.join(fullPath, file.originalname);
            return fs.rename(file.path, destPath);
        }));

        res.json({ message: 'Files uploaded successfully' });
    } catch (err) {
        req.files.forEach(file => fs.unlink(file.path)); // Cleanup any saved files in case of failure
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;