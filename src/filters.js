let filters = {};

const PREPROCESSOR = 0;
const POSTPROCESSOR = 1;

export default {
  /**
   * define a preprocessor filter, allowing it to modify the arguments passed
   * to a function by returning an array of arguments
   * @param  {string}   name filter name
   * @param  {function} fn   modifier function
   * @return {object}        filter index
   */
  preprocess(name, fn) {
    if (!filters[name]) {
      filters[name] = [];
    }

    let index = filters[name].push({
      type: PREPROCESSOR, fn
    });

    return index - 1;
  },

  /**
   * define a postprocessor filter, allowing it to modify the return value of
   * a function by taking the return value as argument and passing the new
   * return value
   * @param  {string}   name filter name
   * @param  {function} fn   modifier function
   * @return {object}        filter index
   */
  postprocess(name, fn) {
    if (!filters[name]) {
      filters[name] = [];
    }

    let index = filters[name].push({
      type: POSTPROCESSOR, fn
    });

    return index - 1;
  },

  /**
   * Remove a postprocessor/preprocessor filter
   * @param  {String} name  filter name
   * @param  {Number} index filter's index
   */
  remove(name, index) {
    filters[name].splice(index, 1);
  }
}

/**
 * A decorator which modifies a function to be filterable, allowing filters
 * to be registered as preprocessors or postprocessor to modify
 * the arguments and/or the return value of a function
 * @param  {String} name filter name
 * @return {Function}    decorator
 */
export function filterable(name) {
  return function(target, key, descriptor) {
    let originalFunction = descriptor.value;
    descriptor.value = function(...args) {

      let list = filters[name] || [];

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
