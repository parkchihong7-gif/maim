import type { FastifyInstance } from "fastify";
import { getAllSettings, setSetting } from "../../db/repositories/settings.js";

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", async () => getAllSettings());

  app.put("/api/settings", async (req) => {
    const body = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      setSetting(key, String(value));
    }
    return getAllSettings();
  });
}
