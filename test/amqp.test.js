'use strict';
/* global Promise, afterEach */

var assert = require('assert');
var amqplib = require('amqplib');
var mq = require('../lib');

function fakeChannel(overrides) {
  var calls = [];
  var channel = {
    calls: calls,
    assertExchange: function () {
      calls.push(['assertExchange'].concat([].slice.call(arguments)));
      return Promise.resolve();
    },
    assertQueue: function () {
      calls.push(['assertQueue'].concat([].slice.call(arguments)));
      return Promise.resolve();
    },
    bindQueue: function () {
      calls.push(['bindQueue'].concat([].slice.call(arguments)));
      return Promise.resolve();
    }
  };
  Object.keys(overrides || {}).forEach(function (key) {
    channel[key] = overrides[key];
  });
  return channel;
}

function baseConfig() {
  return {
    connection: { user: 'u', pass: 'p', host: 'h', port: 5672, vhost: '/' },
    exchanges: [],
    queues: [],
    bindings: []
  };
}

function silentLogger() {
  var logged = [];
  return { logged: logged, error: function () { logged.push([].slice.call(arguments)); } };
}

describe('mq-library', function () {
  var originalConnect = amqplib.connect;
  var originalExit = process.exit;
  var connectArgs;
  var channel;
  var connection;
  var exitCodes;

  beforeEach(function () {
    connectArgs = [];
    exitCodes = [];
    channel = fakeChannel();
    connection = {
      createChannel: function () { return Promise.resolve(channel); },
      createConfirmChannel: function () { return Promise.resolve('confirm-channel'); }
    };
    amqplib.connect = function () {
      connectArgs.push([].slice.call(arguments));
      return Promise.resolve(connection);
    };
    process.exit = function (code) { exitCodes.push(code); };
  });

  afterEach(function () {
    amqplib.connect = originalConnect;
    process.exit = originalExit;
  });

  describe('argument checks', function () {
    function throwsWith(config, logger, message) {
      assert.throws(function () { mq(config, logger); }, function (err) {
        return err instanceof assert.AssertionError && err.message === message;
      });
    }

    it('rejects a non-object config', function () {
      throwsWith(null, silentLogger(), 'Config should be an object');
      throwsWith('x', silentLogger(), 'Config should be an object');
    });

    it('accepts a function as config object (isObject semantics)', function () {
      var fn = function () {};
      var cfg = baseConfig();
      Object.keys(cfg).forEach(function (k) { fn[k] = cfg[k]; });
      mq(fn, silentLogger());
    });

    it('requires an own connection object', function () {
      var cfg = baseConfig();
      delete cfg.connection;
      throwsWith(cfg, silentLogger(), 'Config should have a connection object');

      var inherited = Object.create({ connection: baseConfig().connection });
      inherited.exchanges = [];
      inherited.queues = [];
      inherited.bindings = [];
      throwsWith(inherited, silentLogger(), 'Config should have a connection object');

      cfg = baseConfig();
      cfg.connection = 'amqp://x';
      throwsWith(cfg, silentLogger(), 'Config should have a connection object');
    });

    [['exchanges', 'an'], ['queues', 'a'], ['bindings', 'a']].forEach(function (entry) {
      var key = entry[0];
      var message = 'Config should have ' + entry[1] + ' ' + key + ' array';
      it('requires an own ' + key + ' array', function () {
        var cfg = baseConfig();
        cfg[key] = { length: 0 };
        throwsWith(cfg, silentLogger(), message);
        delete cfg[key];
        throwsWith(cfg, silentLogger(), message);
      });
    });

    it('requires a logger object', function () {
      throwsWith(baseConfig(), undefined, 'Logger should be an object');
      throwsWith(baseConfig(), 'logger', 'Logger should be an object');
    });

    it('requires logger.error to be a plain function, own or inherited', function () {
      throwsWith(baseConfig(), {}, 'Logger should have a method error');
      throwsWith(baseConfig(), { error: 'nope' }, 'Logger should have a method error');
      mq(baseConfig(), Object.create({ error: function () {} }));
    });

    it('rejects async and generator functions as logger.error (lodash 3 isFunction tag check)', function () {
      /* jshint evil: true */
      var asyncFn = new Function('return async function () {}')();
      var genFn = new Function('return function* () {}')();
      throwsWith(baseConfig(), { error: asyncFn }, 'Logger should have a method error');
      throwsWith(baseConfig(), { error: genFn }, 'Logger should have a method error');
    });

    it('accepts bound functions and classes as logger.error', function () {
      /* jshint evil: true */
      mq(baseConfig(), { error: function () {}.bind(null) });
      mq(baseConfig(), { error: new Function('return class {}')() });
    });

    it('fails on a connection object holding the nested user.pass.host.port.vhost path', function () {
      var cfg = baseConfig();
      cfg.connection.user = { pass: { host: { port: { vhost: 1 } } } };
      assert.throws(function () { mq(cfg, silentLogger()); }, assert.AssertionError);
    });

    it('fails on a connection object holding the literal "user,pass,host,port,vhost" key', function () {
      var cfg = baseConfig();
      cfg.connection['user,pass,host,port,vhost'] = 1;
      assert.throws(function () { mq(cfg, silentLogger()); }, assert.AssertionError);
    });
  });

  describe('connection', function () {
    it('connects with the url built from the connection config, as the only argument', function () {
      var cfg = baseConfig();
      cfg.connection.vhost = '/my vhost';
      return mq(cfg, silentLogger()).then(function () {
        assert.deepStrictEqual(connectArgs, [['amqp://u:p@h:5672/%2Fmy%20vhost']]);
      });
    });

    it('builds the url from undefined fields as empty strings', function () {
      var cfg = baseConfig();
      cfg.connection = { host: 'h' };
      return mq(cfg, silentLogger()).then(function () {
        assert.deepStrictEqual(connectArgs, [['amqp://:@h:/undefined']]);
      });
    });

    it('creates a regular channel by default and resolves with it', function () {
      return mq(baseConfig(), silentLogger()).then(function (result) {
        assert.strictEqual(result, channel);
      });
    });

    it('creates a confirm channel when useConfirms is truthy', function () {
      var cfg = baseConfig();
      cfg.connection.useConfirms = true;
      connection.createConfirmChannel = function () { return Promise.resolve(channel); };
      connection.createChannel = function () { throw new Error('should not be called'); };
      return mq(cfg, silentLogger()).then(function (result) {
        assert.strictEqual(result, channel);
      });
    });

    it('logs and exits when the connection fails', function () {
      var logger = silentLogger();
      var failure = new Error('ECONNREFUSED');
      amqplib.connect = function () { return Promise.reject(failure); };
      return mq(baseConfig(), logger).then(function () {
        assert.deepStrictEqual(logger.logged, [['Unable to connect to amqp server:: ', failure]]);
        assert.deepStrictEqual(exitCodes, [1]);
      });
    });

    it('logs and exits when the channel creation fails', function () {
      var logger = silentLogger();
      var failure = new Error('channel');
      connection.createChannel = function () { return Promise.reject(failure); };
      return mq(baseConfig(), logger).then(function () {
        assert.deepStrictEqual(logger.logged, [['ERROR MESSAGE:: ', failure]]);
        assert.deepStrictEqual(exitCodes, [1]);
      });
    });
  });

  describe('topology', function () {
    it('asserts exchanges with the remaining fields as a shallow copy of options', function () {
      var cfg = baseConfig();
      var args = { 'alternate-exchange': 'ae' };
      var proto = { inheritedOption: true };
      var exchange = Object.create(proto);
      exchange.name = 'ex';
      exchange.type = 'topic';
      exchange.durable = true;
      exchange.arguments = args;
      cfg.exchanges = [exchange, { name: 'ex2', type: 'fanout' }];
      return mq(cfg, silentLogger()).then(function () {
        var exchangeCalls = channel.calls.filter(function (c) { return c[0] === 'assertExchange'; });
        assert.strictEqual(exchangeCalls.length, 2);
        assert.deepStrictEqual(exchangeCalls[0].slice(0, 3), ['assertExchange', 'ex', 'topic']);
        assert.strictEqual(exchangeCalls[0].length, 4);
        var options = exchangeCalls[0][3];
        assert.deepStrictEqual(Object.keys(options).sort(), ['arguments', 'durable', 'inheritedOption']);
        assert.strictEqual(options.arguments, args);
        assert.notStrictEqual(options, exchange);
        assert.deepStrictEqual(exchangeCalls[1], ['assertExchange', 'ex2', 'fanout', {}]);
      });
    });

    it('asserts queues with every field but the name as options', function () {
      var cfg = baseConfig();
      cfg.queues = [{ name: 'q', durable: false, type: 'kept' }];
      return mq(cfg, silentLogger()).then(function () {
        var queueCalls = channel.calls.filter(function (c) { return c[0] === 'assertQueue'; });
        assert.deepStrictEqual(queueCalls, [['assertQueue', 'q', { durable: false, type: 'kept' }]]);
      });
    });

    it('binds every key of an array, in order', function () {
      var cfg = baseConfig();
      cfg.bindings = [{ target: 'q', exchange: 'ex', keys: ['a.b', 'c.*'] }];
      return mq(cfg, silentLogger()).then(function () {
        var bindCalls = channel.calls.filter(function (c) { return c[0] === 'bindQueue'; });
        assert.deepStrictEqual(bindCalls, [['bindQueue', 'q', 'ex', 'a.b'], ['bindQueue', 'q', 'ex', 'c.*']]);
      });
    });

    it('binds with "#" when no keys are given', function () {
      var cfg = baseConfig();
      cfg.bindings = [{ target: 'q', exchange: 'ex' }, { target: 'q2', exchange: 'ex', keys: [] }];
      return mq(cfg, silentLogger()).then(function () {
        var bindCalls = channel.calls.filter(function (c) { return c[0] === 'bindQueue'; });
        assert.deepStrictEqual(bindCalls, [['bindQueue', 'q', 'ex', '#']]);
      });
    });

    it('binds a string key character by character (lodash 3 collection semantics)', function () {
      var cfg = baseConfig();
      cfg.bindings = [{ target: 'q', exchange: 'ex', keys: 'ab' }];
      return mq(cfg, silentLogger()).then(function () {
        var bindCalls = channel.calls.filter(function (c) { return c[0] === 'bindQueue'; });
        assert.deepStrictEqual(bindCalls, [['bindQueue', 'q', 'ex', 'a'], ['bindQueue', 'q', 'ex', 'b']]);
      });
    });

    it('binds the values of a keys object', function () {
      var cfg = baseConfig();
      cfg.bindings = [{ target: 'q', exchange: 'ex', keys: { first: 'k1', second: 'k2' } }];
      return mq(cfg, silentLogger()).then(function () {
        var bindCalls = channel.calls.filter(function (c) { return c[0] === 'bindQueue'; });
        assert.deepStrictEqual(bindCalls, [['bindQueue', 'q', 'ex', 'k1'], ['bindQueue', 'q', 'ex', 'k2']]);
      });
    });

    it('declares exchanges, then queues, then bindings', function () {
      var cfg = baseConfig();
      cfg.exchanges = [{ name: 'ex', type: 'topic' }];
      cfg.queues = [{ name: 'q' }];
      cfg.bindings = [{ target: 'q', exchange: 'ex', keys: ['k'] }];
      return mq(cfg, silentLogger()).then(function () {
        assert.deepStrictEqual(channel.calls.map(function (c) { return c[0]; }),
          ['assertExchange', 'assertQueue', 'bindQueue']);
      });
    });

    it('stops iterating exchanges when an assertion returns false', function () {
      var cfg = baseConfig();
      cfg.exchanges = [{ name: 'a', type: 'topic' }, { name: 'b', type: 'topic' }];
      var asserted = [];
      channel.assertExchange = function (name) { asserted.push(name); return false; };
      return mq(cfg, silentLogger()).then(function () {
        assert.deepStrictEqual(asserted, ['a']);
      });
    });

    it('resolves with the channel without waiting for the declarations', function () {
      var cfg = baseConfig();
      cfg.queues = [{ name: 'q' }];
      channel.assertQueue = function () { return new Promise(function () {}); };
      return mq(cfg, silentLogger()).then(function (result) {
        assert.strictEqual(result, channel);
      });
    });

    it('rejects when a declaration throws synchronously, without exiting', function () {
      var cfg = baseConfig();
      cfg.queues = [{ name: 'q' }];
      var failure = new Error('sync');
      channel.assertQueue = function () { throw failure; };
      var logger = silentLogger();
      return mq(cfg, logger).then(function () {
        throw new Error('should have rejected');
      }, function (err) {
        assert.strictEqual(err, failure);
        assert.deepStrictEqual(logger.logged, []);
        assert.deepStrictEqual(exitCodes, []);
      });
    });
  });
});
