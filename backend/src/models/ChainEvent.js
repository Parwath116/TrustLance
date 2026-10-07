const mongoose = require("mongoose");

const chainEventSchema = new mongoose.Schema(
  {
    txHash: {
      type: String,
      required: true,
      trim: true,
    },
    logIndex: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    blockNumber: {
      type: Number,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index ensuring events are only processed once
chainEventSchema.index({ txHash: 1, logIndex: 1 }, { unique: true });

module.exports = mongoose.model("ChainEvent", chainEventSchema);
