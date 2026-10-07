const { ethers } = require("ethers");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const config = require("../config");

function buildSignMessage(nonce) {
  return `Sign this message to authenticate with TrustLance:\nNonce: ${nonce}`;
}

async function getNonce(req, res, next) {
  try {
    const rawAddress = req.params.address;
    if (!rawAddress || !ethers.isAddress(rawAddress)) {
      return res.status(400).json({ error: "Invalid Ethereum address format" });
    }

    const address = rawAddress.toLowerCase();
    let user = await User.findOne({ address });
    const newNonce = Math.floor(Math.random() * 1000000).toString();

    if (!user) {
      user = await User.create({
        address,
        nonce: newNonce,
      });
    } else {
      user.nonce = newNonce;
      await user.save();
    }

    const message = buildSignMessage(user.nonce);
    return res.json({
      address: user.address,
      nonce: user.nonce,
      message,
    });
  } catch (err) {
    next(err);
  }
}

async function verifySignature(req, res, next) {
  try {
    const { address: rawAddress, signature } = req.body;
    if (!rawAddress || !ethers.isAddress(rawAddress)) {
      return res.status(400).json({ error: "Valid Ethereum address is required" });
    }
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "Cryptographic signature is required" });
    }

    const address = rawAddress.toLowerCase();
    const user = await User.findOne({ address });
    if (!user || !user.nonce) {
      return res.status(400).json({ error: "No active authentication nonce found for address. Request a nonce first." });
    }

    const expectedMessage = buildSignMessage(user.nonce);

    let recoveredAddress;
    try {
      recoveredAddress = ethers.verifyMessage(expectedMessage, signature).toLowerCase();
    } catch (err) {
      return res.status(401).json({ error: "Cryptographic signature verification failed", details: err.message });
    }

    if (recoveredAddress !== address) {
      return res.status(401).json({ error: "Signature does not match the claiming address" });
    }

    // Invalidate nonce to prevent replay attacks
    user.nonce = Math.floor(Math.random() * 1000000).toString();
    await user.save();

    // Generate JWT (24h)
    const token = jwt.sign(
      { address: user.address },
      config.jwtSecret,
      { expiresIn: "24h" }
    );

    return res.json({
      token,
      user: {
        address: user.address,
        name: user.name,
        bio: user.bio,
        skills: user.skills,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNonce,
  verifySignature,
  buildSignMessage,
};
