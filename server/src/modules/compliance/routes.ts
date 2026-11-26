import { Router } from "express";
import { privacyRequestSchema, type PrivacyRequest } from "@checkout/shared";
import { asyncRoute, parseBody } from "../../lib/http.js";
import { loadSession, requireSession } from "../../lib/session.js";
import {
  anonymizeCustomer,
  createPrivacyRequest,
  exportCustomerData,
  getCompliance,
  getPolicyDocument,
} from "./service.js";

export const complianceRouter = Router();

complianceRouter.get("/compliance/config", asyncRoute(async (_req, res) => {
  res.json({ compliance: await getCompliance() });
}));

complianceRouter.get("/policies/:key", asyncRoute(async (req, res) => {
  const policy = await getPolicyDocument(String(req.params.key));
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(policy.title)} — Dummy Account</title>
<style>body{font-family:system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1rem;line-height:1.6;color:#1e293b}
.notice{background:#fef3c7;border-left:4px solid #f59e0b;padding:1rem;border-radius:.25rem}</style></head>
<body><h1>${escape(policy.title)}</h1>
${policy.reviewed ? "" : '<p class="notice">DRAFT — this text has not passed legal review and must not be relied on as a final policy.</p>'}
<p>${escape(policy.text)}</p><p><small>Version: ${escape(policy.version)}</small></p>
<p><a href="/">Return to checkout</a></p></body></html>`);
}));

complianceRouter.post("/privacy/requests", asyncRoute(async (req, res) => {
  const input = parseBody<PrivacyRequest>(privacyRequestSchema, req.body);
  const session = await loadSession(req);
  const result = await createPrivacyRequest(input, session?.customerId ?? null);
  res.status(201).json(result);
}));

complianceRouter.get("/privacy/export", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  res.json(await exportCustomerData(session.customerId));
}));

complianceRouter.post("/privacy/anonymize", asyncRoute(async (req, res) => {
  const session = requireSession(await loadSession(req));
  await anonymizeCustomer(session.customerId);
  res.json({ ok: true, message: "Your data has been anonymized. Transaction records are retained where required." });
}));
