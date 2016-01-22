import 'mocha';
import chai from 'chai';
import Bot from '../src/bot';
import sinon from 'sinon';
import WebSocket from 'ws';
import express from 'express';

chai.should();

const DELAY = 10;
const LONG_DELAY = 10000;

const GROUP = 'test-bot';
const GROUPID = 'G0123123';
const DIRECTID = 'D0123123';
const NAME = 'test';
const USERNAME = 'user';
const USERID = 'U123123';
const IMID = 'D123123';

let ws = new WebSocket.Server({ port: 9090 });
let app = express();
app.listen(9091);

describe('Bot', function() {
  this.timeout(LONG_DELAY);
  let bot;

  beforeEach(() => {
    bot = new Bot({}, true);
    Object.assign(bot, {
      channels: [], bots: [],
      users: [{
        name: USERNAME,
        id: USERID
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
        name: NAME
      }
    });

    ws._events = {};

    bot.connect('ws://127.0.0.1:9090');
    bot._api = 'http://127.0.0.1:9091/';
  })

  describe('constructor', () => {
    it('should connect to websocket server', done => {
      bot.on('raw_message', () => done());

      ws.on('connection', socket => {
        socket.send('{}');
      });
    })
  })

  describe('hear', () => {
    it('should test messages against regexp correctly', done => {
      let cb = sinon.spy();
      bot.hear(/Testing@\d+/, cb);

      setImmediate(() => {
        cb.called.should.equal(true);

        done();
      })

      let listener = bot._events.message;
      listener({
        text: 'Testing@123',
        channel: GROUPID
      });
    })

    it('should not crash when message doesn\'t have text property', done => {
      bot.hear(() => {});

      let listener = bot._events.message;

      listener.bind(bot, {}).should.not.throw();

      done();
    });
  })

  describe('listen', () => {
    it('should only match if the bot name is mentioned', done => {
      let cb = sinon.spy();
      bot.listen(/hi/, cb);

      setImmediate(() => {
        cb.calledOnce.should.equal(true);

        done();
      }, DELAY);

      let listener = bot._events.message;
      listener({
        text: 'hi',
        channel: GROUPID
      });
      listener({
        text: `hi ${NAME}`,
        channel: GROUPID
      });
    })

    it('should not require mentioning bot name in case of IM', done => {
      let cb = sinon.spy();
      bot.listen(/hi/, cb);

      setImmediate(() => {
        cb.calledOnce.should.equal(true);

        done();
      }, DELAY);

      let listener = bot._events.message;
      listener({
        text: 'hi',
        channel: DIRECTID
      });
    })

    it('should match against bot name when regex argument is omitted', done => {
      let cb = sinon.spy();
      bot.listen(cb);

      setImmediate(() => {
        cb.calledOnce.should.equal(true);

        done();
      });

      let listener = bot._events.message;
      listener({
        text: 'ok',
        channel: GROUPID
      });
      listener({
        text: NAME,
        channel: GROUPID
      })
    })

  })

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
    })

    it('should clear property in case of falsy input', done => {
      bot.icon();
      bot.globals.should.not.have.property('icon_url');
      bot.globals.should.not.have.property('icon_emoji');

      done();
    })
  })

  describe('sendMessage', () => {
    it('should send to group correctly', done => {
      ws.on('connection', socket => {
        socket.on('message', message => {
          let msg = JSON.parse(message);

          msg.text.should.equal('sendMessage-group');
          msg.channel.should.equal(GROUPID);
          msg.type.should.equal('message');
          done();
        })
      });

      bot.on('open', () => {
        bot.sendMessage(GROUP, 'sendMessage-group');
      });
    });

    it('should not search for channel if an ID is provided', done => {
      // an ID that doesn't exist in `bot.all()`
      // if `sendMessage` tries to find the channel, it will throw an error
      // else, our test will pass
      const randomid = 'D0000';
      ws.on('connection', socket => {
        socket.on('message', message => {
          let msg = JSON.parse(message);
          msg.channel.should.equal(GROUPID);
          done();
        })
      });

      bot.on('open', () => {
        bot.sendMessage(GROUPID, 'sendMessage-group');
      });
    })

    it('should catch server replies to that message', done => {
      ws.on('connection', socket => {
        let ok = true;

        socket.on('message', message => {
          let msg = JSON.parse(message);

          let response = {
            reply_to: msg.id,
            ok
          };

          ok = !ok;

          socket.send(JSON.stringify(response));
        });
      })

      bot.on('open', () => {
        bot.sendMessage(GROUP, 'test').then(reply => {
          reply.ok.should.equal(true);
        });

        bot.sendMessage(GROUP, 'test').then(() => {}, reply => {
          reply.ok.should.equal(false);

          done();
        })
      })
    })

    it('should send message to multiple channels', done => {
      let callCount = 0;

      ws.on('connection', socket => {
        socket.on('message', message => {
          callCount++;
          let msg = JSON.parse(message);

          let response = {
            reply_to: msg.id
          }

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

    it('should send message to @usernames', done => {
      ws.on('connection', socket => {
        socket.on('message', message => {
          let msg = JSON.parse(message);

          msg.channel.should.equal('@test');
          done();
        });
      });

      bot.on('open', () => {
        bot.sendMessage('@test', 'Hey');
      })
    });

    it('should send message to IMs when a username is provided', done => {
      ws.on('connection', socket => {
        socket.on('message', message => {
          let msg = JSON.parse(message);

          msg.channel.should.equal(IMID);
          done();
        });
      });

      bot.on('open', () => {
        bot.sendMessage(USERNAME, 'Hey');
      })
    });

    it('should throw error in case of unavailable channel', done => {
      bot.on('open', () => {
        bot.sendMessage.bind(bot, Math.random() + '', 'Hey').should.throw();

        done();
      })
    })
  });

  describe('random', () => {
    it('should return a random item of inputs', done => {
      bot.random('Hi', 'Hey', 'Ay').should.satisfy(result => {
        return ['Hi', 'Hey', 'Ay'].indexOf(result) > -1;
      });

      done();
    })
  })

  describe('emojis', () => {
    it('should send request to API emoji.list', done => {
      app.get('/emoji.list', () => {
        done();
      });

      bot.emojis();
    })
  })

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
  })


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
  })

  describe('deleteMessage', () => {
    it('should send request to API chat.delete', done => {
      app.get('/chat.delete', request => {
        request.query.channel.should.equal(GROUPID);
        request.query.ts.should.equal('123123');
        done();
      });

      bot.deleteMessage(GROUP, 123123);
    });
  })

  describe('all', () => {
    it('should return concated lists of channels, groups, users, ...', done => {
      let all = bot.all();

      all.should.have.length(bot.users.length + bot.ims.length + bot.groups.length);

      done();
    })
  })

  describe('find', () => {
    it('should find using name or id', done => {
      bot.find(GROUP).should.equal(bot.groups[0]);
      bot.find(GROUPID).should.equal(bot.groups[0]);

      done();
    });
  })

  describe('type', () => {
    it('should detect name/id', done => {
      bot.type(GROUP).should.equal('NAME');
      bot.type(GROUPID).should.equal('ID');

      done();
    })
  })
})
