import 'mocha';
import chai from 'chai';
import Bot, { messageMethods, fullExec } from '../src/bot';
import sinon from 'sinon';
import WebSocket from 'ws';
import express from 'express';

chai.should();

const DELAY = 10;
const LONG_DELAY = 3000;

const GROUP = 'test-bot';
const GROUPID = 'G0123123';
const DIRECTID = 'D0123123';
const NAME = 'test';
const USERNAME = 'user';
const USERID = 'U123123';
const IMID = 'D123123';
const NOIMUSERID = 'U123124';
const NOIMUSERNAME = 'user-no-im';

describe('Bot', function test() {
  this.timeout(LONG_DELAY);
  let bot;
  let ws;
  let app;
  let server;

  beforeEach(() => {
    if (server) server.close();
    if (ws) ws.close();

    ws = new WebSocket.Server({ port: 9090 });
    app = express();
    server = app.listen(9091);

    bot = new Bot({}, true);
    Object.assign(bot, {
      channels: [], bots: [],
      users: [{
        name: USERNAME,
        id: USERID
      }, {
        name: NOIMUSERNAME,
        id: NOIMUSERID
      }],
      ims: [{
        id: IMID,
        user: USERID
      }],
      groups: [{
        name: GROUP,
        id: GROUPID
      }],
      self: {
        name: NAME,
        profile: {
          image_original: ''
        }
      }
    });

    ws._events = {};

    bot.connect('ws://127.0.0.1:9090');
    bot._api = 'http://127.0.0.1:9091/';
  });

  describe('constructor', () => {
    it('should connect to websocket server', done => {
      bot.on('raw_message', () => done());

      ws.on('connection', socket => {
        socket.send('{}');
      });
    });
  });

  describe('hear', () => {
    it('should test messages against regexp correctly', done => {
      const cb = sinon.spy();
      bot.hear(/Testing@\d+/, cb);

      setImmediate(() => {
        cb.called.should.equal(true);

        done();
      });

      const listener = bot._events.message;
      listener({
        text: 'Testing@123',
        channel: GROUPID
      });
    });

    it('should not crash when message doesn\'t have text property', done => {
      bot.hear(() => 0);

      const listener = bot._events.message;

      listener.bind(bot, {}).should.not.throw();

      done();
    });

    it('should provide preformatted version of @mentions', done => {
      ws.on('connection', socket => {
        socket.on('message', () => {
          socket.send(JSON.stringify({
            type: 'message',
            channel: GROUPID,
            text: `<@${USERID}>`
          }));
        });
      });

      bot.on('open', () => {
        bot.hear(message => {
          message.preformatted.should.equal(`@${USERNAME}`);

          done();
        });
        bot.sendMessage(GROUP, 'x');
      });
    });

    it('should provide preformatted version of #channels', done => {
      ws.on('connection', socket => {
        socket.on('message', () => {
          socket.send(JSON.stringify({
            type: 'message',
            channel: GROUPID,
            text: `<#${GROUPID}>`
          }));
        });
      });

      bot.on('open', () => {
        bot.hear(message => {
          message.preformatted.should.equal(`#${GROUP}`);

          done();
        });
        bot.sendMessage(GROUP, 'x');
      });
    });

    it('should provide preformatted version of <http://urls>', done => {
      ws.on('connection', socket => {
        socket.on('message', () => {
          socket.send(JSON.stringify({
            type: 'message',
            channel: GROUPID,
            text: `<http://test.com>`
          }));
        });
      });

      bot.on('open', () => {
        bot.hear(message => {
          message.preformatted.should.equal(`http://test.com`);

          done();
        });
        bot.sendMessage(GROUP, 'x');
      });
    });
  });

  describe('listen', () => {
    it('should only match if the bot name is mentioned', done => {
      const cb = sinon.spy();
      bot.listen(/hi/, cb);

      setImmediate(() => {
        cb.calledOnce.should.equal(true);

        done();
      }, DELAY);

      const listener = bot._events.message;
      listener({
        text: 'hi',
        channel: GROUPID
      });
      listener({
        text: `hi ${NAME}`,
        channel: GROUPID
      });
    });

    it('should not require mentioning bot name in case of IM', done => {
      const cb = sinon.spy();
      bot.listen(/hi/, cb);

      setImmediate(() => {
        cb.calledOnce.should.equal(true);

        done();
      }, DELAY);

      const listener = bot._events.message;
      listener({
        text: 'hi',
        channel: DIRECTID
      });
    });

    it('should match against bot name when regex argument is omitted', done => {
      const cb = sinon.spy();
      bot.listen(cb);

      setImmediate(() => {
        cb.calledOnce.should.equal(true);

        done();
      });

      const listener = bot._events.message;
      listener({
        text: 'ok',
        channel: GROUPID
      });
      listener({
        text: NAME,
        channel: GROUPID
      });
    });
  });

  describe('icon', () => {
    it('should set emoji icon correctly', done => {
      bot.icon(':rocket:');
      bot.globals.icon_emoji.should.equal(':rocket:');

      done();
    });

    it('should set url icon correctly', done => {
      bot.icon('http://folan.com');
      bot.globals.icon_url.should.equal('http://folan.com');

      done();
    });

    it('should clear property in case of falsy input', done => {
      bot.icon();
      bot.globals.should.not.have.property('icon_url');
      bot.globals.should.not.have.property('icon_emoji');

      done();
    });
  });

  describe('sendMessage', () => {
    it('should send to group correctly', done => {
      ws.on('connection', socket => {
        socket.on('message', message => {
          const msg = JSON.parse(message);

          msg.text.should.equal('sendMessage-group');
          msg.channel.should.equal(GROUPID);
          msg.type.should.equal('message');
          done();
        });
      });

      bot.on('open', () => {
        bot.sendMessage(GROUP, 'sendMessage-group');
      });
    });

    it('should open an IM channel if one doesn\'t exist when sending message to users', done => {
      ws.on('connection', socket => {
        socket.on('message', message => {
          const msg = JSON.parse(message);
          msg.channel.should.equal(IMID);

          done();
        });
      });

      app.get('/im.open', (request, response) => {
        request.query.user.should.equal(NOIMUSERID);

        response.json({
          channel: {
            id: IMID
          }
        });

        done();
      });

      bot.on('open', () => {
        bot.sendMessage(NOIMUSERNAME, 'test');
      });
    });

    it('should not search for channel if an ID is provided', done => {
      // an ID that doesn't exist in `bot.all()`
      // if `sendMessage` tries to find the channel, it will throw an error
      // else, our test will pass
      ws.on('connection', socket => {
        socket.on('message', message => {
          const msg = JSON.parse(message);
          msg.channel.should.equal(GROUPID);
          done();
        });
      });

      bot.on('open', () => {
        bot.sendMessage(GROUPID, 'sendMessage-group');
      });
    });

    it('should catch server replies to that message', done => {
      ws.on('connection', socket => {
        let ok = true;

        socket.on('message', message => {
          const msg = JSON.parse(message);

          const response = {
            reply_to: msg.id,
            ok
          };

          ok = !ok;

          socket.send(JSON.stringify(response));
        });
      });

      bot.on('open', () => {
        bot.sendMessage(GROUP, 'test').then(reply => {
          reply.ok.should.equal(true);
        });

        bot.sendMessage(GROUP, 'test').then(() => 0, reply => {
          reply.ok.should.equal(false);

          done();
        });
      });
    });

    it('should send message to multiple channels', done => {
      let callCount = 0;

      ws.on('connection', socket => {
        socket.on('message', message => {
          callCount++;
          const msg = JSON.parse(message);

          const response = {
            reply_to: msg.id
          };

          socket.send(JSON.stringify(response));
        });
      });

      bot.on('open', () => {
        bot.sendMessage([GROUP, GROUP], 'Hey').then(() => {
          callCount.should.equal(2);

          done();
        });
      });
    });

    it('should send message to @usernames directly, through HTTP', done => {
      app.get('/chat.postMessage', request => {
        request.query.channel.should.equal('@test');

        done();
      });

      bot.on('open', () => {
        bot.sendMessage('@test', 'Hey');
      });
    });

    it('should send message to IMs when a username is provided', done => {
      ws.on('connection', socket => {
        socket.on('message', message => {
          const msg = JSON.parse(message);

          msg.channel.should.equal(IMID);
          done();
        });
      });

      bot.on('open', () => {
        bot.sendMessage(USERNAME, 'Hey');
      });
    });

    it('should throw error in case of unavailable channel', done => {
      bot.on('open', () => {
        const r = Math.random().toString();
        bot.sendMessage(r, 'Hey').then(() => {
          //
        }, () => done());
      });
    });

    it('should be able to send message through chat.postMessage instead of ws', done => {
      app.get('/chat.postMessage', () => done());

      bot.on('open', () => {
        bot.sendMessage(GROUP, 'test', {
          websocket: false
        });
      });
    });
  });

  describe('message events', () => {
    const timestamps = ['0000', '1111'];

    it('should emit "updated" event', done => {
      ws.on('connection', socket => {
        let i = 0;

        socket.on('message', message => {
          const msg = JSON.parse(message);

          const reply = {
            ok: true,
            reply_to: msg.id,
            ts: timestamps[i++]
          };

          socket.send(JSON.stringify(reply));
        });

        app.get('/chat.update', (request, response) => {
          const msg = request.query;

          response.json({ ok: true });

          const update = {
            type: 'message',
            subtype: 'message_changed',
            ts: msg.ts,
            channel: msg.channel,
            message: msg
          };
          socket.send(JSON.stringify(update));
        });
      });

      bot.on('open', async () => {
        const msg = await bot.sendMessage(GROUPID, 'folan');
        const other = await bot.sendMessage(GROUPID, 'folan');
        const cb = sinon.spy();

        other.on('update', cb);
        msg.on('update', () => {
          cb.called.should.equal(false);
          done();
        });

        msg.update('hey');
      });
    });

    it('should emit "delete" event', done => {
      ws.on('connection', socket => {
        let i = 0;

        socket.on('message', message => {
          const msg = JSON.parse(message);

          const reply = {
            ok: true,
            reply_to: msg.id,
            ts: timestamps[i++]
          };

          socket.send(JSON.stringify(reply));
        });

        app.get('/chat.delete', (request, response) => {
          const msg = request.query;

          response.json({ ok: true });

          const deleted = {
            type: 'message',
            subtype: 'message_deleted',
            ts: msg.ts,
            channel: msg.channel
          };
          socket.send(JSON.stringify(deleted));
        });
      });

      bot.on('open', async () => {
        const msg = await bot.sendMessage(GROUPID, 'folan');
        const other = await bot.sendMessage(GROUPID, 'folan');
        const cb = sinon.spy();

        other.on('delete', cb);
        msg.on('delete', () => {
          cb.called.should.equal(false);
          done();
        });

        msg.delete();
      });
    });

    it('should emit "reaction_added" event', done => {
      ws.on('connection', socket => {
        let i = 0;

        socket.on('message', message => {
          const msg = JSON.parse(message);

          const reply = {
            ok: true,
            reply_to: msg.id,
            ts: timestamps[i++]
          };

          socket.send(JSON.stringify(reply));
        });

        app.get('/reactions.add', (request, response) => {
          const msg = request.query;

          response.json({ ok: true });

          const reaction = {
            type: 'reaction_added',
            item: {
              ts: msg.timestamp,
              channel: msg.channel
            }
          };
          socket.send(JSON.stringify(reaction));
        });
      });

      bot.on('open', async () => {
        const msg = await bot.sendMessage(GROUPID, 'folan');
        const other = await bot.sendMessage(GROUPID, 'folan');
        const cb = sinon.spy();

        other.on('reaction_added', cb);
        msg.on('reaction_added', () => {
          cb.called.should.equal(false);
          done();
        });

        msg.react(':rocket:');
      });
    });


    it('should emit "reaction_removed" event', done => {
      ws.on('connection', socket => {
        let i = 0;

        socket.on('message', message => {
          const msg = JSON.parse(message);

          const reply = {
            ok: true,
            reply_to: msg.id,
            ts: timestamps[i++]
          };

          socket.send(JSON.stringify(reply));
        });

        app.get('/reactions.remove', (request, response) => {
          const msg = request.query;

          response.json({ ok: true });

          const reaction = {
            type: 'reaction_removed',
            item: {
              ts: msg.timestamp,
              channel: msg.channel
            }
          };
          socket.send(JSON.stringify(reaction));
        });
      });

      bot.on('open', async () => {
        const msg = await bot.sendMessage(GROUPID, 'folan');
        const other = await bot.sendMessage(GROUPID, 'folan');
        const cb = sinon.spy();

        other.on('reaction_removed', cb);
        msg.on('reaction_removed', () => {
          cb.called.should.equal(false);
          done();
        });

        bot.call('reactions.remove', {
          timestamp: msg.ts,
          channel: msg.channel,
          name: ':rocket:'
        });
      });
    });

    describe('off', () => {
      it('should remove the listener', done => {
        const msg = messageMethods(bot);

        const listener = () => 0;
        msg.on('update', listener);
        msg.off('update', listener);

        bot.messageListeners.length.should.equal(0);
        done();
      });
    });
  });

  describe('random', () => {
    it('should return a random item of inputs', done => {
      const options = ['Hi', 'Hey', 'Ay'];
      bot.random(...options).should.satisfy(result =>
        options.indexOf(result) > -1
      );

      done();
    });
  });

  describe('emojis', () => {
    it('should send request to API emoji.list', done => {
      app.get('/emoji.list', () => {
        done();
      });

      bot.emojis();
    });
  });

  describe('react', () => {
    it('should send request to API reactions.add', done => {
      app.get('/reactions.add', request => {
        request.query.channel.should.equal(GROUPID);
        request.query.timestamp.should.equal('123123');
        request.query.name.should.equal('rocket');
        done();
      });

      bot.react(GROUP, 123123, 'rocket');
    });
  });

  describe('updateMessage', () => {
    it('should send request to API chat.update', done => {
      app.get('/chat.update', request => {
        request.query.channel.should.equal(GROUPID);
        request.query.ts.should.equal('123123');
        request.query.text.should.equal('newtext');
        done();
      });

      bot.updateMessage(GROUP, 123123, 'newtext');
    });
  });

  describe('deleteMessage', () => {
    it('should send request to API chat.delete', done => {
      app.get('/chat.delete', request => {
        request.query.channel.should.equal(GROUPID);
        request.query.ts.should.equal('123123');
        done();
      });

      bot.deleteMessage(GROUP, 123123);
    });
  });

  describe('message methods', () => {
    it('should update messages correctly', done => {
      app.get('/chat.update', request => {
        request.query.channel.should.equal(GROUPID);
        request.query.ts.should.equal('123123');
        request.query.text.should.equal('newtext');

        done();
      });

      const msg = Object.assign({
        ts: '123123',
        channel: GROUPID
      }, messageMethods(bot));

      msg.update('newtext');
    });

    it('should delete messages correctly', done => {
      app.get('/chat.delete', request => {
        request.query.channel.should.equal(GROUPID);
        request.query.ts.should.equal('123123');

        done();
      });

      const msg = Object.assign({
        ts: '123123',
        channel: GROUPID
      }, messageMethods(bot));

      msg.delete();
    });

    it('should react to messages correctly', done => {
      app.get('/reactions.add', request => {
        request.query.channel.should.equal(GROUPID);
        request.query.timestamp.should.equal('123123');
        request.query.name.should.equal('thumbsup');

        done();
      });

      const msg = Object.assign({
        ts: '123123',
        channel: GROUPID
      }, messageMethods(bot));

      msg.react('thumbsup');
    });

    it('should reply to messages correctly', done => {
      ws.on('connection', socket => {
        socket.on('message', message => {
          const msg = JSON.parse(message);

          msg.channel.should.equal(GROUPID);
          msg.text.should.equal('hi');

          done();
        });
      });

      bot.on('open', () => {
        const msg = Object.assign({
          channel: GROUPID
        }, messageMethods(bot));

        msg.reply('hi');
      });
    });
  });

  describe('all', () => {
    it('should return concated lists of channels, groups, users, ...', done => {
      const all = bot.all();

      const len = bot.users.length + bot.ims.length + bot.groups.length;
      all.should.have.length(len);

      done();
    });
  });

  describe('find', () => {
    it('should find using name or id', done => {
      bot.find(GROUP).should.equal(bot.groups[0]);
      bot.find(GROUPID).should.equal(bot.groups[0]);

      done();
    });
  });

  describe('type', () => {
    it('should detect name/id', done => {
      bot.type(GROUP).should.equal('NAME');
      bot.type(GROUPID).should.equal('ID');

      done();
    });
  });

  describe('ping', () => {
    it('should send a ping message every `pingInterval`', done => {
      const interval = 5;
      bot = new Bot({
        pingInterval: interval
      }, true);

      bot.connect('ws://127.0.0.1:9090');
      bot._api = 'http://127.0.0.1:9091/';

      let messageCounter = 0;
      let intervalCounter = 0;

      ws.on('connection', socket => {
        socket.on('message', message => {
          messageCounter++;

          const msg = JSON.parse(message);
          msg.type.should.equal('ping');

          intervalCounter.should.equal(messageCounter);
          if (intervalCounter === 2) done();
        });
      });

      bot.on('open', () => {
        setInterval(() => intervalCounter++, interval);
      });
    });
  });

  describe('utilities', () => {
    describe('fullExec', () => {
      it('should match all instances of a group', done => {
        const string = 'a b c d';
        fullExec(/(\w+)/g, string).should.deep.equal(string.split(' '));

        done();
      });

      it('should not crash/loop infinitely in case of a single match', done => {
        const string = 'test';
        fullExec(/(.*)/g, string).should.deep.equal([string]);

        done();
      });

      it('should not crash/loop infinitely in case of non-global regex', done => {
        const string = 'test';
        fullExec(/.*/, string).should.deep.equal(/.*/.exec(string));

        done();
      });
    });
  });
});
