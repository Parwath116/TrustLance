const mongoose = require("mongoose");

const milestoneSchema = new mongoose.Schema(
  {
    milestoneId: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      default: "",
    },
    amountWei: {
      type: String,
      required: true,
    },
    deadline: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Submitted", "Paid", "Refunded", "Disputed"],
      default: "Pending",
    },
    deliverableURI: {
      type: String,
      default: "",
    },
    submittedAt: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const jobSchema = new mongoose.Schema(
  {
    onchainId: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    txHash: {
      type: String,
      required: true,
    },
    metadataHash: {
      type: String,
      required: true,
      index: true,
    },
    metadataRaw: {
      type: String,
      default: "",
    },
    metadata: {
      title: {
        type: String,
        default: "",
        trim: true,
      },
      description: {
        type: String,
        default: "",
        trim: true,
      },
      category: {
        type: String,
        default: "General",
        trim: true,
      },
      skills: {
        type: [String],
        default: [],
      },
    },
    client: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    freelancer: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ["Open", "InProgress", "Completed", "Cancelled"],
      default: "Open",
      index: true,
    },
    totalAmountWei: {
      type: String,
      required: true,
    },
    reviewPeriod: {
      type: Number,
      required: true,
    },
    milestones: {
      type: [milestoneSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Search index for text querying
jobSchema.index({
  "metadata.title": "text",
  "metadata.description": "text",
  "metadata.category": "text",
});

module.exports = mongoose.model("Job", jobSchema);
