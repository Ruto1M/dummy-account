import { Router } from "express";
import {
  createQuoteRequestSchema,
  type CreateQuoteRequest,
} from "@checkout/shared";
import { asyncRoute, parseBody } from "../../lib/http.js";
import { loadSession, requireSession } from "../../lib/session.js";
import { createQuote, getQuote } from "./service.js";

export const pricingRouter = Router();

pricingRouter.post("/pricing/quote", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody<CreateQuoteRequest>(createQuoteRequestSchema, req.body);
  res.json(await createQuote(session, input));
}));

pricingRouter.post("/pricing/promotion", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const input = parseBody<CreateQuoteRequest & { promotionCode: string }>(
    createQuoteRequestSchema.extend({ promotionCode: createQuoteRequestSchema.shape.promotionCode.refine((value) => Boolean(value), "Enter a code.") }),
    req.body,
  );
  res.json(await createQuote(session, { ...input, promotionCode: input.promotionCode }));
}));

pricingRouter.get("/pricing/quote/:id", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  const token = String(req.query.token ?? "");
  res.json({ quote: await getQuote(String(req.params.id), token, session) });
}));
