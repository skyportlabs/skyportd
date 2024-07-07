const express = require('express');
const router = express.Router();
const FtpSrv = require('ftp-srv');
const fs = require('fs').promises;
const path = require('path');
const Keyv = require('keyv');
const crypto = require('crypto');
const CatLoggr = require('cat-loggr');
const config = require('../config.json')

// Initialize Keyv for storing FTP passwords
const keyv = new Keyv('sqlite://ftp.db');

// Catloggr
const log = new CatLoggr();

// FTP server configuration
const ftpServer = new FtpSrv({
    url: 'ftp://0.0.0.0:3002',
    anonymous: false,
});

// Function to generate a random password
function generatePassword() {
    return crypto.randomBytes(16).toString('hex');
}

// Function to get or create a password for a volume
async function getVolumePassword(volumeId) {
    let password = await keyv.get(volumeId);
    if (!password) {
        password = generatePassword();
        await keyv.set(volumeId, password);
    }
    return password;
}

// FTP server authentication and directory restriction
ftpServer.on('login', async ({ username, password }, resolve, reject) => {
    const volumeId = username.replace('skyport_', '');
    const volumePath = path.join(__dirname, '../volumes', volumeId);

    try {
        const correctPassword = await getVolumePassword(volumeId);
        if (password === correctPassword) {
            resolve({ root: volumePath });
        } else {
            reject('Invalid username or password');
        }
    } catch (error) {
        reject('Authentication error');
    }
});

// Start the FTP server
ftpServer.listen().then(() => {
    log.info('skyportd ftp server is online at port 3002')
});

// Endpoint to get FTP connection info
router.get('/:id/ftp', async (req, res) => {
    const volumeId = req.params.id;
    try {
        const password = await getVolumePassword(volumeId);
        res.json({
            host: config.ftp.hostname,
            port: 3002,
            username: `skyport_${volumeId}`,
            password: password
        });
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving FTP info' });
    }
});

module.exports = router;