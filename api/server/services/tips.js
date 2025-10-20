'use strict';
const { getTipsList } = require('../prompts');

async function getTips() {
  return getTipsList();
}
module.exports = { getTips };
