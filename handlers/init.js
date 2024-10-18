const CatLoggr = require('cat-loggr');
const log = new CatLoggr();
const fs = require('fs').promises;
const path = require('path');

async function createVolumesFolder() {
  try {
    await fs.mkdir(path.join(__dirname, '../volumes'), { recursive: true });
    log.init('volumes folder created successfully');
  } catch (error) {
    console.error('Error creating volumes folder:', error);
  }
}

module.exports = { createVolumesFolder }
