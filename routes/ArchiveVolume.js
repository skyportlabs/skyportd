const express = require('express');
const router = express.Router();
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');

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
 * GET /:id/archives
 * Lists all archives for the specified volume, including their timestamp, size, and name.
 */
router.get('/:id/archives', async (req, res) => {
    const { id } = req.params;
    const archivePath = path.join(__dirname, '../archives', id);

    try {
        try {
            await fsPromises.access(archivePath, fs.constants.F_OK);
        } catch (err) {
            return res.json({ archives: [] });
        }

        const files = await fsPromises.readdir(archivePath, { withFileTypes: true });

        const detailedFiles = await Promise.all(files.map(async (file) => {
            const filePath = path.join(archivePath, file.name);
            const stats = await fsPromises.stat(filePath);

            return {
                name: file.name,
                size: formatFileSize(stats.size),
                lastUpdated: stats.mtime.toISOString(),
            };
        }));

        res.json({ archives: detailedFiles });
    } catch (err) {
        console.error('Error fetching archives:', err.message);
        res.status(500).json({ message: 'An error occurred while fetching archives.' });
    }
});

/**
 * POST /:id/archives/create
 * Creates an archive of the specified volume and stores it in the archives directory.
 */
router.post('/:id/archives/:volumeId/create', async (req, res) => {
    const { id, volumeId } = req.params;
    const volumePath = path.join(__dirname, '../volumes', volumeId);
    const archivePath = path.join(__dirname, '../archives', id);

    try {
        await fsPromises.mkdir(archivePath, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveName = `${id}-${timestamp}.zip`;
        const archiveFullPath = path.join(archivePath, archiveName);

        const output = fs.createWriteStream(archiveFullPath);
        const archive = archiver('zip', {
            zlib: { level: 9 },
        });

        output.on('close', () => {
            res.json({ message: 'Archive created successfully', archiveName });
        });

        output.on('error', (err) => {
            console.error('Error creating archive:', err.message);
            res.status(500).json({ message: 'An error occurred while creating the archive.' });
        });

        archive.on('error', (err) => {
            output.destroy();
            console.error('Error with archiver:', err.message);
            res.status(500).json({ message: 'An error occurred with the archiving process.' });
        });

        archive.pipe(output);
        archive.directory(volumePath, false);
        await archive.finalize();
    } catch (err) {
        console.error('Error creating archive:', err.message);
        res.status(500).json({ message: 'An error occurred while creating the archive.' });
    }
});


/**
 * POST /:id/archives/delete/:archiveName
 * Deletes the specified archive.
 */
router.post('/:id/archives/delete/:archiveName', async (req, res) => {
    const { id, archiveName } = req.params;
    const archivePath = path.join(__dirname, '../archives', id, archiveName);

    try {
        await fsPromises.unlink(archivePath);
        res.json({ message: 'Archive deleted successfully' });
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.status(404).json({ message: 'Archive not found' });
        } else {
            console.error('Error deleting archive:', err.message);
            res.status(500).json({ message: 'An error occurred while deleting the archive.' });
        }
    }
});

/**
 * POST /:id/archives/rollback/:archiveName
 * Rolls back the specified volume to the state of the given archive.
 */
router.post('/:id/archives/rollback/:volumeId/:archiveName', async (req, res) => {
    const { id, archiveName, volumeId } = req.params;
    const volumePath = path.join(__dirname, '../volumes', volumeId);
    const archivePath = path.join(__dirname, '../archives', id, archiveName);

    try {
        try {
            const files = await fsPromises.readdir(volumePath);
            await Promise.all(files.map(file => fsPromises.rm(path.join(volumePath, file), { recursive: true, force: true })));
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.warn('Volume directory not found. No files to delete.');
            } else {
                throw err;
            }
        }

        const zipStream = fs.createReadStream(archivePath);
        const extractStream = unzipper.Extract({ path: volumePath });

        zipStream.pipe(extractStream);

        extractStream.on('close', () => {
            res.json({ message: 'Volume rolled back successfully' });
        });

        extractStream.on('error', (err) => {
            console.error('Error extracting archive:', err.message);
            res.status(500).json({ message: 'An error occurred while extracting the archive.' });
        });
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.status(404).json({ message: 'Archive not found' });
        } else {
            console.error('Error rolling back volume:', err.message);
            res.status(500).json({ message: 'An error occurred while rolling back the volume.' });
        }
    }
});

module.exports = router;
