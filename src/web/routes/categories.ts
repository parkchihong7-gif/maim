import type { FastifyInstance } from "fastify";
import {
  listAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../../db/repositories/categories.js";

export async function categoriesRoutes(app: FastifyInstance) {
  app.get("/api/categories", async () => listAllCategories());

  app.post("/api/categories", async (req, reply) => {
    const body = req.body as {
      name: string;
      requiresSearch: boolean;
      promptHint: string;
      topicKeyword?: string | null;
    };
    const category = createCategory(body);
    reply.code(201);
    return category;
  });

  app.put("/api/categories/:id", async (req) => {
    const id = Number((req.params as { id: string }).id);
    updateCategory(
      id,
      req.body as Partial<{
        name: string;
        requiresSearch: boolean;
        promptHint: string;
        active: boolean;
        topicKeyword: string | null;
      }>,
    );
    return { ok: true };
  });

  app.delete("/api/categories/:id", async (req) => {
    const id = Number((req.params as { id: string }).id);
    deleteCategory(id);
    return { ok: true };
  });
}
