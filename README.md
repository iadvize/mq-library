# mq-library [![npm version](https://badge.fury.io/js/mq-library.svg)](https://badge.fury.io/js/mq-library)

Wrapper around amqplib to Manage easily rabbitmq connections and binding declarations.

## Examples

```javascript

var amqpConfig = {
  connection: {
    host: 'rabbitmq',
    port: 5672,
    vhost: '/',
    user: 'guest',
    pass: 'guest',
    useConfirms: false
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

## Install

```bash
npm install mq-library --save
```

## Documentation

### How to publish a new version

```bash
npm install npm-release -g
npm-release [major|minor|patch]
```

npm-release is a little script to help release npm modules. It:

- Bumps the version in package.json
- Commits 'Release x.x.x'
- Tags
- Pushes to upstream
- Publish on npm (if `private:true` is not present in package.json)

## Contribute

Look at contribution guidelines here : [CONTRIBUTING.md](CONTRIBUTING.md)
