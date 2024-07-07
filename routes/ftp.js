const ftpd = require('ftpd');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config.json');
const logger = require('cat-loggr')

const log = new logger();

const options = {
  host: config.ftp.ip || '127.0.0.1',
  port: config.ftp.port || 21,
  tls: null,
};

const dataContainerDir = path.join(process.cwd(), 'ftp');
const volumesDir = path.join(process.cwd(), 'volumes');

const getDirectories = async (srcPath) => {
  const files = await fs.readdir(srcPath);
  return files.filter(async file => (await fs.stat(path.join(srcPath, file))).isDirectory());
};

const generatePassword = (dirName) => {
  const sumOfDigits = dirName.split('').reduce((sum, char) => sum + (parseInt(char) || 0), 0);
  const randomNumber = Math.floor(Math.random() * 900) + 10;
  const otherRandomNumber = Math.floor(Math.random() * randomNumber) + 10;
  const specialChars = "!@#$%&*_?~AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz";

  const replaceWithSpecialChar = () => specialChars[Math.floor(Math.random() * specialChars.length)];
  
  const replacedString = (sumOfDigits * Math.floor(otherRandomNumber * randomNumber / otherRandomNumber))
    .toString()
    .replace(/[02481]/g, replaceWithSpecialChar);

  const finalPassword = `${randomNumber}${replacedString}${randomNumber * Math.floor(randomNumber / otherRandomNumber * randomNumber)}`;
  
  return finalPassword.replace(/[24557]/g, replaceWithSpecialChar);
};

const createUserData = (username, password, dir) => ({
  username,
  password,
  host: options.host,
  port: options.port,
  root: path.join(volumesDir, dir)
});

const users = {};

const createNewVolume = async (dir) => {
  const username = `user-${dir}`;
  const userFile = path.join(dataContainerDir, `${username}.json`);

  if (await fs.access(userFile).then(() => true).catch(() => false)) return;

  const password = generatePassword(dir);
  const userData = createUserData(username, password, dir);

  await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
  users[username] = { password, root: userData.root };
};

const watchVolumesDirectory = () => {
  setInterval(async () => {
    const newDirectories = (await getDirectories(volumesDir)).filter(dir => !(dir in users));
    await Promise.all(newDirectories.map(createNewVolume));
  }, 5000);
};

const initializeUsers = async () => {
  await fs.mkdir(dataContainerDir, { recursive: true });
  const directories = await getDirectories(volumesDir);

  await Promise.all(directories.map(async (dir) => {
    const username = `user-${dir}`;
    const userFile = path.join(dataContainerDir, `${username}.json`);

    let userData;
    try {
      userData = JSON.parse(await fs.readFile(userFile, 'utf8'));
    } catch {
      const password = generatePassword(dir);
      userData = createUserData(username, password, dir);
      await fs.writeFile(userFile, JSON.stringify(userData, null, 2));
    }

    users[username] = { password: userData.password, root: userData.root };
  }));
};

const createServer = () => {
  const server = new ftpd.FtpServer(options.host, {
    getInitialCwd: () => '/',
    getRoot: (connection, callback) => {
      const user = users[connection.username];
      user ? callback(null, user.root) : callback(new Error('No such user'));
    },
    pasvPortRangeStart: 1025,
    pasvPortRangeEnd: 1050,
    tlsOptions: options.tls,
    allowUnauthorizedTls: true,
    useWriteFile: false,
    useReadFile: false,
    uploadMaxSlurpSize: 7000,
    allowedCommands: ['XMKD', 'AUTH', 'TLS', 'SSL', 'USER', 'PASS', 'PWD', 'OPTS', 'TYPE', 'PORT', 'PASV', 'LIST', 'CWD', 'MKD', 'SIZE', 'STOR', 'MDTM', 'DELE', 'QUIT', 'RMD'],
  });

  server.on('error', (error) => log.error('FTP Server error:', error));

  server.on('client:connected', (connection) => {
    connection.on('command:user', (user, success, failure) => {
      users[user] ? success() : failure();
    });

    connection.on('command:pass', (pass, success, failure) => {
      const user = users[connection.username];
      user && user.password === pass ? success(connection.username) : failure();
    });
  });

  return server;
};

const start = async () => {
  await initializeUsers();
  watchVolumesDirectory();

  const server = createServer();
  server.debugging = 1;
  server.listen(options.port);
  log.info(`ftp server started on port ${options.port}`);
};

module.exports = { start };