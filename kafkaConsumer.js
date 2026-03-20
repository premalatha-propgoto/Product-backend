const { Kafka } = require("kafkajs");
const redisClient = require("./redisClient");

const kafka = new Kafka({
  clientId: "log-consumer",
  brokers: ["kafka:9092"],
});

const consumer = kafka.consumer({ groupId: "query-group" });

const startConsumer = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: "query_logs", fromBeginning: false });

  console.log("Kafka Consumer Started");

  await consumer.run({
    eachMessage: async ({ message }) => {
      const log = JSON.parse(message.value.toString());

      const key = `count:${log.route}`;

      await redisClient.incr(key);

      const count = await redisClient.get(key);

      console.log(`${log.route} called ${count} times`);
    },
  });
};

module.exports = { startConsumer };