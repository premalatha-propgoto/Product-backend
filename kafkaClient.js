const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "product-backend",
  brokers: ["kafka:9092"],
});

module.exports = kafka;