'use strict';

var amqp = require('amqplib');
var _ = require('lodash');
var when = require('when');
var assert = require('assert');

module.exports = function (config, logger) {
  assert(_.isObject(config), 'Config should be an object');
  assert(_.has(config, 'connection') && _.isObject(config.connection), 'Config should have a connection object');
  assert(_.has(config, 'exchanges') && _.isArray(config.exchanges), 'Config should have an exchanges array');
  assert(_.has(config, 'queues') && _.isArray(config.queues), 'Config should have a queues array');
  assert(_.has(config, 'bindings') && _.isArray(config.bindings), 'Config should have a bindings array');
  assert(_.isObject(logger), 'Logger should be an object');
  assert(_.has(logger, 'error') && _.isFunction(logger.error), 'Logger should have a method error');

  // create url
  var url = defineUrl(config.connection);

  var connection = _.partialRight(createConnection, url);
  var error = _.partial(errorHandler, logger);
  var connectionError = _.partial(connectionErrorHandler, logger);
  var assertCfg = _.partialRight(assertConfiguration, config);

  return when(amqp)
    .then(connection, error)
    .then(createChannel, connectionError)
    .then(assertCfg, error);
};

/**
 * CreateConnection to AMQP
 *
 * @param {Amqp} amqp
 * @param {string} url
 *
 * @return {AmqpConnection}
 */
function createConnection(amqp, url) {
  return amqp.connect(url);
}

/**
 * Create AMQP channel
 *
 * @param {AmqpConnection} connection
 *
 * @return {AmqpChannel}
 */
function createChannel(connection) {
  return connection.createChannel();
}

/**
 * assertConfiguration() ensure that configuration queue/exchange/binding are available
 *
 * @param {AmqpChannel} channel
 * @param {Object} config
 *
 * @return {Promise}
 */
function assertConfiguration(channel, config) {
  var createExchange = _.partial(defineExchange, channel);
  var createQueue = _.partial(defineQueue, channel);
  var createQueueBinding = _.partial(defineQueueBinding, channel);

  var promise = [];

  // Ensure exhanges are created
  promise.push(
    _.chain(config.exchanges)
      .each(createExchange)
      .value()
  );

  // Ensure Queues are created
  promise.push(
    _.chain(config.queues)
      .each(createQueue)
      .value()
  );

  // Ensure bindings are created
  promise.push(
    _.chain(config.bindings)
      .each(createQueueBinding)
      .value()
  );

  return when.all(promise).then(function() {
    return channel;
  });
}

/**
 * defineExchange() will assert exchange against provided channel
 *
 * @param {AmqpChannel} channel
 * @param {Object} entity Exchange configuration
 *
 * @return {Promise}
 */
function defineExchange(channel, entity) {
  return channel.assertExchange(
    entity.name,
    entity.type,
    _.omit(entity, ['name', 'type'])
  );
}

/**
 * defineQueue() will assert queue against provided channel
 *
 * @param {AmqpChannel} channel
 * @param {Object} entity Queue configuration
 *
 * @return {Promise}
 */
function defineQueue(channel, entity) {
  return channel.assertQueue(entity.name, _.omit(entity, ['name']));
}

/**
 * defineQueueBinding() will assert binding against provided channel
 *
 * @param {AmqpChannel} channel
 * @param {Object} entity Binding configuration
 *
 * @return {Promise}
 */

function defineQueueBinding(channel, entity) {
  var keys = entity.keys || '#';

  return when(
    _.chain(keys)
      .map(function (key) {
        return channel.bindQueue(entity.target, entity.exchange, key);
      })
      .value()
  );
}

/**
 * Error handling
 *
 * @param {Logger} logger
 * @param {string} message
 */
function errorHandler(logger, message) {
  logger.error('ERROR MESSAGE:: ', message);
  process.exit(1);
}

/**
 * Error handling
 *
 * @param {Logger} logger
 * @param {string} message
 */
function connectionErrorHandler(logger, message) {
  logger.error('Unable to connect to amqp server:: ', message);
  process.exit(1);
}

/**
 * Construct amqp url
 *
 * @param {Object} config Amqp configuration
 *
 * @return {string}
 */
function defineUrl(config) {
  assert(!_.has(config, ['user', 'pass', 'host', 'port', 'vhost']));

  var crediential = [config.user, config.pass].join(':');
  var hostPort = [config.host, config.port].join(':');

  return 'amqp://' + crediential + '@' + hostPort + '/' + encodeURIComponent(config.vhost);
}
