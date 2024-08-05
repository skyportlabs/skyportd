const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const multer = require('multer');
const upload = multer({ dest: 'tmp/' });
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
 * Determines the purpose of a file based on its extension.
 * @param {string} file - The file name to check.
 * @returns {string} The purpose category of the file.
 */
function getFilePurpose(file) {
    const extension = path.extname(file).toLowerCase();
    const purposes = {
        programming: ['.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.scala', '.groovy'],
        webDevelopment: ['.html', '.htm', '.css', '.scss', '.sass', '.less', '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.svg'],
        textDocument: ['.txt', '.md', '.rtf', '.log'],
        configuration: ['.ini', '.yaml', '.yml', '.toml', '.cfg', '.conf', '.properties'],
        database: ['.sql'],
        script: ['.sh', '.bash', '.ps1', '.bat', '.cmd'],
        document: ['.tex', '.bib', '.markdown'],
    };

    for (const [purpose, extensions] of Object.entries(purposes)) {
        if (extensions.includes(extension)) {
            return purpose;
        }
    }
    return 'other';
}

/**
 * Determines if a file is editable based on its extension.
 * @param {string} file - The file name to check.
 * @returns {boolean} True if the file's extension is in the list of editable types, false otherwise.
 */
function isEditable(file) {
    const editableExtensions = [
        // Text files
        '.txt', '.md', '.rtf', '.log', '.ini', '.csv',
        
        // Web development
        '.html', '.htm', '.css', '.scss', '.sass', '.less',
        '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.svg',
        
        // Programming languages
        '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
        '.rb', '.php', '.swift', '.kt', '.rs', '.scala', '.groovy',
        
        // Scripting
        '.sh', '.bash', '.ps1', '.bat', '.cmd',
        
        // Markup and config
        '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties',
        
        // Document formats
        '.tex', '.bib', '.markdown',
        
        // Database
        '.sql',
        
        // Others
        '.gitignore', '.env', '.htaccess'
    ];
    
    return editableExtensions.includes(path.extname(file).toLowerCase());
}

/**
 * Formats file size into a human-readable string.
 * @param {number} bytes - The file size in bytes.
 * @returns {string} Formatted file size with appropriate unit.
 */
function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * GET /:id/files
 * Retrieves a list of files and directories within a specified volume, optionally within a subdirectory.
 * Provides enhanced details about each file or directory, including its type, editability, size, last updated timestamp, and purpose.
 *
 * @param {string} id - The volume identifier.
 * @param {string} [path] - Optional. A subdirectory within the volume to list files from.
 * @returns {Response} JSON response containing detailed information about files within the specified path.
 */
router.get('/:id/files', async (req, res) => {
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
router.post('/:id/files/rename/:filename/:newfilename', async (req, res) => {
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
 * POST /:id/files/upload
 * Uploads one or more files to a specified volume, optionally within a subdirectory.
 * 
 * @param {string} id - The volume identifier.
 * @param {string} [path] - Optional. A subdirectory within the volume where files should be stored.
 */
router.post('/:id/files/upload', upload.array('files'), async (req, res) => {
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
 * POST /:id/files/create
 * Creates a file with the specified filename and content within a volume, optionally within a subdirectory.
 * The path to the subdirectory can be provided via a query parameter.
 * 
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to create.
 * @param {string} content - The content to write to the file.
 * @returns {Response} JSON response indicating the result of the file creation operation.
 */
router.post('/:id/files/create/:filename', async (req, res) => {
    const { id, filename } = req.params;
    const { content } = req.body;
    const volumePath = path.join(__dirname, '../volumes', id);
    const subPath = req.query.path || ''; // Use query parameter to get the subpath

    try {
        // Ensure the path is safe and resolve it to an absolute path
        const fullPath = safePath(path.join(volumePath, subPath), filename);

        // Write the content to the new file
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

/**
 * POST /:id/folders/create
 * Creates a folder within a specified volume, optionally within a subdirectory.
 * The path to the subdirectory can be provided via a query parameter.
 * 
 * @param {string} id - The volume identifier.
 * @param {string} foldername - The name of the folder to create.
 * @returns {Response} JSON response indicating the result of the folder creation operation.
 */
router.post('/:id/folders/create/:foldername', async (req, res) => {
    const { id, foldername } = req.params;
    const volumePath = path.join(__dirname, '../volumes', id);
    const subPath = req.query.path || '';

    try {
        // Ensure the path is safe and resolve it to an absolute path
        const fullPath = safePath(volumePath, subPath);
        const targetFolderPath = path.join(fullPath, foldername);

        // Create the folder
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

/**
 * DELETE /:id/files/delete
 * Deletes a specific file within a volume. Validates the file path to ensure it is within the designated volume directory.
 *
 * @param {string} id - The volume identifier.
 * @param {string} filename - The name of the file to delete.
 * @returns {Response} JSON response indicating the result of the delete operation.
 */
router.delete('/:id/files/delete/:filename', async (req, res) => {
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
