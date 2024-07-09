const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { program } = require('commander');

// Parse command-line arguments
program
  .option('--panel <url>', 'URL of the panel')
  .option('--key <key>', 'Configure key')
  .parse(process.argv);

const options = program.opts();

if (!options.panel || !options.key) {
  console.error('Error: Both --panel and --key options are required.');
  process.exit(1);
}

// Function to generate a random access key
function generateAccessKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Function to update the config file
function updateConfig(configPath, newConfig) {
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
}

// Function to make HTTP/HTTPS request
function makeHttpRequest(url, method, data) {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https://');
      const lib = isHttps ? https : http;
  
      const req = lib.request(url, { method }, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(responseBody));
          } else {
            reject(new Error(`HTTP request failed with status ${res.statusCode}: ${responseBody}`));
          }
        });
      });
  
      req.on('error', reject);
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }
  
  // Main configuration function
  async function configureNode() {
    const configPath = path.join(__dirname, '../config.json');
    let config;
  
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      console.error('Error reading config file:', error);
      process.exit(1);
    }
  
    // Generate a new access key
    const newAccessKey = generateAccessKey();
  
    // Prepare the configuration request
    const configureUrl = new URL('/nodes/configure', options.panel);
    configureUrl.searchParams.append('authKey', config.key); // Use existing key as authKey
    configureUrl.searchParams.append('configureKey', options.key);
    configureUrl.searchParams.append('accessKey', newAccessKey);
  
    try {
      // Send configuration request to the panel
      await makeHttpRequest(configureUrl.toString(), 'POST');
  
      // Update local config
      config.remote = options.panel;
      config.key = newAccessKey;
  
      // Save updated config
      updateConfig(configPath, config);
  
      console.log('Node configured successfully!');
      console.log('New configuration:');
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Error configuring node:', error);
      process.exit(1);
    }
  }
  
  // Run the configuration
  configureNode();