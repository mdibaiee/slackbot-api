import redis from 'redis';
import bluebird from 'bluebird';

/**
 * Create a redis client to be used as a storage for the bot
 * Methods are promisified using bluebird
 */

bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

let client = redis.createClient();

/* istanbul ignore next */
client.on('error', err => {
  console.error('Redis Error:', err);
});

export default client;
