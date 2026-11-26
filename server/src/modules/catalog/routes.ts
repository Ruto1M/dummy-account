import { Router } from "express";
import { asyncRoute } from "../../lib/http.js";
import { getFeaturedProduct } from "./service.js";

export const catalogRouter = Router();

catalogRouter.get("/product", asyncRoute(async (_req, res) => {
  res.json({ product: await getFeaturedProduct() });
}));
