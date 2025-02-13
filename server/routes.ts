import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth.ts";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const httpServer = createServer(app);
  return httpServer;
}
