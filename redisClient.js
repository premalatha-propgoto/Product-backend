// redisClient.js
const redis = require("redis");

const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || "redis",
    port: process.env.REDIS_PORT || 6379,
  },
});

client.on("error", (err) => console.log("Redis Error", err));

(async () => {
  await client.connect();
})();

module.exports = client;