import Modifiers, { processable } from './modifiers';
import EventEmitter from 'events';
import WebSocket from 'ws';
import querystring from 'querystring';
import unirest from 'unirest';
import { fold as foldToAscii } from 'fold-to-ascii';
import modifiers from './modifiers';

const API = 'https://slack.com/api/';
const START_URI = 'https://slack.com/api/rtm.start';
const PING_INTERVAL = 20000;

let id = 0;

export const fullExec = (regex, string) => {
  if (!regex.global) return regex.exec(string);

  let next = regex.exec(string);
  let match = [];
  let lastIndex = -1;

  while (next && regex.lastIndex !== lastIndex) {
    lastIndex = regex.lastIndex;

    match = match.concat(next.slice(1));

    next = regex.exec(string);
  }

  return match;
};

/**
 * A set of methods which are set on message objects before emitting events.
 * These methods are simpler forms of bot methods which prefill the message
 * parameters
 * @param  {Bot}    bot bot instance, used as context when binding functions
 * @param  {Object} msg message object, used to prefill the methods
 * @return {Object}
 */
export function messageMethods(bot) {
  return {
    reply(...args) { return bot.sendMessage.call(bot, this.channel, ...args); },
    react(...args) { return bot.react.call(bot, this.channel, this.ts, ...args); },
    update(...args) { return bot.updateMessage.call(bot, this.channel, this.ts, ...args); },
    delete(...args) { return bot.deleteMessage.call(bot, this.channel, this.ts, ...args); },
    on(event, listener) {
      bot.messageListeners.push({ event, listener, ts: this.ts, channel: this.channel });
    },
    off(event, listener) {
      const index = bot.messageListeners.findIndex(a =>
        a.event === event && a.listener === listener
      );

      bot.messageListeners.splice(index, 1);
    }
  };
}

class Bot extends EventEmitter {
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

    this.globals = {
      websocket: true
    };

    this.listeners = [];

    this.messageListeners = [];

    this.setMaxListeners(config.maxListeners || 20);

    this.pingInterval = config.pingInterval || PING_INTERVAL;

    /* istanbul ignore if */
    if (!manual) {
      // Send a request and fetch Real-time Messaging API's websocket server
      const options = querystring.stringify(config);
      unirest.get(`${START_URI}?${options}`)
      .headers({ Accept: 'application/json' })
      .end(response => {
        const data = response.body;

        this.connect(data.url);
        delete data.ok;
        delete data.url;
        Object.assign(this, data);
        Object.assign(this.self, this.find(this.self.id));
      });
    }

    this.on('message_changed', message => {
      const newMessage = { ...message.message, channel: message.channel };

      const update = this.messageListeners
      .filter(a => a.ts === newMessage.ts && a.channel === newMessage.channel)
      .filter(a => a.event === 'update');

      update.forEach(({ listener }) => listener(newMessage));
    });

    this.on('message_deleted', message => {
      const deleted = this.messageListeners
      .filter(a => a.ts === message.ts && a.channel === message.channel)
      .filter(a => a.event === 'delete');

      deleted.forEach(({ listener }) => listener(message));
    });

    this.on('reaction_added', message => {
      const { item } = message;

      const reacted = this.messageListeners
      .filter(a => a.ts === item.ts && a.channel === item.channel)
      .filter(a => a.event === 'reaction_added');

      reacted.forEach(({ listener }) => listener(message));
    });

    this.on('reaction_removed', message => {
      const { item } = message;

      const removed = this.messageListeners
      .filter(a => a.ts === item.ts && a.channel === item.channel)
      .filter(a => a.event === 'reaction_removed');

      removed.forEach(({ listener }) => listener(message));
    });

    this.on('message', async message => {
      if (message.subtype || !message.text) return;
      // should not listen on bots' messages
      if (message.user && message.user.startsWith('B')) return;
      message.text = message.text.trim();

      // preformat the text
      const preformatted = message.text
        .replace(/<@([^>]+)>/g, (a, user) => `@${this.find(user).name}`)
        .replace(/<#([^>]+)>/g, (a, channel) => `#${this.find(channel).name}`)
        .replace(/<((?:http|https):\/\/[^>]+)>/g, (a, url) => url)
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');

      const NAME = new RegExp(`@?\\b${this.self.name}\\b:?`, 'i');

      const mention = message.channel.startsWith('D') || NAME.test(preformatted);

      // don't include bot name in regex test
      const text = preformatted.replace(NAME, '').trim();
      const ascii = foldToAscii(text);

      message.preformatted = preformatted;
      message.mention = mention;

      let hasListener = false;
      for (const { listener, regex, params } of this.listeners) {
        if (params.mention && !mention) {
          continue;
        }

        if ((text && regex.test(text)) || (ascii && regex.test(ascii))) {
          const msg = { ...message, ascii }; // clone

          regex.lastIndex = 0;
          msg.match = fullExec(regex, text);
          regex.lastIndex = 0;
          msg.asciiMatch = fullExec(regex, ascii);

          await Modifiers.trigger('hear', { ...msg, ...params }).then(() => { // eslint-disable-line
            if (!params.matchAll) hasListener = true;
            return listener(msg);
          }).catch(console.error.bind(console));
        }
      }

      if (!hasListener) {
        this.emit('notfound', message);
      }
    });

    this.on('open', () => {
      setInterval(() => {
        this.call('ping', {}, true);
      }, this.pingInterval);
    });
  }

  /**
   * Creates a WebSocket connection to the slack API url
   * @param  {String} url slack bot's API url e.g. wss://xyz
   * @return {Promise}    A promise which resolves upon `open`
   */
  @processable('connect')
  connect(url) {
    if (!url) throw new Error('Error connecting to Slack.');

    this.ws = new WebSocket(url);
    const ws = this.ws;

    return new Promise(resolve => {
      ws.on('open', () => {
        this.emit('open');
        resolve();

        ws.on('message', message => {
          const msg = JSON.parse(message);
          const methods = messageMethods(this);
          Object.assign(msg, methods);

          if (msg.message) {
            msg.message.channel = msg.channel;

            const subMethods = messageMethods(this);
            Object.assign(msg.message, subMethods);
          }

          this.emit('raw_message', msg);
          this.emit(msg.type, msg);
          this.emit(msg.subtype, msg);
        });
      });
    });
  }

  /**
   * Find a User | Channel | Group | IM | Bot by it's name or ID
   * @param  {String} name target name
   * @return {Object}      channel, group, im, user or the bot
   *                                matching the specified name or id
   */
  @processable('find')
  find(name) {
    if (this.type(name) === 'ID') {
      return this.all().find(item => item.id === name);
    }

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
   * @param  {regexp}   regex    regular expression to match messages against
   * @param  {function} listener the listener, invoked upon a matching message
   * @param  {object}   params
   * @return {bot}                returns the bot itself
   */
  @processable('hear')
  hear(regex, listener, params = {}) {
    if (typeof regex === 'function') {
      listener = regex;
      params = listener;
      regex = /./;
      params.matchAll = true;
    }

    this.listeners.push({ regex, listener, params });

    return this;
  }

  /**
   * Listens on incoming messages mentioning the bot, messages are matched only
   * if the message contains bot's name
   * @param  {regexp}   regex    optional: regular expression to match messages
   *                             against. default: /./
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
   * @param  {String|Array} channel The channel, im or group to send the message to
   * @param  {String} text          Message's text content
   * @param  {Object} params        Message's parameters
   *                                see https://api.slack.com/methods/chat.postMessage
   * @return {Promise}              A promise which resolves upon succes and fails
   *                                in case of errors
   */
  @processable('sendMessage')
  async sendMessage(channel, text, params = {}) {
    if (Array.isArray(channel)) {
      return await* channel.map(ch => this.sendMessage(ch, text, params));
    }

    const options = { ...this.globals, ...params };
    let target;

    // @username sends the message to the users' @slackbot channel
    if (channel[0] === '@') {
      target = channel;
      options.websocket = false;
    } else if (this.type(channel) === 'ID') {
      target = channel;
    } else {
      const ch = (this.find(channel) || {}).id;

      // sending to users
      if (ch && ch[0] === 'U') {
        let im = (this.ims.find(i => i.user === ch) || {}).id;

        if (!im) {
          im = await this.call('im.open', { user: ch });
          target = im && im.channel ? im.channel.id : null;
        } else {
          target = im;
        }
      } else {
        target = ch;
      }

      if (!target) throw new Error(`Could not find channel ${channel}`);
    }

    if (options.websocket) {
      text = text.replace(/&/g, '&amp;')
                 .replace(/</, '&lt;')
                 .replace(/>/, '&gt;');
    } else {
      if (!options.icon_url && !options.icon_emoji) {
        options.icon_url = this.self.profile.image_original;
      }

      if (!options.username) {
        options.username = this.self.name;
      }
    }

    const msg = {
      channel: target,
      text, ...options
    };

    const method = msg.websocket ? 'message' : 'chat.postMessage';
    return Modifiers.trigger('sendMessage', { ...msg }).then(() =>
      this.call(method, msg, msg.websocket)
    );
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
    const target = this.find(channel);

    const msg = {
      channel: target.id, ts: timestamp
    };

    return Modifiers.trigger('deleteMessage', { ...msg, ...params }).then(() =>
      this.call('chat.delete', msg)
    );
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
    const target = this.find(channel);

    const msg = {
      channel: target.id, ts: timestamp,
      text, ...params
    };

    return Modifiers.trigger('updateMessage', { ...msg, ...params }).then(() =>
      this.call('chat.update', msg)
    );
  }

  /**
   * Random helper which returns one of the provided arguments randomly
   * @param  {Mixed/Array} args a set of arguments which can contain flat arrays
   * @return {Mixed}
   */
  @processable('random')
  random(...args) {
    const options = args.reduce((a, b) => a.concat(b), []);

    const chance = 1 / (options.length - 1);

    const luck = +Math.random().toFixed(1);
    const index = Math.round(luck / chance);

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
      return this;
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
    const target = this.find(channel);

    const msg = {
      channel: target.id,
      timestamp, name: emoji, ...params
    };

    return Modifiers.trigger('react', { ...msg, ...params }).then(() =>
      this.call('reactions.add', msg)
    );
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
  async call(method, params = {}, websocket = false) {
    if (websocket) {
      this.ws.send(JSON.stringify({
        id: id++,
        type: method,
        ...params
      }));

      const reply = await this.waitForReply(id - 1);
      return { ...params, ...reply };
    }

    const api = this._api || API; // this.api is used in tests

    for (const key of Object.keys(params)) {
      if (typeof params[key] === 'object') {
        try {
          params[key] = JSON.stringify(params[key]);
        } catch (e) {
          // nevermind
        }
      }
    }

    return new Promise((resolve, reject) => {
      unirest.get(api + method)
            .headers({ Accept: 'application/json' })
            .query(params)
            .query({ token: this.config.token })
            .end(response => {
              /* istanbul ignore next */
              if (response.statusType === 1) resolve(response.body);
              /* istanbul ignore next */
              else reject(response.body);
            });
    });
  }

  /**
   * Wait for reply to the specified message id
   * @param  {Number} id message id
   * @return {Promise}
   */
  @processable('waitForReply')
  waitForReply(messageId) {
    return new Promise((resolve, reject) => {
      this.on('raw_message', function listener(message) {
        if (message.reply_to === messageId) {
          this.removeListener('raw_message', listener);

          /* istanbul ignore if */
          if (typeof message.ok === 'undefined') return resolve(message);
          if (message.ok) return resolve(message);

          return reject(message);
        }
      });
    });
  }

  /**
   * Detects if a string is representing id or name
   * @param  {String} string
   * @return {String}        returns 'ID' in case of an id and otherwise 'NAME'
   */
  @processable('type')
  type(string) {
    const STARTINGS = ['U', 'C', 'G', 'D'];
    if (string.toUpperCase() === string &&
        STARTINGS.indexOf(string[0]) > -1) {
      return 'ID';
    }

    return 'NAME';
  }
}

export default Bot;
