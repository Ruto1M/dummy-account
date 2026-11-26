import { Router } from "express";
import { addressSchema, type Address } from "@checkout/shared";
import { asyncRoute, parseBody } from "../../lib/http.js";
import { errors } from "../../errors.js";
import { getCompliance } from "../compliance/service.js";
import { getShippingOptions, validateAddress } from "./service.js";

export const shippingRouter = Router();

shippingRouter.get("/shipping/options", asyncRoute(async (req, res) => {
  const country = String(req.query.country ?? "").trim().toUpperCase();
  const compliance = await getCompliance();
  if (!compliance.supportedCountries.includes(country)) {
    throw errors.validation("We do not currently ship to that country.", "country");
  }
  res.json({ options: await getShippingOptions({ countryCode: country }) });
}));

shippingRouter.post("/shipping/address", asyncRoute(async (req, res) => {
  const input = parseBody<Address>(addressSchema, req.body);
  const address = validateAddress(input, await getCompliance());
  res.json({ address, options: await getShippingOptions(address), message: "Destination is serviceable." });
}));
