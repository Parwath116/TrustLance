const request = require("supertest");
const { ethers } = require("ethers");
const app = require("../src/app");
const Job = require("../src/models/Job");

describe("Metadata Hash Integrity & Job API Tests", () => {
  const sampleMetadata = {
    title: "Build Responsive React DApp",
    description: "Full-stack developer required to build decentralized freelance marketplace",
    category: "Development",
    skills: ["React", "Solidity", "Node.js"],
    milestones: [
      { title: "Smart Contract Architecture", amount: "1.0" },
      { title: "Frontend Integration", amount: "1.5" },
    ],
  };

  const sampleMetadataRaw = JSON.stringify(sampleMetadata);
  const sampleMetadataHash = ethers.keccak256(ethers.toUtf8Bytes(sampleMetadataRaw));

  let testJob;

  beforeEach(async () => {
    testJob = await Job.create({
      onchainId: 101,
      txHash: "0x" + "a".repeat(64),
      metadataHash: sampleMetadataHash,
      client: "0x1111111111111111111111111111111111111111",
      freelancer: null,
      status: "Open",
      totalAmountWei: ethers.parseEther("2.5").toString(),
      reviewPeriod: 86400,
      milestones: [
        { milestoneId: 0, title: "Milestone 1", amountWei: ethers.parseEther("1.0").toString(), deadline: 1800000000, status: "Pending" },
        { milestoneId: 1, title: "Milestone 2", amountWei: ethers.parseEther("1.5").toString(), deadline: 1900000000, status: "Pending" },
      ],
      metadata: {
        title: "Job #101",
        description: "",
        category: "General",
        skills: [],
      },
    });
  });

  it("1. Successfully uploads and verifies metadata when keccak256(metadataRaw) matches metadataHash", async () => {
    const res = await request(app)
      .post(`/api/jobs/${testJob.onchainId}/metadata`)
      .send({ metadataRaw: sampleMetadataRaw });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Metadata verified and saved successfully");
    expect(res.body.job.metadata.title).toBe(sampleMetadata.title);
    expect(res.body.job.metadata.category).toBe(sampleMetadata.category);
    expect(res.body.job.metadata.skills).toEqual(sampleMetadata.skills);
    expect(res.body.job.milestones[0].title).toBe("Smart Contract Architecture");
    expect(res.body.job.milestones[1].title).toBe("Frontend Integration");

    const updated = await Job.findOne({ onchainId: testJob.onchainId });
    expect(updated.metadata.title).toBe(sampleMetadata.title);
  });

  it("2. Rejects metadata upload when keccak256(metadataRaw) does NOT match on-chain hash", async () => {
    const tamperedMetadata = {
      ...sampleMetadata,
      title: "Tampered Malicious Title",
    };
    const tamperedRaw = JSON.stringify(tamperedMetadata);

    const res = await request(app)
      .post(`/api/jobs/${testJob.onchainId}/metadata`)
      .send({ metadataRaw: tamperedRaw });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cryptographic verification failed");
    expect(res.body.expected).toBe(sampleMetadataHash);

    // Ensure database was NOT modified
    const jobInDb = await Job.findOne({ onchainId: testJob.onchainId });
    expect(jobInDb.metadata.title).toBe("Job #101");
  });

  it("3. Rejects invalid JSON string in metadataRaw", async () => {
    const res = await request(app)
      .post(`/api/jobs/${testJob.onchainId}/metadata`)
      .send({ metadataRaw: "invalid-json-string{not-valid" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("metadataRaw is not valid JSON string");
  });

  it("4. Returns 404 if job does not exist", async () => {
    const res = await request(app)
      .post("/api/jobs/9999/metadata")
      .send({ metadataRaw: sampleMetadataRaw });

    expect(res.status).toBe(404);
  });

  it("5. GET /api/jobs supports filtering by category, status, and search", async () => {
    // Populate job with metadata
    await request(app)
      .post(`/api/jobs/${testJob.onchainId}/metadata`)
      .send({ metadataRaw: sampleMetadataRaw });

    // Filter by status
    const statusRes = await request(app).get("/api/jobs?status=Open");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.jobs.length).toBe(1);

    // Filter by category
    const catRes = await request(app).get("/api/jobs?category=Development");
    expect(catRes.status).toBe(200);
    expect(catRes.body.jobs.length).toBe(1);

    // Filter by skill
    const skillRes = await request(app).get("/api/jobs?skill=Solidity");
    expect(skillRes.status).toBe(200);
    expect(skillRes.body.jobs.length).toBe(1);
  });
});
