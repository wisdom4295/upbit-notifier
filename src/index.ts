import express from "express";
import cors from "cors";
import { config } from "./config";

const app = express();
const PORT = config.server.port;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "🚀 Upbit Notifier Backend v1.0",
    status: "healthy",
    timestamp: new Date().toDateString(),
  });
});

app.get("/config", (req, res) => {
  res.json(config);
});

app.listen(PORT, () => {
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}`);
  console.log(`⚙️ Config: http://localhost:${PORT}/config`);
});
