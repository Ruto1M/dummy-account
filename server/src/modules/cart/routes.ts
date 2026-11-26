import { Router } from "express";
import { setQuantityRequestSchema, type SetQuantityRequest } from "@checkout/shared";
import { asyncRoute, parseBody } from "../../lib/http.js";
import { loadSession, requireSession } from "../../lib/session.js";
import { getCart, setQuantity } from "./service.js";

export const cartRouter = Router();

cartRouter.get("/cart", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  res.json({ cart: await getCart(session.customerId) });
}));

cartRouter.put("/cart/quantity", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody<SetQuantityRequest>(setQuantityRequestSchema, req.body);
  res.json({ cart: await setQuantity(session.customerId, input.sku, input.quantity) });
}));
