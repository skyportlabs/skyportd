const ftpd = require('ftpd');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const logger = require('dreamsd/handlers/logger');

const log = new logger();

var server;
var options = {
  host: config.ftp.ip || '127.0.0.1',
  port: config.ftp.port || 21,
  tls: null,
};

function getDirectories(srcPath) {
  return fs.readdirSync(srcPath).filter(file => fs.statSync(path.join(srcPath, file)).isDirectory());
}

function generatePassword(dirName) {
    const sumOfDigits = dirName.split('').reduce((sum, char) => {
      return sum + (isNaN(parseInt(char)) ? 0 : parseInt(char));
    }, 0);
    const randomnumber = Math.floor(Math.random() * 900) + 10;
    const otherrandomnummber = Math.floor(Math.random() * randomnumber) + 10;
    const specialChars = "!@#$%&*_?~AaBbCcDdEeFfGgHhI!@#$%&*_?iJjKkLlMmNnO!@#$%&*_?oPpQqRrSsTtUuVvWwXxYyZz!@#$%&*_?";
    const replacedString = (sumOfDigits * (otherrandomnummber * randomnumber / otherrandomnummber ).toFixed(0)).toString()
                          .replace(/0/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)))
                          .replace(/4/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)))
                          .replace(/2/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)))
                          .replace(/8/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)))
                          .replace(/1/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)));
    const finalPassword1 = `${randomnumber}` + replacedString + `${randomnumber * (randomnumber / otherrandomnummber * randomnumber).toFixed(0)}`;
  
    const finalPassword2 = (finalPassword1).toString()
    .replace(/4/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)))
    .replace(/5/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)))
    .replace(/7/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)))
    .replace(/4/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)))
    .replace(/2/g, specialChars.charAt(Math.floor(Math.random() * specialChars.length)));
  
    return finalPassword2;
  }

const dataContainerDir = path.join(process.cwd(), 'sftpdatacontainer');
if (!fs.existsSync(dataContainerDir)) {
  fs.mkdirSync(dataContainerDir);
}

const volumesDir = path.join(process.cwd(), 'volumes');
const directories = getDirectories(volumesDir);

function watchVolumesDirectory() {
  setInterval(() => {
    const newDirectories = getDirectories(volumesDir).filter(dir => !(dir in users));
    newDirectories.forEach(dir => {
      createNewVolume(dir);
    });
  }, 5000);
}

function createNewVolume(dir) {
  const username = `user-${dir}`;
  const userFile = path.join(dataContainerDir, `${username}.json`);

  if (fs.existsSync(userFile)) {
    return;
  }

  const password = generatePassword(dir);

  const userData = {
    username: username,
    password: password,
    host: options.host,
    port: options.port,
    root: path.join(volumesDir, dir)
  };

  fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));

  users[username] = { password: password, root: userData.root };
}

watchVolumesDirectory();

const users = {};
directories.forEach(dir => {
  const username = `user-${dir}`;
  const userFile = path.join(dataContainerDir, `${username}.json`);
  let password;

  if (fs.existsSync(userFile)) {
    const userData = JSON.parse(fs.readFileSync(userFile));
    password = userData.password;
  } else {
    password = generatePassword(dir);
    const userData = {
      username: username,
      password: password,
      host: options.host,
      port: options.port,
      root: path.join(volumesDir, dir)
    };
    fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
  }

  users[username] = { password: password, root: path.join(volumesDir, dir) };
});

function start() {
  server = new ftpd.FtpServer(options.host, {
    getInitialCwd: function (connection) {
      return '/';
    },
    getRoot: function (connection, callback) {
      const user = connection.username;
      if (users[user]) {
        callback(null, users[user].root);
      } else {
        callback(new Error('No such user'));
      }
    },
    pasvPortRangeStart: 1025,
    pasvPortRangeEnd: 1050,
    tlsOptions: options.tls,
    allowUnauthorizedTls: true,
    useWriteFile: false,
    useReadFile: false,
    uploadMaxSlurpSize: 7000,
    allowedCommands: [
      'XMKD',
      'AUTH',
      'TLS',
      'SSL',
      'USER',
      'PASS',
      'PWD',
      'OPTS',
      'TYPE',
      'PORT',
      'PASV',
      'LIST',
      'CWD',
      'MKD',
      'SIZE',
      'STOR',
      'MDTM',
      'DELE',
      'QUIT',
      'RMD',
    ],
  });

  server.on('error', function (error) {
    console.log('FTP Server error:', error);
  });

  server.on('client:connected', function (connection) {
    connection.on('command:user', function (user, success, failure) {
      if (users[user]) {
        connection.username = user;
        success();
      } else {
        failure();
      }
    });

    connection.on('command:pass', function (pass, success, failure) {
      const user = connection.username;
      if (user && users[user] && users[user].password === pass) {
        success(user);
      } else {
        failure();
      }
    });
  });

  server.debugging = 1;
  server.listen(options.port);
  log.info(`FTP server Successfully started on port ${options.port}`);
}

module.exports = {
  start: start
};
