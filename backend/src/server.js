const mongoose = require("mongoose");
const app = require("./app");
const config = require("./config");
const indexer = require("./services/indexer");

let server;

async function bootstrap() {
  try {
    console.log(`\n==================================================`);
    console.log(`TrustLance Backend Service Bootstrapping`);
    console.log(`==================================================`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`Connecting to MongoDB: ${config.mongodbUri}...`);

    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected successfully!`);

    server = app.listen(config.port, () => {
      console.log(`HTTP Server listening on port ${config.port}`);
      console.log(`Healthcheck endpoint: http://localhost:${config.port}/health`);
      console.log(`==================================================\n`);
    });

    // Start background blockchain indexer
    indexer.start().catch((err) => {
      console.error("Indexer failed to start:", err);
    });
  } catch (err) {
    console.error("Fatal error during backend bootstrap:", err);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  if (indexer) {
    indexer.stop();
  }

  if (server) {
    server.close(() => {
      console.log("HTTP server closed.");
    });
  }

  try {
    await mongoose.connection.close(false);
    console.log("MongoDB connection closed.");
  } catch (err) {
    console.error("Error closing MongoDB connection:", err);
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

if (require.main === module) {
  bootstrap();
}

module.exports = { bootstrap, gracefulShutdown };
