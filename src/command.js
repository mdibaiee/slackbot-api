const map = {
  _: '.*?',
};

export const types = {
  string: '.',
  number: '\\d',
  alphanumeric: '[A-Za-z0-9]',
  alphabet: '[A-Za-z]',
  word: '\\w',
  char: '\\S',
};

const group = string => {
  const groups = /\((.*?)\)/g;

  return string.replace(groups, (a, inside) => `(?:${inside})`);
};

const optional = string => {
  const parameters = /(\[(.*?)\])/g;

  return string.replace(parameters, (a, b, type) => `(${types[type] || type}*)`);
};

const required = string => {
  const parameters = /(<(.*?)>)/g;

  return string.replace(parameters, (a, b, type) => `(${types[type] || type}+)`);
};

const space = string => {
  const spaces = /\s/g;

  return string.replace(spaces, '\\s*');
};

const transformers = [group, optional, required, space];

export default bot => {
  bot.command = (string, listener, ...args) => {
    if (!listener) {
      listener = string;
      string = '_';
    }

    const keys = Object.keys(map);
    for (const key of keys) {
      const value = map[key];
      const r = new RegExp(key, 'g');

      string = string.replace(r, value);
    }

    string = transformers.reduce((str, transformer) =>
      transformer(str), string);

    const regex = new RegExp(string, 'igm');

    return bot.listen(regex, listener, ...args);
  };
};
