let modifiers = {};

const PREPROCESSOR = 0;
const POSTPROCESSOR = 1;
const MIDDLEWARE = 2;

export default {
  /**
   * define a preprocessor filter, allowing it to modify the arguments passed
   * to a function by returning an array of arguments
   * @param  {String}   name modifier name
   * @param  {Function} fn   modifier function
   * @return {Number}        modifier index
   */
  preprocess(name, fn) {
    if (!modifiers[name]) {
      modifiers[name] = [];
    }

    let index = modifiers[name].push({
      type: PREPROCESSOR, fn
    });

    return index - 1;
  },

  /**
   * define a postprocessor modifier, allowing it to modify the return value of
   * a function by taking the return value as argument and passing the new
   * return value
   * @param  {String}   name modifier name
   * @param  {Function} fn   modifier function
   * @return {NUmber}        modifier index
   */
  postprocess(name, fn) {
    if (!modifiers[name]) {
      modifiers[name] = [];
    }

    let index = modifiers[name].push({
      type: POSTPROCESSOR, fn
    });

    return index - 1;
  },

  /**
   * define a middleware modifier, middlewares give you the flexibility to
   * modify a function's behavior by modifying / stopping a function from
   * completing it's job. For example you can register a middleware
   * on sendMessage to stop messages containing bad words from getting sent.
   *
   * Modifier functions are passed three arguments,
   * 	- context: The value getting processed by the function which includes
   * 	the information you should rely on to do your work
   *  - next: A function which continues calling middlewares until either all
   *  the middlewares pass and the actual function runs, or a middleware stops
   *  the chain. You can pass alternatively pass a promise to next for async
   *  tasks.
   *  - done: Stops the chain, preventing further middlewares and the function
   *  from running.
   * @param  {String}   name modifier name
   * @param  {Function} fn   function
   * @return {Number}        modifier index
   */
  middleware(name, fn) {
    if (!modifiers[name]) {
      modifiers[name] = [];
    }

    let index = modifiers[name].push({
      type: MIDDLEWARE, fn
    });

    return index - 1;
  },

  /**
   * Trigger middlewares of a function
   * @param  {String} name    middleware name
   * @param  {Object} context The context object passed as first parameter to
   *                          middleware functions
   * @return {Promise}        indicates whether all the middlewares called next
   *                          (resolve) or not (reject)
   */
  trigger(name, context) {
    let middlewares = (modifiers[name] || []).filter(item => {
      return item.type === MIDDLEWARE;
    });

    return Promise.all(
      middlewares.map(middleware => {
        let fn = middleware.fn;

        return fn(context);
      })
    );
  },

  /**
   * Remove a postprocessor/preprocessor modifier
   * @param  {String} name  modifier name
   * @param  {Number} index modifier index
   */
  remove(name, index) {
    modifiers[name].splice(index, 1);
  },

  /**
   * Clears all modifiers
   */
  clear() {
    modifiers = {};
  },

  /**
   * Returns the modifiers object
   * @return {Object} modifiers object
   */
  modifiers() {
    return modifiers;
  }
}

/**
 * A decorator which modifies a function to be processable, allowing
 * preprocessors and postprocessors to modify
 * the arguments and/or the return value of the function
 * @param  {String} name modifier name
 * @return {Function}    decorator
 */
export function processable(name) {
  return function(target, key, descriptor) {
    let originalFunction = descriptor.value;
    descriptor.value = function(...args) {

      let list = modifiers[name] || [];

      let preprocessors = list.filter(item => {
        return item.type === PREPROCESSOR;
      });
      let postprocessors = list.filter(item => {
        return item.type === POSTPROCESSOR;
      });

      let filteredArgs = preprocessors.reduce((modified, modifier) => {
        return modifier.fn(...modified);
      }, args);

      let value = originalFunction.apply(this, filteredArgs);

      let filteredValue = postprocessors.reduce((modified, modifier) => {
        return modifier.fn(modified);
      }, value);

      return filteredValue;
    }
  }
}
