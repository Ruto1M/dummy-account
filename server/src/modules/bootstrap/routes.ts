import { Router } from "express";
import type { Bootstrap, ShippingMethod } from "@checkout/shared";
import { asyncRoute } from "../../lib/http.js";
import { loadSession, type SessionContext } from "../../lib/session.js";
import { createGuest, ensureCsrf } from "../identity/service.js";
import { getCompliance } from "../compliance/service.js";
import { getFeaturedProduct } from "../catalog/service.js";
import { ensureStarterCart, getCart } from "../cart/service.js";
import { getShippingOptions } from "../shipping/service.js";
import { createQuote } from "../pricing/service.js";

export const bootstrapRouter = Router();

function defaultAddress(country: string) {
  const placeholders: Record<string, { city: string; postalCode: string }> = {
    GB: { city: "London", postalCode: "SW1A 1AA" },
    US: { city: "New York", postalCode: "10001" },
    DE: { city: "Berlin", postalCode: "10115" },
    FR: { city: "Paris", postalCode: "75001" },
  };
  return {
    line1: "123 Electric Avenue",
    line2: "",
    city: placeholders[country]?.city ?? "City",
    postalCode: placeholders[country]?.postalCode ?? "10000",
    countryCode: country,
  };
}

bootstrapRouter.get("/bootstrap", asyncRoute(async (req, res) => {
  const compliance = await getCompliance();
  let session = await loadSession(req);
  let message: string | null = null;
  if (!session) {
    const user = await createGuest(res);
    session = {
      sessionId: "",
      customerId: user.id,
      csrfToken: user.csrfToken,
      name: user.name,
      email: user.email,
      isGuest: user.isGuest,
    };
    message = "A guest session was created. Sign in or register at any time to keep your cart.";
  } else {
    await ensureCsrf(req, res);
  }
  const active = session as SessionContext;
  const country = compliance.supportedCountries[0] ?? "GB";
  const address = defaultAddress(country);
  const options = await getShippingOptions(address);
  const product = await getFeaturedProduct();
  await ensureStarterCart(active.customerId);
  const cart = await getCart(active.customerId);
  let quote: Bootstrap["quote"] = null;
  try {
    if (cart.items.length) {
      quote = (await createQuote(active, {
        address,
        shippingMethod: (options[0]?.method ?? "standard") as ShippingMethod,
      })).quote;
    }
  } catch {
    message = "Prices will appear once shipping is selected.";
  }

  const payload: Bootstrap = {
    user: {
      id: active.customerId,
      name: active.name,
      email: active.email,
      isGuest: active.isGuest,
      csrfToken: active.csrfToken,
    },
    product,
    cart,
    shippingOptions: options,
    quote,
    compliance,
    message,
  };
  res.json(payload);
}));
