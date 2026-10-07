const Job = require("../models/Job");
const Message = require("../models/Message");
const Notification = require("../models/Notification");

async function getMessages(req, res, next) {
  try {
    const onchainId = parseInt(req.params.onchainId, 10);
    if (isNaN(onchainId)) {
      return res.status(400).json({ error: "Invalid onchainId parameter" });
    }

    const job = await Job.findOne({ onchainId });
    if (!job) {
      return res.status(404).json({ error: `Job #${onchainId} not found` });
    }

    const userAddr = req.user.address.toLowerCase();
    const isClient = job.client.toLowerCase() === userAddr;
    const isFreelancer = job.freelancer && job.freelancer.toLowerCase() === userAddr;

    if (!isClient && !isFreelancer) {
      return res.status(403).json({ error: "Forbidden: You are neither the client nor freelancer for this job" });
    }

    const messages = await Message.find({ jobId: onchainId }).sort({ createdAt: 1 }).lean();
    return res.json({ messages });
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const onchainId = parseInt(req.params.onchainId, 10);
    if (isNaN(onchainId)) {
      return res.status(400).json({ error: "Invalid onchainId parameter" });
    }

    const { text } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Message text cannot be empty" });
    }

    const job = await Job.findOne({ onchainId });
    if (!job) {
      return res.status(404).json({ error: `Job #${onchainId} not found` });
    }

    const userAddr = req.user.address.toLowerCase();
    const isClient = job.client.toLowerCase() === userAddr;
    const isFreelancer = job.freelancer && job.freelancer.toLowerCase() === userAddr;

    if (!isClient && !isFreelancer) {
      return res.status(403).json({ error: "Forbidden: You are neither the client nor freelancer for this job" });
    }

    if (!job.freelancer) {
      return res.status(400).json({ error: "Cannot send messages before a freelancer accepts the job" });
    }

    const recipient = isClient ? job.freelancer.toLowerCase() : job.client.toLowerCase();

    const message = await Message.create({
      jobId: onchainId,
      from: userAddr,
      to: recipient,
      text: text.trim(),
    });

    // Create notification for recipient
    await Notification.create({
      address: recipient,
      type: "new_message",
      jobId: onchainId,
      message: `New message on Job #${onchainId} from ${userAddr.slice(0, 6)}...${userAddr.slice(-4)}`,
    });

    return res.status(201).json({ message });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMessages,
  sendMessage,
};
