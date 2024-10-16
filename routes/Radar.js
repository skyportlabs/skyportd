const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const Docker = require('dockerode');

const STRATEGIES_DIR = path.join(__dirname, '../storage/strategies');
const FLAGGED_CONTAINERS_FILE = path.join(__dirname, '../storage/flagged.json');

const docker = new Docker();
let flaggedContainers = {};

(async () => {
  if (await fs.pathExists(FLAGGED_CONTAINERS_FILE)) {
    try {
      flaggedContainers = await fs.readJson(FLAGGED_CONTAINERS_FILE);
    } catch (error) {
      console.error(`Error reading flagged containers file:`, error);
      flaggedContainers = {};
    }
  }
})();

async function loadStrategies() {
  try {
    const files = await fs.readdir(STRATEGIES_DIR);
    const strategies = await Promise.all(
      files
        .filter(file => file.endsWith('.radar'))
        .map(async file => {
          const strategyPath = path.join(STRATEGIES_DIR, file);
          try {
            const strategy = await fs.readJson(strategyPath);
            if (strategy.name && strategy.type && Array.isArray(strategy.checks)) {
              return strategy;
            }
            console.warn(`Invalid strategy structure in file ${file}. Skipping.`);
            return null;
          } catch (error) {
            console.error(`Error loading strategy from ${file}:`, error);
            return null;
          }
        })
    );
    const validStrategies = strategies.filter(Boolean);
    if (validStrategies.length === 0) {
      console.warn('No valid strategies loaded. Check your .radar files and permissions.');
    }
    return validStrategies;
  } catch (error) {
    console.error('Error reading strategies directory:', error);
    return [];
  }
}

async function checkVolume(containerId, strategies) {
  const flags = [];
  const container = docker.getContainer(containerId);

  for (const strategy of strategies) {
    const result = await executeStrategy(strategy, container);
    flags.push(...result);
  }

  if (flags.length > 0) {
    try {
      await container.stop();
    } catch (error) {
      console.error(`Error stopping container ${containerId}:`, error);
    }
  }

  return flags;
}

async function executeStrategy(strategy, container) {
  const flags = [];

  for (const check of strategy.checks) {
    if (!check?.type) {
      console.warn(`Invalid check configuration in strategy ${strategy.name}`);
      continue;
    }

    try {
      const result = await executeCheck(container, check);
      if (result) {
        const message = formatFlagMessage(check.message || 'Unspecified issue detected', result);
        flags.push({ message, strategyName: strategy.name });
      }
    } catch (error) {
      console.error(`Error executing check ${check.type} in strategy ${strategy.name}:`, error);
    }
  }

  return flags;
}

async function executeCheck(container, check) {
  switch (check.type) {
    case 'file_existence':
      return await fileExistenceCheck(container, check);
    case 'file_content':
      return await fileContentCheck(container, check);
    case 'file_size':
      return await fileSizeCheck(container, check);
    case 'dependency':
      return await dependencyCheck(container, check);
    case 'log_content':
      return await logContentCheck(container, check);
    case 'process_check':
      return await processCheck(container, check);
    case 'network_usage':
      return await networkUsageCheck(container, check);
    default:
      console.warn(`Unknown check type: ${check.type}`);
      return false;
  }
}

async function fileExistenceCheck(container, check) {
  if (!check.path) {
    console.warn(`Path is undefined for file_existence check`);
    return false;
  }

  try {
    const exec = await container.exec({
      Cmd: ['sh', '-c', `test -e ${check.path} && echo "exists"`],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start();
    const output = await streamToString(stream);

    if (output.trim() === 'exists') {
      return { filename: check.path };
    }
  } catch (error) {
    console.error(`Error checking file existence in container ${container.id}:`, error);
  }

  return false;
}

async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    let data = '';
    stream.on('data', chunk => data += chunk.toString());
    stream.on('end', () => resolve(data));
    stream.on('error', reject);
  });
}

async function fileContentCheck(container, check) {
  if (!check.path || !check.patterns) {
    console.warn(`Path or patterns are undefined for file_content check`);
    return false;
  }

  try {
    const exec = await container.exec({
      Cmd: ['sh', '-c', `cat ${check.path}`],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start();
    const output = await streamToString(stream);

    for (const pattern of check.patterns) {
      if (output.includes(pattern)) {
        return { pattern };
      }
    }
  } catch (error) {
    console.error(`Error reading file content in container ${container.id}:`, error);
  }

  return false;
}

async function fileSizeCheck(container, check) {
  if (!check.path || typeof check.max_size !== 'number') {
    console.warn(`Path or max_size is undefined for file_size check`);
    return false;
  }

  try {
    const exec = await container.exec({
      Cmd: ['sh', '-c', `stat -c %s ${check.path}`],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start();
    const output = await streamToString(stream);

    const size = parseInt(output.trim(), 10);
    return size > check.max_size ? { size } : false;
  } catch (error) {
    if (error.message.includes('container stopped') || error.message.includes('container paused')) {
      console.warn(`Container ${container.id} is stopped or paused. Skipping size check.`);
      return false;
    }
    
    console.error(`Error retrieving file size in container ${container.id}:`, error);
    return false;
  }
}

async function dependencyCheck(container, check) {
  if (!check.file || !check.patterns) {
    console.warn(`File or patterns are undefined for dependency check`);
    return false;
  }

  try {
    const exec = await container.exec({
      Cmd: ['sh', '-c', `cat ${check.file}`],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start();
    const output = await streamToString(stream);

    const fileContent = JSON.parse(output);
    const dependencies = { ...fileContent.dependencies, ...fileContent.devDependencies };
    const missingDeps = check.patterns.filter(dep => !dependencies[dep]);

    return missingDeps.length > 0 ? { missing: missingDeps } : false;
  } catch (error) {
    console.error(`Error checking dependencies in container ${container.id}:`, error);
    return false;
  }
}

async function logContentCheck(container, check) {
  if (!check.patterns) {
    console.warn(`Patterns are undefined for log_content check`);
    return false;
  }

  try {
    const logs = await container.logs({ stdout: true, stderr: true, tail: '50' });
    const output = logs.toString();

    for (const pattern of check.patterns) {
      if (output.includes(pattern)) {
        return { pattern };
      }
    }
  } catch (error) {
    console.error(`Error retrieving logs for container ${container.id}:`, error);
  }

  return false;
}

async function processCheck(container, check) {
  if (!check.processName) {
    console.warn(`Process name is undefined for process_check`);
    return false;
  }

  try {
    const exec = await container.exec({
      Cmd: ['sh', '-c', `pgrep ${check.processName}`],
      AttachStdout: true,
      AttachStderr: true
    });

    const stream = await exec.start();
    const output = await streamToString(stream);

    return output.trim() ? { process: check.processName } : false;
  } catch (error) {
    console.error(`Error checking process ${check.processName} in container ${container.id}:`, error);
    return false;
  }
}

async function networkUsageCheck(container, check) {
  console.warn('Network usage check is not implemented yet.');
  return false;
}

function formatFlagMessage(baseMessage, result) {
  return `${baseMessage} (Details: ${JSON.stringify(result)})`;
}

router.get('/check-for/:id', async (req, res) => {
  const containerId = req.params.id;
  try {
    const strategies = await loadStrategies();
    const flags = await checkVolume(containerId, strategies);

    if (flags.length > 0) {
      const detailedFlags = flags.map(flag => ({
        [containerId]: `Container ${containerId} has been suspended due to the following issue: "${flag.message}" under strategy "${flag.strategyName}".`
      }));

      res.json({
        containerId,
        messages: detailedFlags
      });
    } else {
      res.json({
        containerId,
        messages: [`Container ${containerId} is running without issues.`]
      });
    }
  } catch (error) {
    console.error('Error executing checks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/check/all', async (req, res) => {
  try {
    const strategies = await loadStrategies();
    const containers = await docker.listContainers({ all: false });
    const flaggedMessages = [];

    for (const containerInfo of containers) {
      const containerId = containerInfo.Id;
      const flags = await checkVolume(containerId, strategies);
      if (flags.length > 0) {
        flags.forEach(flag => {
          flaggedMessages.push({
            containerId: containerId,
            message: `Container ${containerId} has been suspended due to the following issue: "${flag.message}" under strategy "${flag.strategyName}".`
          });
        });
      }
    }

    res.json({
      flaggedMessages: flaggedMessages.length > 0 ? flaggedMessages : ['All running containers are healthy.']
    });
  } catch (error) {
    console.error('Error executing checks for all containers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

setInterval(async () => {
  try {
    for (const containerId in flaggedContainers) {
      if (flaggedContainers[containerId].length > 0) {
        const strategies = await loadStrategies();
        const flags = await checkVolume(containerId, strategies);

        if (flags.length === 0) {
          delete flaggedContainers[containerId];
          await fs.writeJson(FLAGGED_CONTAINERS_FILE, flaggedContainers);
        }
      }
    }
  } catch (error) {
    console.error('Error in periodic check:', error);
  }
}, 30000);

module.exports = router;
