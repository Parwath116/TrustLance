const { ethers } = require("ethers");
const Job = require("../models/Job");

async function listJobs(req, res, next) {
  try {
    const {
      status,
      category,
      skill,
      client,
      freelancer,
      search,
      page = 1,
      limit = 10,
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }
    if (category) {
      query["metadata.category"] = new RegExp(`^${category}$`, "i");
    }
    if (skill) {
      query["metadata.skills"] = { $in: [new RegExp(skill, "i")] };
    }
    if (client) {
      query.client = client.toLowerCase();
    }
    if (freelancer) {
      query.freelancer = freelancer.toLowerCase();
    }
    if (search) {
      query.$text = { $search: search };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const total = await Job.countDocuments(query);
    const jobs = await Job.find(query)
      .sort({ onchainId: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    return res.json({
      jobs,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    next(err);
  }
}

async function getJobByOnchainId(req, res, next) {
  try {
    const onchainId = parseInt(req.params.onchainId, 10);
    if (isNaN(onchainId)) {
      return res.status(400).json({ error: "Invalid onchainId parameter" });
    }

    const job = await Job.findOne({ onchainId }).lean();
    if (!job) {
      return res.status(404).json({ error: `Job #${onchainId} not found in off-chain database` });
    }

    return res.json({ job });
  } catch (err) {
    next(err);
  }
}

async function uploadJobMetadata(req, res, next) {
  try {
    const onchainId = parseInt(req.params.onchainId, 10);
    if (isNaN(onchainId)) {
      return res.status(400).json({ error: "Invalid onchainId parameter" });
    }

    const { metadataRaw } = req.body;
    if (!metadataRaw || typeof metadataRaw !== "string") {
      return res.status(400).json({ error: "metadataRaw must be the exact JSON string submitted during job creation" });
    }

    let parsed;
    try {
      parsed = JSON.parse(metadataRaw);
    } catch (err) {
      return res.status(400).json({ error: "metadataRaw is not valid JSON string", details: err.message });
    }

    const computedHash = ethers.keccak256(ethers.toUtf8Bytes(metadataRaw));

    let job = await Job.findOne({ onchainId });
    if (!job) {
      return res.status(404).json({
        error: `Job #${onchainId} not found in database. The blockchain event may not have indexed yet.`,
      });
    }

    // Verify cryptographic integrity: keccak256(metadataRaw) == on-chain metadataHash
    if (computedHash.toLowerCase() !== job.metadataHash.toLowerCase()) {
      return res.status(400).json({
        error: "Cryptographic verification failed: keccak256(metadataRaw) does not match on-chain metadataHash",
        expected: job.metadataHash,
        received: computedHash,
      });
    }

    job.metadataRaw = metadataRaw;
    job.metadata = {
      title: parsed.title || job.metadata.title || "Untitled Job",
      description: parsed.description || job.metadata.description || "",
      category: parsed.category || job.metadata.category || "General",
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    };

    // If metadata contains milestone title details, update cached milestone titles
    if (Array.isArray(parsed.milestones) && job.milestones.length > 0) {
      parsed.milestones.forEach((mMeta, idx) => {
        if (job.milestones[idx] && mMeta.title) {
          job.milestones[idx].title = mMeta.title;
        }
      });
    }

    await job.save();

    return res.json({
      message: "Metadata verified and saved successfully",
      job,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listJobs,
  getJobByOnchainId,
  uploadJobMetadata,
};
