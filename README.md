slackbot-api
====
![Travis CI](https://img.shields.io/travis/mdibaiee/slackbot-api.svg)
![Codecov](https://img.shields.io/codecov/c/github/mdibaiee/slackbot-api.svg)
![GitHub](https://img.shields.io/github/downloads/mdibaiee/slackbot-api/latest/total.svg)

Simple, understandable Slack Bot API.

[Documentation](https://mdibaiee.gitbooks.io/slackbot-api/content/).


#Quick overview
##initialize

```javascript
import Bot from 'slackbot-api';
let bot = new Bot({
  token: process.env.SLACK_BOT_TOKEN // YOUR TOKEN HERE
});
```

##hear
Listen on all incoming messages matching a pattern.

```javascript
bot.hear(/hi (.*)/, message => {
  let name = message.match[1]; // message.match = message.text.exec(regex);

  message.reply('Hello!');
})
```

##listen
Listen on all incoming messages mentioning the bot (with or without @)

```javascript
bot.listen(/help/, message => {
  message.reply('You\'ve come to the right person!');
});
```

##sendMessage
```javascript
bot.sendMessage('general', 'Hello guys! wassup?');
bot.sendMessage('general', 'Hello', {
  unfurl_links: false,
  // extra parameters, see https://api.slack.com/methods/chat.postMessage
});
```

##deleteMessage
```javascript
let msg = await bot.sendMessage('general', 'Hello guys! wassup?');
msg.delete();
// or
bot.deleteMessage('general', msg.ts);
```

##updateMessage
```javascript
let msg = await bot.sendMessage('general', 'i can haz cakez');
msg.update('Yarrrrr!');
// or
bot.updateMessage('general', msg.ts, 'Yarrrrr!');
```

##react
Add reactions to messages.
```javascript
bot.listen(/rocket/, message => {
  message.react('rocket');
})

bot.react('general', msg.ts, 'rocket');
```

##icon
Set bot's profile icon.

```javascript
bot.icon('warning');
```

##random
Choose an argument randomly. Arguments may also be arrays.

```javascript
bot.listen(/hey/, message => {
  message.reply(bot.random('Hi', 'Hello', 'Wassup'));
})
```

##on
Listen on events.

```javascript
bot.on('channel_joined', event => {
  bot.sendMessage(event.channel.id, 'Hello guys! Thanks for inviting me.');
});
```

##message events
You can also listen on individual messages' events
```javascript
bot.listen(/list/, message => {
  message.on('update', msg => {
    msg.reply(`Updated from ${message.text} to ${msg.text}`);
  })
  message.on('delete', msg => {
    msg.reply('Are you hiding something?');
  });

  message.on('reaction_added', ...);
  message.on('reaction_removed', ...);
});
```

##find
Find a channel, user, IM, whatever by it's id or name.

```javascript
let user = bot.find('mdibaiee');
let channel = bot.find('general');
let group = bot.find('my-secret-group');
let byId = bot.find('U0123456');
```


##Modifiers
In order to create advanced plugins/tasks, you might need to modify *behaviour* of a function, in order
to do that, bolt provides you _modifiers_.

There are three types of modifiers:

###preprocess
Used to modify arguments of a function:

```javascript
// Allow string patterns
bot.modifiers.preprocess('listen', (pattern, fn) => {
  if (typeof pattern === 'string') {
    let regex = new RegExp(pattern);
    return [regex, fn];
  }

  return [pattern, fn];
});
```

###postprocess
Used to modify return value of a function:

```javascript
bot.modifiers.postproess('listen', (bot) => {
  return 'Hey, I\'m listen and I\'m returning this!');
})
```

###middleware
Used to decide whether a function's main action should be called or not:

```javascript
bot.modifiers.middleware('hear', context => {
  // Our bot must be polite!
  if (context.message.indexOf(BAD_WORD) > -1)
    return Promise.reject();

  return Promise.resolve();
});
```
