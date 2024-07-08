const axios = require('axios');
const Docker = require('dockerode');
const config = require('../config.json')
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();
const fs = require('fs').promises;
const path = require('path');

async function init() {
    // No longer used
    log.init('init done')
}

async function createVolumesFolder() {
  try {
    await fs.mkdir(path.join(__dirname, '../volumes'), { recursive: true });
    log.init('volumes folder created successfully');
  } catch (error) {
    console.error('Error creating volumes folder:', error);
  }
}

module.exports = { init, createVolumesFolder }
