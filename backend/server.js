// ============ backend/server.js ============
import express from "express";
import cors from "cors";
import "dotenv/config";

import authRoutes from "./routes/auth.js";
import resourceRoutes from "./routes/resources.js";
import bookingRoutes from "./routes/bookings.js";
import adminRoutes from "./routes/admin.js";
import "./cron/reminders.js"; // starts the cron job on boot

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/admin", adminRoutes);

// 404 fallback
app.use((req, res) => {
  res.status(404).json({ error: { message: "Route not found" } });
});

// global error handler (catches anything thrown/rejected in routes)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { message: "Internal server error" } });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`CampusDesk backend running on port ${PORT}`));