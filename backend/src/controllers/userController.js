const { ethers } = require("ethers");
const User = require("../models/User");

async function getUserProfile(req, res, next) {
  try {
    const rawAddress = req.params.address;
    if (!rawAddress || !ethers.isAddress(rawAddress)) {
      return res.status(400).json({ error: "Invalid Ethereum address format" });
    }

    const address = rawAddress.toLowerCase();
    let user = await User.findOne({ address }).lean();

    if (!user) {
      // Return clean stub profile for addresses that haven't customized yet
      return res.json({
        user: {
          address,
          name: "",
          bio: "",
          skills: [],
          role: "both",
        },
      });
    }

    return res.json({ user });
  } catch (err) {
    next(err);
  }
}

async function updateUserProfile(req, res, next) {
  try {
    const rawAddress = req.params.address;
    if (!rawAddress || !ethers.isAddress(rawAddress)) {
      return res.status(400).json({ error: "Invalid Ethereum address format" });
    }

    const address = rawAddress.toLowerCase();
    if (req.user.address !== address) {
      return res.status(403).json({ error: "Forbidden: You cannot modify another user's profile" });
    }

    const { name, bio, skills, role } = req.body;

    const updateFields = {};
    if (typeof name === "string") updateFields.name = name.trim();
    if (typeof bio === "string") updateFields.bio = bio.trim();
    if (Array.isArray(skills)) {
      updateFields.skills = skills.map((s) => String(s).trim()).filter(Boolean);
    }
    if (role && ["client", "freelancer", "both", "arbitrator"].includes(role)) {
      updateFields.role = role;
    }

    const user = await User.findOneAndUpdate(
      { address },
      { $set: updateFields },
      { new: true, upsert: true }
    );

    return res.json({
      message: "Profile updated successfully",
      user,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUserProfile,
  updateUserProfile,
};
