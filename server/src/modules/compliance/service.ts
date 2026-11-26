import type {
  ComplianceConfig,
  LaunchGate,
  PolicyLinks,
  PrivacyRequest,
} from "@checkout/shared";
import { config } from "../../config.js";
import { query } from "../../db.js";
import { errors } from "../../errors.js";
import { POLICY_VERSION } from "../../seed.js";
import { randomToken, tokenHash } from "../../lib/security.js";

type RawConfig = {
  sellerLegalEntity: string;
  supportedCountries: string[];
  currencies: string[];
  b2bMode: boolean;
  taxInclusive: boolean;
  policies: PolicyLinks;
  policyVersion: string;
  privacyController: string;
  privacyContact: string;
  retention: { ordersMonths: number; sessionsDays: number; analyticsDays: number };
  restrictions: { minimumAge: number; restrictedCategories: string[] };
  cookies: Array<{ name: string; purpose: string; necessary: boolean; retentionDays: number }>;
  paymentMethods: string[];
  providerMode: "test" | "sandbox" | "live";
  liveCheckoutEnabled: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

interface ConfigRow { document: RawConfig }
interface PolicyRow { document: Record<string, string>; reviewed_by: string }

const POLICY_KEYS: Array<keyof PolicyLinks> = ["terms", "privacy", "delivery", "returns", "refund"];

function gate(id: string, label: string, status: LaunchGate["status"], detail: string): LaunchGate {
  return { id, label, status, detail };
}

function isPlaceholder(value: string): boolean {
  return !value || /placeholder|example\.invalid|draft/i.test(value);
}

export async function getCompliance(): Promise<ComplianceConfig> {
  const result = await query<ConfigRow>("SELECT document FROM compliance_config WHERE singleton = true");
  const raw = result.rows[0]?.document;
  if (!raw) throw errors.internal();

  const policy = await query<PolicyRow>(
    "SELECT document, reviewed_by FROM policy_versions WHERE version = $1",
    [raw.policyVersion ?? POLICY_VERSION],
  );
  const taxCoverage = await query<{ count: string }>(
    `SELECT count(DISTINCT country_code)::text AS count FROM tax_rules
      WHERE active AND country_code = ANY($1::char(2)[])`,
    [raw.supportedCountries],
  );
  const covered = Number(taxCoverage.rows[0]?.count ?? 0);
  const taxVerified = covered >= raw.supportedCountries.length;

  const launchGates: LaunchGate[] = [
    gate("legal-entity", "Seller legal identity", isPlaceholder(raw.sellerLegalEntity) ? "pending" : "verified",
      isPlaceholder(raw.sellerLegalEntity) ? "Replace the placeholder legal entity." : "Legal entity supplied; verify registration details externally."),
    gate("jurisdictions", "Supported jurisdictions and currencies",
      raw.supportedCountries.length > 0 && raw.currencies.length > 0 ? "verified" : "pending",
      `${raw.supportedCountries.length} countries, ${raw.currencies.length} currencies configured.`),
    gate("tax", "Tax rules coverage", taxVerified ? "verified" : "pending",
      `${covered} of ${raw.supportedCountries.length} supported countries have active tax rules.`),
    gate("policies", "Terms, Privacy, Delivery, Returns, Refund",
      POLICY_KEYS.every((key) => Boolean(raw.policies?.[key])) && policy.rows[0]?.reviewed_by !== "UNREVIEWED" ? "verified" : "pending",
      "Policy links exist; legal review of text is still required."),
    gate("privacy", "Controller, contact and retention",
      isPlaceholder(raw.privacyController) || isPlaceholder(raw.privacyContact) ? "pending" : "verified",
      "Retention periods are configured; confirm with privacy counsel."),
    gate("restrictions", "Age/product restrictions and cookie inventory",
      raw.restrictions && Array.isArray(raw.cookies) && raw.cookies.length > 0 ? "verified" : "pending",
      "Configuration present; confirm with counsel and consent platform."),
    gate("payment-provider", "Payment provider adapter",
      config.providerMode === "test" ? "unsupported" : "pending",
      "No live or sandbox vendor adapter is registered; only the signed test adapter exists."),
    gate("external-review", "Documented external sign-off",
      raw.reviewedAt && raw.reviewedBy ? "verified" : "pending",
      "Set reviewed_at and reviewed_by only after qualified review."),
    gate("consumer-law", "Consumer-law review", "unsupported",
      "Requires qualified review of cancellation, returns and warranty terms."),
    gate("fraud-aml", "Fraud, AML and sanctions review", "unsupported",
      "Requires qualified review and configured screening provider."),
    gate("accessibility", "WCAG 2.2 AA audit", "unsupported",
      "Automated checks and manual keyboard/screen-reader review are outstanding."),
  ];

  return {
    sellerLegalEntity: raw.sellerLegalEntity,
    supportedCountries: raw.supportedCountries,
    currencies: raw.currencies,
    b2bMode: raw.b2bMode,
    taxInclusive: raw.taxInclusive,
    policies: raw.policies,
    policyVersion: raw.policyVersion,
    privacyController: raw.privacyController,
    privacyContact: raw.privacyContact,
    retention: raw.retention,
    restrictions: raw.restrictions,
    cookies: raw.cookies,
    paymentMethods: raw.paymentMethods,
    providerMode: config.providerMode,
    liveCheckoutEnabled: raw.liveCheckoutEnabled,
    reviewedAt: raw.reviewedAt,
    reviewedBy: raw.reviewedBy,
    launchGates,
  };
}

export function assertLiveCheckoutAllowed(compliance: ComplianceConfig): void {
  if (!compliance.liveCheckoutEnabled) throw errors.launchGateBlocked();
  if (compliance.launchGates.some((item) => item.status !== "verified")) {
    throw errors.launchGateBlocked();
  }
}

export function assertTestCheckoutAllowed(compliance: ComplianceConfig): void {
  if (compliance.providerMode !== "test" || !config.checkoutTestMode) {
    assertLiveCheckoutAllowed(compliance);
  }
  if (!compliance.paymentMethods.length) throw errors.launchGateBlocked();
}

export async function getPolicyDocument(key: string): Promise<{ title: string; text: string; version: string; reviewed: boolean }> {
  if (!POLICY_KEYS.includes(key as keyof PolicyLinks)) throw errors.notFound("Policy not found.");
  const compliance = await getCompliance();
  const result = await query<PolicyRow>(
    "SELECT document, reviewed_by FROM policy_versions WHERE version = $1",
    [compliance.policyVersion],
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("Policy version not found.");
  return {
    title: key.charAt(0).toUpperCase() + key.slice(1),
    text: row.document[key] ?? "Policy text not available.",
    version: compliance.policyVersion,
    reviewed: row.reviewed_by !== "UNREVIEWED",
  };
}

export async function createPrivacyRequest(input: PrivacyRequest, customerId: string | null): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO privacy_requests (customer_id, type, contact, details)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [customerId, input.type, input.contact, input.details],
  );
  return { id: result.rows[0]!.id };
}

export async function exportCustomerData(customerId: string): Promise<unknown> {
  const customer = await query<{ id: string; email: string | null; name: string }>(
    "SELECT id, email, name FROM customers WHERE id = $1", [customerId],
  );
  const row = customer.rows[0];
  if (!row) throw errors.notFound();
  const carts = await query("SELECT id, currency, status, created_at FROM carts WHERE customer_id = $1", [customerId]);
  const orders = await query("SELECT id, number, status, total_minor, currency, created_at FROM orders WHERE customer_id = $1", [customerId]);
  const consents = await query("SELECT kind, version, granted, recorded_at FROM consents WHERE customer_id = $1", [customerId]);
  return {
    customerId: row.id,
    email: row.email,
    name: row.name,
    carts: carts.rows,
    orders: orders.rows,
    consents: consents.rows,
    generatedAt: new Date().toISOString(),
  };
}

export async function anonymizeCustomer(customerId: string): Promise<void> {
  const token = randomToken(8);
  await query(
    `UPDATE customers
        SET email = NULL, name = 'Deleted customer', is_guest = true,
            anonymized_at = now(), updated_at = now()
      WHERE id = $1`,
    [customerId],
  );
  await query("UPDATE addresses SET line1 = '[redacted]', line2 = '[redacted]', city = '[redacted]', postal_code = '[redacted]' WHERE customer_id = $1", [customerId]);
  await query("DELETE FROM sessions WHERE customer_id = $1", [customerId]);
  await query("DELETE FROM recovery_tokens WHERE customer_id = $1", [customerId]);
  await query(
    `INSERT INTO audit_log (actor_id, action, target, metadata)
     VALUES ($1, 'privacy_anonymize', $2, $3::jsonb)`,
    [customerId, customerId, JSON.stringify({ reference: tokenHash(token) })],
  );
}
