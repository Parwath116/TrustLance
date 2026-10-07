const express = require("express");
const { z } = require("zod");
const userController = require("../controllers/userController");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const router = express.Router();

const updateProfileSchema = z.object({
  name: z.string().max(100).optional(),
  bio: z.string().max(1000).optional(),
  skills: z.array(z.string().max(50)).optional(),
  role: z.enum(["client", "freelancer", "both", "arbitrator"]).optional(),
});

router.get("/:address", userController.getUserProfile);
router.put("/:address", requireAuth, validate(updateProfileSchema), userController.updateUserProfile);

module.exports = router;
