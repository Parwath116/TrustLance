const express = require("express");
const mongoose = require("mongoose");
const SyncState = require("../models/SyncState");

const router = express.Router();

router.get("/", async (req, res) => {
  const isMongoConnected = mongoose.connection.readyState === 1;

  if (!isMongoConnected) {
    return res.status(503).json({
      status: "error",
      mongo: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }

  let lastIndexedBlock = 0;
  try {
    const sync = await SyncState.findOne({ key: "primary_escrow_sync" });
    if (sync) lastIndexedBlock = sync.lastBlock;
  } catch (err) {
    // Non-fatal for healthcheck
  }

  return res.status(200).json({
    status: "ok",
    mongo: "connected",
    lastIndexedBlock,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
