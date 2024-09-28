const path = require('path');

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

module.exports = { getFilePurpose, isEditable, formatFileSize };