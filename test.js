'use strict';
var amqpConfig = {
  connection: {
    host: 'rabbitmq',
    port: 5672,
    vhost: '/',
    user: 'guest',
    pass: 'guest'
  },
  exchanges: [
    {name: 'domain.events', type: 'topic', durable: true},
    {name: 'domain.events.DL', type: 'topic'},
    {name: 'domain.notifs', type: 'fanout', durable: true}
  ],
  queues: [
    {name: 'domain.events.queue', subscribe: true, messageTtl: 60000, deadLetterExchange: 'domain.events.DL'},
    {name: 'domain.notifs.queue', messageTtl: 60000}
  ],
  bindings: [
    {exchange: 'domain.events', target: 'domain.events.queue', keys: ['some.routing.key.*', 'someotherkey']},
    {exchange: 'domain.notifs', target: 'domain.notifs.queue'}
  ]
};

var logger = {
  error: function () {
    console.log.apply(this, arguments);
  }
};

var mq = require('./lib')(amqpConfig, logger);

mq.then(function (channel) {
  channel.consume('domain.events.queue', function (message) {
    console.log(message);
  });
});

