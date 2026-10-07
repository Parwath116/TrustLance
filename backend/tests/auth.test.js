const request = require("supertest");
const { ethers } = require("ethers");
const app = require("../src/app");
const User = require("../src/models/User");

describe("Auth Flow Integration Tests", () => {
  let wallet;

  beforeEach(() => {
    wallet = ethers.Wallet.createRandom();
  });

  it("1. GET /api/auth/nonce/:address returns a random nonce and human-readable challenge", async () => {
    const res = await request(app).get(`/api/auth/nonce/${wallet.address}`);
    expect(res.status).toBe(200);
    expect(res.body.address).toBe(wallet.address.toLowerCase());
    expect(res.body.nonce).toBeDefined();
    expect(res.body.message).toContain("Sign this message to authenticate with TrustLance");
    expect(res.body.message).toContain(`Nonce: ${res.body.nonce}`);

    // User is created with nonce in database
    const userInDb = await User.findOne({ address: wallet.address.toLowerCase() });
    expect(userInDb).not.toBeNull();
    expect(userInDb.nonce).toBe(res.body.nonce);
  });

  it("2. Rejects invalid Ethereum addresses on nonce request", async () => {
    const res = await request(app).get("/api/auth/nonce/invalid-address-format");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid Ethereum address format");
  });

  it("3. POST /api/auth/verify verifies cryptographic signature and returns JWT token", async () => {
    // Step 1: Get challenge
    const nonceRes = await request(app).get(`/api/auth/nonce/${wallet.address}`);
    const { message } = nonceRes.body;

    // Step 2: Sign message with private key
    const signature = await wallet.signMessage(message);

    // Step 3: Verify signature
    const verifyRes = await request(app)
      .post("/api/auth/verify")
      .send({
        address: wallet.address,
        signature,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.token).toBeDefined();
    expect(verifyRes.body.user.address).toBe(wallet.address.toLowerCase());
  });

  it("4. Rejects signature signed by a different address", async () => {
    const imposterWallet = ethers.Wallet.createRandom();

    // Challenge for legitimate wallet
    const nonceRes = await request(app).get(`/api/auth/nonce/${wallet.address}`);
    const { message } = nonceRes.body;

    // Imposter signs legitimate wallet's challenge
    const forgedSignature = await imposterWallet.signMessage(message);

    const verifyRes = await request(app)
      .post("/api/auth/verify")
      .send({
        address: wallet.address,
        signature: forgedSignature,
      });

    expect(verifyRes.status).toBe(401);
    expect(verifyRes.body.error).toContain("Signature does not match the claiming address");
  });

  it("5. Prevents replay attack by rotating the nonce immediately upon verification", async () => {
    const nonceRes = await request(app).get(`/api/auth/nonce/${wallet.address}`);
    const { message } = nonceRes.body;
    const signature = await wallet.signMessage(message);

    // First verification: success
    const firstRes = await request(app)
      .post("/api/auth/verify")
      .send({ address: wallet.address, signature });
    expect(firstRes.status).toBe(200);

    // Replay attempt with same signature: must fail
    const replayRes = await request(app)
      .post("/api/auth/verify")
      .send({ address: wallet.address, signature });
    expect(replayRes.status).toBe(401);
  });

  it("6. Protected route requires valid Bearer token", async () => {
    // Unauthenticated access
    const unauthRes = await request(app).get("/api/notifications");
    expect(unauthRes.status).toBe(401);

    // Authenticated access
    const nonceRes = await request(app).get(`/api/auth/nonce/${wallet.address}`);
    const signature = await wallet.signMessage(nonceRes.body.message);
    const verifyRes = await request(app)
      .post("/api/auth/verify")
      .send({ address: wallet.address, signature });

    const token = verifyRes.body.token;

    const authRes = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${token}`);

    expect(authRes.status).toBe(200);
    expect(authRes.body.notifications).toBeDefined();
  });
});
