import { Router } from "express";
import {
  createOrderRequestSchema,
  refundRequestSchema,
  type CreateOrderRequest,
  type RefundRequest,
} from "@checkout/shared";
import { asyncRoute, parseBody } from "../../lib/http.js";
import { readIdempotencyKey, runIdempotent } from "../../lib/idempotency.js";
import { loadSession, requireSession } from "../../lib/session.js";
import { createOrder, getOrder } from "./service.js";
import { createRefund } from "../payment/service.js";

export const ordersRouter = Router();

ordersRouter.post("/orders", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody<CreateOrderRequest>(createOrderRequestSchema, req.body);
  const key = readIdempotencyKey(req);
  const result = await runIdempotent({
    customerId: session.customerId,
    scope: "order.create",
    key,
    request: input,
    work: (client) => createOrder(input, session, client),
  });
  res.locals.orderId = result.value.id;
  res.status(result.replayed ? 200 : 201).json(result.value);
}));

ordersRouter.get("/orders/:id", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const order = await getOrder(String(req.params.id), session);
  res.locals.orderId = order.id;
  res.json({ order });
}));

ordersRouter.post("/orders/:id/refund", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody<Omit<RefundRequest, "orderId">>(
    refundRequestSchema.omit({ orderId: true }), req.body,
  );
  const key = readIdempotencyKey(req);
  const result = await runIdempotent({
    customerId: session.customerId,
    scope: "order.refund",
    key,
    request: { orderId: String(req.params.id), ...input },
    work: () => createRefund(String(req.params.id), input, session),
  });
  res.locals.orderId = String(req.params.id);
  res.json(result.value);
}));
