import 'mocha';
import chai from 'chai';
import Attachments from '../src/attachments';
chai.should();

describe('Attachments', () => {
  describe('defaults', () => {
    it('should apply defaults correctly', done => {
      const attachments = new Attachments({
        text: 'hi'
      });

      attachments.add();
      attachments[0].text.should.equal('hi');

      done();
    });
  });

  describe('or', () => {
    it('should remove a `goodOr` after adding danger/warning', done => {
      const attachments = new Attachments();

      attachments.goodOr('hi');
      attachments[0].text.should.equal('hi');
      attachments.or.length.should.equal(1);

      attachments.danger('not ok');
      attachments[0].text.should.equal('not ok');

      done();
    });
  });
});
