const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
    },
    jobId: {
      type: Number,
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ address: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
