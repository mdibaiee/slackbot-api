import 'mocha';
import chai from 'chai';
import Bot from '../src/bot';
import config from '../src/config'
import Tester from './tester';
chai.should();

const DELAY = 100;
const LONG_DELAY = 10000;

const GROUP = 'test-bolt';

describe('Bot', function() {
  this.timeout(LONG_DELAY);
  let bot;

  beforeEach(() => {
    bot = new Bot(config);
  })

  describe('constructor', () => {
    it('should extend from SlackBot', () => {
      bot.should.have.property('postMessageToChannel');
    })
  })

  describe('match', () => {
    it('should match messages against regexp correctly', done => {
      bot.match(/Testing@\d+/, message => {
        message.text.should.equal('Testing@123');

        done();
      });

      Tester.postMessageToGroup(GROUP, 'Test@');
      Tester.postMessageToGroup(GROUP, 'Testing@123');
    })
  })

  describe('icon', () => {
    it('should set emoji icon correctly', done => {
      bot.icon(':rocket:');
      bot.sendMessage(GROUP, 'icon_emoji');

      Tester.on('message', message => {
        if (message.icons && message.icons.emoji === ':rocket:') {
          done();
          bot.icon(false);
        }
      })
    })
  })

  describe('sendMessage', () => {
    it('should send to group correctly', done => {
      bot.sendMessage(GROUP, 'sendMessage-group');

      Tester.on('message', message => {
        if (message.text === 'sendMessage-group') done();
      })
    })
  })
})
