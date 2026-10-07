const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    jobId: {
      type: Number,
      required: true,
      index: true,
    },
    from: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    to: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ jobId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
