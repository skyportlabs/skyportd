const Keyv = require('keyv');
const db = new Keyv('sqlite://skyportd.db');

module.exports = { db }