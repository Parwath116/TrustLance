const express = require("express");
const cors = require("cors");
const config = require("./config");
const { errorHandler } = require("./middleware/errorHandler");

const authRoutes = require("./routes/authRoutes");
const jobRoutes = require("./routes/jobRoutes");
const userRoutes = require("./routes/userRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const healthRoutes = require("./routes/healthRoutes");

const app = express();

// Security and CORS
app.use(
  cors({
    origin: config.corsOrigin === "*" ? "*" : [config.corsOrigin, "http://localhost:8095", "http://127.0.0.1:8095", "http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// Healthcheck endpoints (available at both /health and /api/health)
app.use("/health", healthRoutes);
app.use("/api/health", healthRoutes);

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
