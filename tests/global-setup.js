// Before the first run (e.g. on a fresh clone), record the homepage once.
const fs = require('fs');
const { HAR } = require('./paths');
const record = require('./record');

module.exports = async () => {
  if (!fs.existsSync(HAR)) await record();
};
