import { readFileSync, existsSync } from "node:fs";

const required = [
  "docs/INTEGRATION_MAP.md",
  "docs/DATABASE.md",
  "docs/REQUEST_FLOW.md",
  "docs/OPENAPI.md",
  "docs/COMPLIANCE.md",
  "docs/PCI_SCOPE.md",
  "docs/RUNBOOKS.md",
  "docs/LAUNCH_CHECKLIST.md",
  ".env.example",
];

const missing = required.filter((file) => !existsSync(new URL(`../${file}`, import.meta.url)));
if (missing.length) {
  console.error("Missing required documentation:", missing.join(", "));
  process.exit(1);
}
for (const file of required) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  if (text.trim().length < 100) {
    console.error(`${file} is too short to be useful.`);
    process.exit(1);
  }
}
console.log(`Documentation check passed (${required.length} files).`);
