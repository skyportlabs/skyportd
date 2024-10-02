const os = require('os');
const fs = require('fs');
const path = require('path');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();

const storagePath = path.join(__dirname, '../storage/systemStats.json');
const maxAge = 5 * 60 * 10000;

let statsLog = [];

function ensureStorageDirectory() {
    const storageDir = path.dirname(storagePath);
    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }
}

function calculateCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((core) => {
        for (let type in core.times) {
            totalTick += core.times[type];
        }
        totalIdle += core.times.idle;
    });

    const totalCores = cpus.length;
    const idlePercentage = totalIdle / totalTick;
    const usagePercentage = 1 - idlePercentage;

    return {
        coresMax: totalCores,
        coresUsage: usagePercentage * 100
    };
}

function getCurrentStats() {
    const timestamp = new Date().toISOString();
    const totalMemory = os.totalmem() / (1024 * 1024);
    const freeMemory = os.freemem() / (1024 * 1024);
    const usedMemory = totalMemory - freeMemory;
    const cpuStats = calculateCpuUsage();

    return {
        timestamp,
        RamMax: `${totalMemory.toFixed(2)} MB`,
        Ram: `${usedMemory.toFixed(2)} MB`,
        CoresMax: cpuStats.coresMax,
        Cores: `${cpuStats.coresUsage.toFixed(2)}%`
    };
}

function cleanOldEntries() {
    const now = Date.now();
    statsLog = statsLog.filter(entry => {
        if (entry && entry.timestamp) {
            const entryTime = new Date(entry.timestamp).getTime();
            return now - entryTime <= maxAge;
        } else {
            return false;
        }
    });
}

function saveStats(stats) {
    if (stats && stats.timestamp) {
        statsLog.push(stats);
        cleanOldEntries();
        fs.writeFile(storagePath, JSON.stringify(statsLog, null, 2), (err) => {
            if (err) {
                log.error('Error saving stats to JSON file:', err);
            }
        });
    } else {
    }
}

function initLogger() {
    ensureStorageDirectory();
    if (fs.existsSync(storagePath)) {
        try {
            const data = fs.readFileSync(storagePath, 'utf8');
            const parsedData = JSON.parse(data);
            if (Array.isArray(parsedData)) {
                statsLog = parsedData.filter(entry => entry && entry.timestamp);
                cleanOldEntries();
                fs.writeFile(storagePath, JSON.stringify(statsLog, null, 2), (err) => {
                    if (err) {
                        log.error('Error saving stats to JSON file:', err);
                    }
                });
            } else {
                log.error('Error parsing JSON data:', parsedData);
                statsLog = [];
            }
        } catch (err) {
            log.error('Error reading stats from JSON file:', err);
            statsLog = [];
        }
    }
}

function getSystemStats(periodInMs) {
    if (periodInMs) {
        const now = Date.now();
        const filteredStats = statsLog.filter(entry => {
            if (entry && entry.timestamp) {
                const entryTime = new Date(entry.timestamp).getTime();
                return now - entryTime <= periodInMs;
            } else {
                log.error('Error filtering stats:', entry);
                return false;
            }
        });
        return filteredStats;
    } else {
        return getCurrentStats();
    }
}
getSystemStats.total = function() {
    return statsLog;
}

module.exports = {
    initLogger,
    getSystemStats,
    saveStats
};
