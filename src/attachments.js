const DEFAULTS = {
  mrkdwn_in: ['text'],
};

export default class Attachments extends Array {
  constructor(defaults = DEFAULTS) {
    super();
    this.defaults = defaults;

    this.or = [];
  }

  /* istanbul ignore next */
  good(text, props = {}) {
    return this.add({
      text, color: 'good',
      fallback: `Good: ${text}`,
      ...props,
    });
  }

  goodOr(text, props = {}) {
    this.good(text, props);
    this.or.push(this.length - 1);

    return this;
  }

  /* istanbul ignore next */
  danger(text, props = {}) {
    return this.add({
      text, color: 'danger',
      fallback: `Danger: ${text}`,
      ...props,
    });
  }

  /* istanbul ignore next */
  warning(text, props = {}) {
    return this.add({
      text, color: 'warning',
      fallback: `Warning: ${text}`,
      ...props,
    });
  }

  /* istanbul ignore next */
  image(url, props = {}) {
    return this.add({
      image_url: url,
      fallback: `Image: ${url}`,
      ...props,
    });
  }

  /* istanbul ignore next */
  thumb(url, props = {}) {
    return this.add({
      thumb_url: url,
      fallback: `Thumbnial: ${url}`,
      ...props,
    });
  }

  /* istanbul ignore next */
  author(name, link, icon, props = {}) {
    return this.add({
      author_name: name,
      author_link: link,
      author_icon: icon,
      fallback: `Author: ${name}, ${link}, ${icon}`,
      ...props,
    });
  }

  /* istanbul ignore next */
  title(title, link, props = {}) {
    return this.add({
      title, title_link: link,
      fallback: `Title: ${title}, ${link}`,
      ...props,
    });
  }

  /* istanbul ignore next */
  fields(list, props = {}) {
    return this.add({
      fields: list,
      ...props,
    });
  }

  add(props) {
    this.or.forEach(i => this.splice(i, 1));
    this.push({ ...this.defaults, ...props });

    return this;
  }
}
