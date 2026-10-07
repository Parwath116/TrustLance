const express = require("express");
const { z } = require("zod");
const jobController = require("../controllers/jobController");
const messageController = require("../controllers/messageController");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const router = express.Router();

const metadataSchema = z.object({
  metadataRaw: z.string().min(2),
});

const messageSchema = z.object({
  text: z.string().min(1).max(2000),
});

// Public job endpoints
router.get("/", jobController.listJobs);
router.get("/:onchainId", jobController.getJobByOnchainId);
router.post("/:onchainId/metadata", validate(metadataSchema), jobController.uploadJobMetadata);

// Protected chat endpoints (Client & Freelancer only)
router.get("/:onchainId/messages", requireAuth, messageController.getMessages);
router.post("/:onchainId/messages", requireAuth, validate(messageSchema), messageController.sendMessage);

module.exports = router;
