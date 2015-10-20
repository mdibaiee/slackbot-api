import { filterable } from './filters';
import EventEmitter from 'events';
import WebSocket from 'ws';
import https from 'https';
import querystring from 'querystring';
import unirest from 'unirest';

const API = 'https://slack.com/api/';
const START_URI = 'https://slack.com/api/rtm.start';

let id = 0;

export default class Bot extends EventEmitter {
  /**
   * Takes a config object passed to `rtm.start`,
   * see https://api.slack.com/methods/rtm.start
   *
   * @param  {String} name    bot's name
   * @param  {object} config
   */
  constructor(name, config) {
    super();

    this.config = config;
    this.name = name;

    // Send a request for Real-time Messaging API
    let options = querystring.stringify(config);
    unirest.get(START_URI + '?' + options)
    .headers({'Accept': 'application/json'})
    .end(response => {
      let data = response.body;
      this.connect(data.url);
      delete data.ok;
      delete data.url;
      Object.assign(this, data);
    })
  }

  /**
   * Creates a WebSocket connection to the slack API url
   * @param  {String} url slack bot's API url e.g. wss://xyz
   * @return {Promise}    A promise which resolves upon `open`
   */
  @filterable('connect')
  connect(url) {
    this.ws = new WebSocket(url);
    let ws = this.ws;

    return new Promise((resolve, reject) => {
      ws.on('open', () => {
        this.emit('open');
        resolve();

        ws.on('message', message => {
          let msg = JSON.parse(message);

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
  @filterable('find')
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
  @filterable('all')
  all() {
    return this.users
          .concat(this.groups)
          .concat(this.channels)
          .concat(this.ims)
          .concat(this.bots);
  }

  /**
   * Listens on incoming messages matching a regular expression or
   * messages calling the bot name
   * @param  {RegExp}   regex    regular expression to match messages against
   *                          	   default: /bolt/i
   * @param  {Function} listener the listener, invoked upon a matching message
   * @return {Bot}                Returns the bot itself
   */
  @filterable('listen')
  listen(regex, listener) {
    let fn, reg;
    if (typeof regex === 'function') {
      fn = regex;
      reg = new RegExp(this.name, 'i');
    }

    this.on('message', message => {
      if (reg.test(message.text)) fn(message);
    })

    return this;
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
  @filterable('sendMessage')
  sendMessage(channel, text, params) {
    let options = {...this.globals, ...params};
    let target = this.find(channel);

    return this.call('message', {
      channel: target.id,
      text, ...options
    }, true)
  }

  /**
   * Deletes a message
   * @param  {String} channel   the channel which the message was sent to
   * @param  {Number} timestamp timestamp of the message
   * @return {Promise}          A promise which resolves upon succes and fails
   *                             in case of errors
   */
  @filterable('deleteMessage')
  deleteMessage(channel, timestamp) {
    let target = this.find(channel);

    return this.call('chat.delete', {
      channel: target.id, ts: timestamp
    })
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
  @filterable('updateMessage')
  updateMessage(channel, timestamp, text, params) {
    let target = this.find(channel);

    return this.call('chat.update', {
      channel: target.id, ts: timestamp,
      text, ...params
    })
  }

  /**
   * List custom emojis of team
   * @return {Promise} A promise which resolves upon succes and fails
   *                             in case of errors
   */
  @filterable('emojis')
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
  @filterable('icon')
  icon(icon) {
    if (!icon) {
      delete this.globals.icon_emoji;
      delete this.globals.icon_url;
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
  @filterable('react')
  react(channel, timestamp, emoji, params) {
    let target = this.find(channel);

    return this.call('reactions.add', {
      channel: target.id, timestamp, name: emoji, ...params
    })
  }

  /**
   * Calls the specified method with the parameters provided
   * @param  {String}  method     API method to call
   * @param  {Object}  params     parameters passed to the server
   * @param  {Boolean} websocket  indicates if the method should be called over websocket
   * @return {Promise}            A promise which resolves upon success and fails
   *                               in case of errors
   */
  @filterable('call')
  call(method, params = {}, websocket = false) {
    if (websocket) {
      this.ws.send(JSON.stringify({
        id: id++,
        type: method,
        ...params
      }));

      return this.waitForReply(id - 1);
    }

    return new Promise((resolve, reject) => {
     unirest.get(API + method)
            .send(JSON.stringify(params))
            .headers({'Accept': 'application/json'})
            .query(params)
            .query({token: this.config.token})
            .end(response => {
              if (response.statusType === 1) resolve(response.body);
              else reject(response.body);
            })
    })
  }

  /**
   * Wait for reply to the specified message id
   * @param  {Number} id message id
   * @return {Promise}
   */
  @filterable('waitForReply')
  waitForReply(id) {
    return new Promise((resolve, reject) => {
      this.on('raw_message', message => {
        if (message.reply_to === id) {
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
  @filterable('type')
  type(string) {
    const STARTINGS = ['U', 'C', 'G'];
    if (string.toUpperCase() === string && string[1] === '0' &&
        STARTINGS.indexOf(string[0]) > -1) {
          return 'ID'
        }

    return 'NAME';
  }
}
