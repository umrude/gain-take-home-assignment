// Before a run, record any page that hasn't been recorded yet (e.g. on a fresh clone).
const recordAll = require('./record');

module.exports = () => recordAll(undefined, { missingOnly: true });
