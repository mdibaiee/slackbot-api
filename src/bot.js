import Modifiers, { processable } from './modifiers';
import EventEmitter from 'events';
import WebSocket from 'ws';
import https from 'https';
import querystring from 'querystring';
import unirest from 'unirest';

import modifiers from './modifiers';
import pocket from './pocket';

const API = 'https://slack.com/api/';
const START_URI = 'https://slack.com/api/rtm.start';

let id = 0;

export default class Bot extends EventEmitter {
  /**
   * Takes a config object passed to `rtm.start`,
   * see https://api.slack.com/methods/rtm.start
   *
   * @param  {object}  config
   * @param  {boolean} manual  doesn't request websocket url and `.connect`
   *                           automatically
   */
  constructor(config, manual) {
    super();

    this.config = config;

    this.modifiers = modifiers;
    this.pocket = pocket;

    this.globals = {};

    /* istanbul ignore else */
    if (manual) {
      return;
    } else {
      // Send a request and fetch Real-time Messaging API's websocket server
      let options = querystring.stringify(config);
      unirest.get(START_URI + '?' + options)
      .headers({'Accept': 'application/json'})
      .end(response => {
        let data = response.body;

        this.connect(data.url);
        delete data.ok;
        delete data.url;
        Object.assign(this, data);
      });
    }
  }

  /**
   * Creates a WebSocket connection to the slack API url
   * @param  {String} url slack bot's API url e.g. wss://xyz
   * @return {Promise}    A promise which resolves upon `open`
   */
  @processable('connect')
  connect(url) {
    this.ws = new WebSocket(url);
    let ws = this.ws;

    return new Promise((resolve, reject) => {
      ws.on('open', () => {
        this.emit('open');
        resolve();

        ws.on('message', message => {
          let msg = JSON.parse(message);
          let methods = messageMethods(this, msg);

          msg = Object.assign(msg, methods);

          this.emit('raw_message', msg);
          this.emit(msg.type, msg);
        });
      });
    })
  }

  /**
   * Find a User | Channel | Group | IM | Bot by it's name or ID
   * @param  {String} name target name
   * @return {Object}      channel, group, im, user or the bot
   *                                matching the specified name or id
   */
  @processable('find')
  find(name) {
    if (this.type(name) === 'ID')
      return this.all().find(item => item.id === name);
    else
      return this.all().find(item => item.name === name);
  }

  /**
   * Return an array containing all users, channels, groups, IMs and bots
   * @return {Array}
   */
  @processable('all')
  all() {
    return this.users
          .concat(this.groups)
          .concat(this.channels)
          .concat(this.ims)
          .concat(this.bots);
  }

  /**
   * Listens on incoming messages matching a regular expression or
   * messages calling the bot name if no regex is provided
   * @param  {regexp}   regex    regular expression to match messages against
   *                          	   default: /bolt/i
   * @param  {function} listener the listener, invoked upon a matching message
   * @param  {object}   params
   * @return {bot}                returns the bot itself
   */
  @processable('hear')
  hear(regex, listener, params = {}) {
    const NAME = new RegExp(this.self.name, 'i');

    let fn, reg, opts;
    if (typeof regex === 'function') {
      fn = regex;
      reg = NAME;
      opts = listener || {};
    } else {
      reg = regex;
      fn = listener;
      opts = params;
    }

    this.on('message', message => {
      if (opts.mention && message.text &&
         // check for bot's name or bot's id (actual mentioning, e.g. @botname)
         (!NAME.test(message.text) && !message.text.includes(this.self.id))) {
        return
      }

      if (message.text && reg.test(message.text)) {
        message.match = reg.exec(message.text);
        Modifiers.trigger('listen', Object.assign({}, message, opts)).then(() => {
          fn(message);
        })
      }
    })

    return this;
  }

  /**
   * Listens on incoming messages mentioning the bot, messages are matched only
   * if the message contains bot's name
   * @param  {regexp}   regex    regular expression to match messages against
   *                          	   default: /bolt/i
   * @param  {function} listener the listener, invoked upon a matching message
   * @param  {object}   params
   * @return {bot}                returns the bot itself
   */
  @processable('listen')
  listen(regex, listener, params = {}) {
    params.mention = true;
    return this.hear(regex, listener, params);
  }

  /**
   * Send a message to IM | Channel | Group
   * @param  {string} channel The channel, im or group to send the message to
   * @param  {string} text    Message's text content
   * @param  {object} params  Message's parameters
   *                          see https://api.slack.com/methods/chat.postMessage
   * @return {Promise}        A promise which resolves upon succes and fails
   *                             in case of errors
   */
  @processable('sendMessage')
  sendMessage(channel, text, params = {}) {
    let options = {...this.globals, ...params};
    let target = this.find(channel);

    let msg = {
      channel: target.id,
      text, ...options
    };

    return Modifiers.trigger('sendMessage', msg, params).then(() => {
      return this.call('message', msg, true);
    });
  }

  /**
   * Deletes a message
   * @param  {String} channel   the channel which the message was sent to
   * @param  {Number} timestamp timestamp of the message
   * @param  {Object} params
   * @return {Promise}          A promise which resolves upon succes and fails
   *                             in case of errors
   */
  @processable('deleteMessage')
  deleteMessage(channel, timestamp, params = {}) {
    let target = this.find(channel);

    let msg = {
      channel: target.id, ts: timestamp
    };

    return Modifiers.trigger('deleteMessage', msg, params).then(() => {
      return this.call('chat.delete', msg);
    });
  }


  /**
   * Updates a message
   * @param  {String} channel   the channel which the message was sent to
   * @param  {Number} timestamp timestamp of the message
   * @param  {String} text      the new text to replace the old one
   * @param  {Object} params    extra parameters
   * @return {Promise}          A promise which resolves upon succes and fails
   *                             in case of errors
   */
  @processable('updateMessage')
  updateMessage(channel, timestamp, text, params = {}) {
    let target = this.find(channel);

    let msg = {
      channel: target.id, ts: timestamp,
      text, ...params
    };

    return Modifiers.trigger('updateMessage', msg, params).then(() => {
      return this.call('chat.update', msg);
    });
  }

  /**
   * Random helper which returns one of the provided arguments randomly
   * @param  {Mixed/Array} args a set of arguments which can contain flat arrays
   * @return {Mixed}
   */
  @processable('random')
  random(...args) {
    let options = args.reduce((a, b) => {
      return a.concat(b);
    }, []);

    let chance = 1 / (options.length - 1);

    let luck = +Math.random().toFixed(1);
    let index = Math.round(luck / chance);

    return options[index];
  }

  /**
   * List custom emojis of team
   * @return {Promise} A promise which resolves upon succes and fails
   *                             in case of errors
   */
  @processable('emojis')
  emojis() {
    return this.call('emoji.list');
  }

  /**
   * Set bot's icon, can be either an :emoji: or a url
   * @param  {string} icon The icon to use, must be formatted like :emoji: to be
   *                       set as an emoji, otherwise will be considered as URL.
   *                       Pass a falsy value to delete the property
   * @return {Bot}         Returns the bot itself
   */
  @processable('icon')
  icon(icon) {
    if (!icon) {
      delete this.globals.icon_emoji;
      delete this.globals.icon_url;
      return;
    }

    if (/:\w+:/.test(icon)) {
      this.globals.icon_emoji = icon;
    } else {
      this.globals.icon_url = icon;
    }

    return this;
  }

  /**
   * Adds a reaction to a message
   * @param  {String} channel   the channel containing target message
   * @param  {Number} timestamp message's timestamp
   * @param  {String} emoji     reaction emoji, doesn't include colons
   *                            e.g. `rocket`
   * @param  {Object} params    extra parameters
   * @return {Promise}
   */
  @processable('react')
  react(channel, timestamp, emoji, params = {}) {
    let target = this.find(channel);

    let msg = {
      channel: target.id,
      timestamp, name: emoji, ...params
    };

    return Modifiers.trigger('react', msg, params).then(() => {
      return this.call('reactions.add', msg);
    });
  }

  /**
   * Calls the specified method with the parameters provided
   * @param  {String}  method     API method to call
   * @param  {Object}  params     parameters passed to the server
   * @param  {Boolean} websocket  indicates if the method should be called over websocket
   * @return {Promise}            A promise which resolves upon success and fails
   *                               in case of errors
   */
  @processable('call')
  call(method, params = {}, websocket = false) {
    if (websocket) {
      this.ws.send(JSON.stringify({
        id: id++,
        type: method,
        ...params
      }));

      return this.waitForReply(id - 1);
    }

    let api = this._api || API; // this.api is used in tests

    return new Promise((resolve, reject) => {
     unirest.get(api + method)
            .send(JSON.stringify(params))
            .headers({'Accept': 'application/json'})
            .query(params)
            .query({token: this.config.token})
            .end(response => {
              /* istanbul ignore next */
              if (response.statusType === 1) resolve(response.body);
              /* istanbul ignore next */
              else reject(response.body);
            })
    })
  }

  /**
   * Wait for reply to the specified message id
   * @param  {Number} id message id
   * @return {Promise}
   */
  @processable('waitForReply')
  waitForReply(id) {
    return new Promise((resolve, reject) => {
      this.on('raw_message', message => {
        if (message.reply_to === id) {
          /* istanbul ignore if */
          if (typeof message.ok == 'undefined') return resolve(message)
          if (message.ok) return resolve(message);

          return reject(message);
        }
      })
    })
  }

  /**
   * Detects if a string is representing id or name
   * @param  {String} string
   * @return {String}        returns 'ID' in case of an id and otherwise 'NAME'
   */
  @processable('type')
  type(string) {
    const STARTINGS = ['U', 'C', 'G'];
    if (string.toUpperCase() === string && string[1] === '0' &&
        STARTINGS.indexOf(string[0]) > -1) {
          return 'ID'
        }

    return 'NAME';
  }
}

/**
 * A set of methods which are set on message objects before emitting events.
 * These methods are simpler forms of bot methods which prefill the message
 * parameters
 * @param  {Bot}    bot bot instance, used as context when binding functions
 * @param  {Object} msg message object, used to prefill the methods
 * @return {Object}
 */
function messageMethods(bot, msg) {
  return {
    reply: bot.sendMessage.bind(bot, msg.channel),
    react: bot.react.bind(bot, msg.channel, msg.ts || msg.timestamp)
  }
}
