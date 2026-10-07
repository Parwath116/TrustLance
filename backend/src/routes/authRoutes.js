const express = require("express");
const { z } = require("zod");
const authController = require("../controllers/authController");
const { validate } = require("../middleware/validate");

const router = express.Router();

const verifySchema = z.object({
  address: z.string().min(42).max(42),
  signature: z.string().min(10),
});

router.get("/nonce/:address", authController.getNonce);
router.post("/verify", validate(verifySchema), authController.verifySignature);

module.exports = router;
