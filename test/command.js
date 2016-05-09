import Bot from '../src/bot';
import { types } from '../src/command';
import 'mocha';
import { expect } from 'chai';

let bot;
describe('command', () => {
  beforeEach(() => {
    bot = new Bot({}, true);
  });
  afterEach(() => {
    bot.destroy();
  });

  describe('group', () => {
    it('should replace () with un-matched groups', () => {
      bot.command('(hello|ok)', () => ({}));

      const [listener] = bot.listeners;
      expect(listener.regex.toString()).to.equal('/(?:hello|ok)/gim');
    });
  });

  describe('optional', () => {
    it('should replace [] with matched, optional groups', () => {
      bot.command('[hello|ok]', () => ({}));

      const [listener] = bot.listeners;
      expect(listener.regex.toString()).to.equal('/(hello|ok*)/gim');
    });
  });

  describe('required', () => {
    it('should replace <> with matched, required groups', () => {
      bot.command('<hello|ok>', () => ({}));

      const [listener] = bot.listeners;
      expect(listener.regex.toString()).to.equal('/(hello|ok+)/gim');
    });
  });

  describe('types', () => {
    it('should replace any type inside [] to the equivalent', () => {
      for (const type of Object.keys(types)) {
        const value = types[type];
        console.log(type, value);

        bot.command(`[${type}]`, () => ({}));

        const [listener] = bot.listeners;
        expect(listener.regex.toString()).to.equal(`/(${value}*)/gim`);
        bot.listeners.length = 0;
      }
    });

    it('should replace any type inside <> to the equivalent', () => {
      for (const type of Object.keys(types)) {
        const value = types[type];

        bot.command(`<${type}>`, () => ({}));

        const [listener] = bot.listeners;
        expect(listener.regex.toString()).to.equal(`/(${value}+)/gim`);
        bot.listeners.length = 0;
      }
    });
  });

  describe('spaces', () => {
    it('should replace all \\s characters with \\s*', () => {
      bot.command(' \t', () => ({}));

      const [listener] = bot.listeners;
      expect(listener.regex.toString()).to.equal('/\\s*\\s*/gim');
      bot.listeners.length = 0;
    });
  });
});
