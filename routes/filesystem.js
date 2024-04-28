const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

/**
 * Ensures the target path is within the specified base directory, preventing directory traversal attacks.
 * @param {string} base - The base directory path.
 * @param {string} target - The target directory or file path.
 * @returns {string} The absolute path that is confirmed to be within the base directory.
 * @throws {Error} If the resolved path attempts to escape the base directory.
 */
function safePath(base, target) {
    const fullPath = path.resolve(base, target);
    if (!fullPath.startsWith(base)) {
        throw new Error('Attempting to access outside of the volume');
    }
    return fullPath;
}

/**
 * Determines if a file is editable based on its extension.
 * @param {string} file - The file name to check.
 * @returns {boolean} True if the file's extension is in the list of editable types, false otherwise.
 */
function isEditable(file) {
    const editableExtensions = ['.txt', '.json', '.js', '.html', '.css', '.md'];
    return editableExtensions.includes(path.extname(file).toLowerCase());
}

/**
 * GET /:id/files
 * Retrieves a list of files and directories within a specified volume, optionally within a subdirectory.
 * Provides details about each file or directory, including its type and whether it is editable.
 *
 * @param {string} id - The volume identifier.
 * @param {string} [path] - Optional. A subdirectory within the volume to list files from.
 * @returns {Response} JSON response containing details of files within the specified path.
 */
router.get('/:id/files', async (req, res) => {
    const volumeId = req.params.id;
    const subPath = req.query.path || ''; // Use query parameter to get the subpath
    const volumePath = path.join(__dirname, '../volumes', volumeId);

    if (!volumeId) return res.status(400).json({ message: 'No volume ID' });

    try {
        // Ensure the path is safe and resolve it to an absolute path
        const fullPath = safePath(volumePath, subPath);

        // Read the directory content
        const files = await fs.readdir(fullPath, { withFileTypes: true });
        const detailedFiles = files.map(file => ({
            name: file.name,
            isDirectory: file.isDirectory(),
            isEditable: isEditable(file.name)
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

/**
 * GET /:id/files/view
 * Retrieves the content of a specific file within a volume, provided the file type is supported for viewing.
 * This endpoint checks if the file is editable to determine if its content can be viewed.
 *
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to view.
 * @returns {Response} JSON response containing the content of the file if viewable, or an error message.
 */
router.get('/:id/files/view/:filename', async (req, res) => {
    const { id, filename } = req.params;
    const volumePath = path.join(__dirname, '../volumes', id);

    if (!id || !filename) return res.status(400).json({ message: 'No volume ID' });
    
    const dirPath = req.query.path;
    
    let formattedPath;
    if (dirPath) {
        formattedPath = dirPath + '/' + filename
    } else {
        formattedPath = filename
    }

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

/**
 * POST /:id/files/edit
 * Modifies the content of a specific file within a volume. The file must be of a type that is editable.
 * Receives the new content in the request body and overwrites the file with this content.
 *
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to edit.
 * @param {string} content - The new content to write to the file.
 * @returns {Response} JSON response indicating the result of the file update operation.
 */
router.post('/:id/files/edit/:filename', async (req, res) => {
    const { id, filename } = req.params;
    const { content } = req.body;
    const volumePath = path.join(__dirname, '../volumes', id);

    const dirPath = req.query.path;
    
    let formattedPath;
    if (dirPath) {
        formattedPath = dirPath + '/' + filename
    } else {
        formattedPath = filename
    }
    
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

/**
 * DELETE /:id/files/delete
 * Deletes a specific file within a volume. Validates the file path to ensure it is within the designated volume directory.
 *
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to delete.
 * @returns {Response} JSON response indicating the result of the delete operation.
 */
router.delete('/:id/files/delete', async (req, res) => {
    const { id, filename } = req.params;
    const volumePath = path.join(__dirname, '../volumes', id);
    
    try {
        const filePath = safePath(volumePath, filename);
        await fs.unlink(filePath);
        res.json({ message: 'File deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
