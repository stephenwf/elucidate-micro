#!/usr/bin/env node
const argv = require('yargs').argv;
const makeServer = require('../index');

const app = makeServer(argv, true);
