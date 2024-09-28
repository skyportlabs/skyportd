const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { safePath } = require('../utils/SafePath');
const { isEditable } = require('../utils/FileType');

/**
 * POST /:id/files/edit/:filename
 * Modifies the content of a specific file within a volume. The file must be of a type that is editable.
 * Receives the new content in the request body and overwrites the file with this content.
 *
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to edit.
 * @param {string} content - The new content to write to the file.
 * @returns {Response} JSON response indicating the result of the file update operation.
 */
router.post('/fs/:id/files/edit/:filename', async (req, res) => {
    const { id, filename } = req.params;
    const { content } = req.body;
    const volumePath = path.join(__dirname, '../volumes', id);

    const dirPath = req.query.path;
    
    let formattedPath = dirPath ? path.join(dirPath, filename) : filename;
    
    try {
        const filePath = safePath(volumePath, formattedPath);
        if (!isEditable(filePath)) {
            return res.status(400).json({ message: 'File type not supported for editing' });
        }
        await fs.writeFile(filePath, content);
        res.json({ message: 'File updated successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;