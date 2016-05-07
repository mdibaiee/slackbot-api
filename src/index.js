if (!global._babelPolyfill) {
  require('babel/polyfill');
}
module.exports = require('./bot').default;
