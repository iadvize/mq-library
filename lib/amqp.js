'use strict';

var amqp = require('amqplib');
var when = require('when');
var assert = require('assert');

var hasOwnProperty = Object.prototype.hasOwnProperty;
var objectToString = Object.prototype.toString;
var slice = Array.prototype.slice;

module.exports = function (config, logger) {
  assert(isObject(config), 'Config should be an object');
  assert(has(config, 'connection') && isObject(config.connection), 'Config should have a connection object');
  assert(has(config, 'exchanges') && Array.isArray(config.exchanges), 'Config should have an exchanges array');
  assert(has(config, 'queues') && Array.isArray(config.queues), 'Config should have a queues array');
  assert(has(config, 'bindings') && Array.isArray(config.bindings), 'Config should have a bindings array');
  assert(isObject(logger), 'Logger should be an object');
  assert(isFunction(logger.error), 'Logger should have a method error');

  // create url
  var url = defineUrl(config.connection);

  var connection = partialRight(createConnection, url);
  var channel = partialRight(createChannel, config.connection.useConfirms);
  var error = partial(errorHandler, logger);
  var connectionError = partial(connectionErrorHandler, logger);
  var assertCfg = partialRight(assertConfiguration, config);

  return when(amqp)
    .then(connection, error)
    .then(channel, connectionError)
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
function createChannel(connection, useConfirms) {
  return useConfirms ? connection.createConfirmChannel() : connection.createChannel();
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
  var createExchange = partial(defineExchange, channel);
  var createQueue = partial(defineQueue, channel);
  var createQueueBinding = partial(defineQueueBinding, channel);

  var promise = [];

  // Ensure exhanges are created
  promise.push(forEach(config.exchanges, createExchange));

  // Ensure Queues are created
  promise.push(forEach(config.queues, createQueue));

  // Ensure bindings are created
  promise.push(forEach(config.bindings, createQueueBinding));

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
    omit(entity, ['name', 'type'])
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
  return channel.assertQueue(entity.name, omit(entity, ['name']));
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
    map(keys, function (key) {
      return channel.bindQueue(entity.target, entity.exchange, key);
    })
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
  assert(!hasPath(config, ['user', 'pass', 'host', 'port', 'vhost']));

  var crediential = [config.user, config.pass].join(':');
  var hostPort = [config.host, config.port].join(':');

  return 'amqp://' + crediential + '@' + hostPort + '/' + encodeURIComponent(config.vhost);
}

/*
 * Native replacements for the lodash 3.10 helpers this file used. They keep
 * the lodash 3 semantics on purpose (see test/amqp.test.js); do not swap them
 * for the closest native API without checking the tests.
 */

function isObject(value) {
  var type = typeof value;
  return !!value && (type === 'object' || type === 'function');
}

// Tag check: async and generator functions are rejected, as with lodash 3.
function isFunction(value) {
  return isObject(value) && objectToString.call(value) === '[object Function]';
}

function isLength(value) {
  return typeof value === 'number' && value > -1 && value % 1 === 0 && value <= Number.MAX_SAFE_INTEGER;
}

function isNil(value) {
  return value === null || value === undefined;
}

function has(object, key) {
  return !isNil(object) && hasOwnProperty.call(object, key);
}

// _.has(object, pathArray): the array as one key first, then the nested path.
function hasPath(object, path) {
  if (has(object, path)) {
    return true;
  }
  var parent = object;
  for (var index = 0; index < path.length - 1; index++) {
    if (isNil(parent)) {
      return false;
    }
    parent = parent[path[index]];
  }
  return has(parent, path[path.length - 1]);
}

// Partially applied arguments go first; `this` is passed through.
function partial(func) {
  var bound = slice.call(arguments, 1);
  return function () {
    return func.apply(this, bound.concat(slice.call(arguments)));
  };
}

// Partially applied arguments go after every call-time argument.
function partialRight(func) {
  var bound = slice.call(arguments, 1);
  return function () {
    return func.apply(this, slice.call(arguments).concat(bound));
  };
}

// Visits every index (holes included) and stops when the iteratee returns false.
function forEach(array, iteratee) {
  for (var index = 0, length = array.length; index < length; index++) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

// Array-likes (strings included) by index, other objects by own enumerable values.
function map(collection, iteratee) {
  var result = [];
  var iterable = Object(collection);
  var length = collection ? iterable.length : 0;
  var index;
  if (isLength(length)) {
    for (index = 0; index < length; index++) {
      result.push(iteratee(iterable[index], index, iterable));
    }
  } else if (isObject(collection)) {
    Object.keys(collection).forEach(function (key) {
      result.push(iteratee(collection[key], key, collection));
    });
  }
  return result;
}

// Own and inherited enumerable keys, shallow copy.
function omit(object, props) {
  var result = {};
  /* jshint forin: false */
  for (var key in object) {
    if (props.indexOf(key) === -1) {
      result[key] = object[key];
    }
  }
  return result;
}
