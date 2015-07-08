# MQ-library - Message Queuing Library

## Setup

```bash
npm install mq-library --save
```

## How to use

Define a configuration
```javascript

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
    {exchange: 'domain.events', target: 'domain.events.queue', keys: ['some.routing.key.*']},
    {exchange: 'domain.notifs', target: 'domain.notifs.queue'}
  ]
};

var mq = require('mq-library')(amqpConfig, logger);

mq.then(function (channel) {
  channel.consume('domain.events.queue', someFancyFunction);
  channel.consume('domain.notifs.queue', someOtherFancyFunction);
});
```

# [Changelog](/CHANGELOG.md)


# How to publish a new version

```bash
npm install npm-release -g
npm-release [major|minor|patch]
```
