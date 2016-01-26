import 'mocha';
import chai from 'chai';
import Modifiers, { processable } from '../src/modifiers';
import sinon from 'sinon';
chai.should();

describe('Modifiers', () => {
  beforeEach(() => {
    Modifiers.clear();
  });

  class Testing {
    @processable('test')
    static test(a, b, c) {
      const z = a + b;

      return z + c;
    }

    static mid() {
      return Modifiers.trigger('mid').then(() => 5);
    }
  }

  describe('preprocess', () => {
    it('should modify the arguments of functions', () => {
      Modifiers.preprocess('test', (a, b, c) => [a + 5, b, c]);

      const result = Testing.test(1, 1, 1);
      result.should.equal(8);
    });
  });

  describe('postprocess', () => {
    it('should modify the return value of functions', () => {
      Modifiers.postprocess('test', value => `${value}-ok`);

      const result = Testing.test(1, 1, 1);
      result.should.equal('3-ok');
    });
  });

  describe('remove', () => {
    it('should remove the specified filter', () => {
      const first = Modifiers.postprocess('test', () => 0);
      const second = Modifiers.postprocess('test', () => 1);

      Modifiers.remove('test', first);

      const result = Testing.test(1, 1, 1);
      result.should.equal(1);

      Modifiers.remove('test', second);
    });
  });

  describe('middleware', () => {
    it('should be able to break the chain', done => {
      const success = sinon.spy();
      const fail = sinon.spy();

      Modifiers.middleware('mid', () => Promise.reject());

      Testing.mid().then(success, fail);

      setImmediate(() => {
        success.called.should.equal(false);
        fail.called.should.equal(true);

        done();
      });
    });

    it('should execute middlewares in order', done => {
      let count = 0;

      Modifiers.middleware('mid', () => {
        count++;
        return Promise.resolve();
      });

      Modifiers.middleware('mid', () => {
        count = 0;
        return Promise.resolve();
      });

      Testing.mid().then(() => {
        count.should.equal(0);
        done();
      });
    });
  });

  describe('clear', () => {
    it('should clear all the Modifiers', () => {
      Modifiers.postprocess('test', () => 0);
      Modifiers.preprocess('test', () => 0);

      Modifiers.clear();

      Modifiers.modifiers().should.deep.equal({});
    });
  });

  describe('list', () => {
    it('should list the Modifiers', () => {
      Modifiers.postprocess('test');
      Modifiers.preprocess('test');
      Modifiers.postprocess('test2');

      const list = Modifiers.modifiers();

      list.test.should.have.length(2);
      list.test2.should.have.length(1);
    });
  });
});
