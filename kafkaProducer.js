const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "product-backend",
  brokers: ["kafka:9092"], 
});

const producer = kafka.producer();

const connectProducer = async () => {
  await producer.connect();
  console.log("Kafka Producer Connected");
};
const sendQueryLog = async (log) => {
  await producer.send({
    topic: "query_logs",
    messages: [{ value: JSON.stringify(log) }],
  });
};

module.exports = { connectProducer, sendQueryLog };