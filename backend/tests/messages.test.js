const request = require("supertest");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");
const app = require("../src/app");
const Job = require("../src/models/Job");
const Notification = require("../src/models/Notification");
const config = require("../src/config");

describe("Job Messages Access Control Tests", () => {
  const clientWallet = ethers.Wallet.createRandom();
  const freelancerWallet = ethers.Wallet.createRandom();
  const unauthorizedWallet = ethers.Wallet.createRandom();

  let clientToken, freelancerToken, unauthorizedToken;
  let testJob;

  beforeEach(async () => {
    // Generate valid tokens
    clientToken = jwt.sign({ address: clientWallet.address.toLowerCase() }, config.jwtSecret, { expiresIn: "1h" });
    freelancerToken = jwt.sign({ address: freelancerWallet.address.toLowerCase() }, config.jwtSecret, { expiresIn: "1h" });
    unauthorizedToken = jwt.sign({ address: unauthorizedWallet.address.toLowerCase() }, config.jwtSecret, { expiresIn: "1h" });

    testJob = await Job.create({
      onchainId: 201,
      txHash: "0x" + "b".repeat(64),
      metadataHash: "0x" + "c".repeat(64),
      client: clientWallet.address.toLowerCase(),
      freelancer: freelancerWallet.address.toLowerCase(),
      status: "InProgress",
      totalAmountWei: ethers.parseEther("1.0").toString(),
      reviewPeriod: 86400,
      milestones: [],
      metadata: { title: "Secret Project", description: "", category: "Dev", skills: [] },
    });
  });

  it("1. Job client can send a message to freelancer and creates notification", async () => {
    const res = await request(app)
      .post(`/api/jobs/${testJob.onchainId}/messages`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ text: "Hello! Looking forward to working together." });

    expect(res.status).toBe(201);
    expect(res.body.message.text).toBe("Hello! Looking forward to working together.");
    expect(res.body.message.from).toBe(clientWallet.address.toLowerCase());
    expect(res.body.message.to).toBe(freelancerWallet.address.toLowerCase());

    // Notification created for freelancer
    const notif = await Notification.findOne({
      address: freelancerWallet.address.toLowerCase(),
      jobId: testJob.onchainId,
    });
    expect(notif).not.toBeNull();
    expect(notif.type).toBe("new_message");
  });

  it("2. Job freelancer can read messages for the job", async () => {
    // Send a message first
    await request(app)
      .post(`/api/jobs/${testJob.onchainId}/messages`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ text: "Milestone 1 specs updated." });

    const res = await request(app)
      .get(`/api/jobs/${testJob.onchainId}/messages`)
      .set("Authorization", `Bearer ${freelancerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.messages.length).toBe(1);
    expect(res.body.messages[0].text).toBe("Milestone 1 specs updated.");
  });

  it("3. Rejects message access (read) for third-party address with 403 Forbidden", async () => {
    const res = await request(app)
      .get(`/api/jobs/${testJob.onchainId}/messages`)
      .set("Authorization", `Bearer ${unauthorizedToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Forbidden: You are neither the client nor freelancer");
  });

  it("4. Rejects message creation (post) for third-party address with 403 Forbidden", async () => {
    const res = await request(app)
      .post(`/api/jobs/${testJob.onchainId}/messages`)
      .set("Authorization", `Bearer ${unauthorizedToken}`)
      .send({ text: "I am an eavesdropper." });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Forbidden");
  });

  it("5. Rejects empty message text with 400 Bad Request", async () => {
    const res = await request(app)
      .post(`/api/jobs/${testJob.onchainId}/messages`)
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ text: "   " });

    expect(res.status).toBe(400);
  });
});
