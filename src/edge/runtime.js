const config = require('../config');
const { configureDatabase } = require('../storage/postgres');
const { createBot } = require('../biology');
const { tick } = require('../biology/service');
const { handleApi } = require('../biology/api');
module.exports = { config, configureDatabase, createBot, tick, handleApi };
