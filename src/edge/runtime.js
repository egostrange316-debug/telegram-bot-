const config = require('../config');
const { configureDatabase } = require('../storage/postgres');
const { createBot } = require('../biology');
const { tick } = require('../biology/service');
module.exports = { config, configureDatabase, createBot, tick };
