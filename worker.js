const { startConsumer } = require("./kafkaConsumer");

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

const start = async () => {
  console.log("⏳ Waiting for Kafka & Redis...");
  await wait(15000); // ✅ wait 15 seconds

  await startConsumer();
};

start();