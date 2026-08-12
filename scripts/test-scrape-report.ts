import { createScrapeReport } from "../lib/scrape-report";

/**
 * Self-test for the scrape report's verdict, run with:
 *   npx tsx scripts/test-scrape-report.ts
 *
 * The point of the module is to turn a silent failure into a non-zero exit, so
 * the thing worth testing is exactly that boundary — not the formatting.
 */

let passed = 0;
let failed = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  (got ${actual}, want ${expected})`}`);
}

/** finish() sets process.exitCode; capture and reset it so tests stay isolated. */
function verdictOf(build: (r: ReturnType<typeof createScrapeReport>) => void): boolean {
  const before = process.exitCode;
  process.exitCode = 0;
  const report = createScrapeReport("test");
  build(report);
  const healthy = report.finish();
  const exited = process.exitCode;
  process.exitCode = before;
  // finish()'s return value and the exit code must never disagree.
  check("  (exit code agrees with return value)", healthy, exited === 0);
  return healthy;
}

console.log("\n--- a clean run ---");
check("all saved → healthy", verdictOf(r => {
  r.ok("storeProduct", 100);
  r.ok("priceHistory", 100);
}), true);

console.log("\n--- 2026-08-12: saved nothing ---");
check("priceHistory 0 saved → unhealthy", verdictOf(r => {
  r.ok("storeProduct", 7134);
  r.fail("priceHistory", new Error("The column `id` does not exist"), 7134);
}), false);

console.log("\n--- partial collapse ---");
check("4% failed → healthy (below threshold)", verdictOf(r => {
  r.ok("storeProduct", 96);
  r.fail("storeProduct", new Error("timeout"), 4);
}), true);

check("6% failed → unhealthy", verdictOf(r => {
  r.ok("storeProduct", 94);
  r.fail("storeProduct", new Error("timeout"), 6);
}), false);

check("exactly 5% failed → healthy (strictly greater fails)", verdictOf(r => {
  r.ok("storeProduct", 95);
  r.fail("storeProduct", new Error("timeout"), 5);
}), true);

console.log("\n--- nothing attempted ---");
check("empty report → healthy", verdictOf(() => {}), true);

check("a kind with no work does not fail the run", verdictOf(r => {
  r.ok("storeProduct", 10);
  // "category" never touched
}), true);

console.log("\n--- one bad kind fails the whole run ---");
check("good storeProduct + dead priceHistory → unhealthy", verdictOf(r => {
  r.ok("storeProduct", 1000);
  r.fail("priceHistory", new Error("boom"), 1000);
}), false);

console.log("\n--- repeated identical errors collapse ---");
console.log("(expect ONE '3000x' line below, not 3000 lines)");
verdictOf(r => {
  r.ok("storeProduct", 1);
  for (let i = 0; i < 3000; i++) r.fail("priceHistory", new Error("same cause"));
});

console.log("\n--- multi-line Prisma errors keep the last line ---");
console.log("(expect 'The column `id` does not exist in the current database.')");
verdictOf(r => {
  r.fail("priceHistory", new Error(
    "Invalid `prisma.priceHistory.createMany()` invocation in\n" +
    "/home/runner/work/scripts/fetch-coles.ts:330:31\n\n" +
    "  329 if (history.length > 0) {\n" +
    "→ 330   await prisma.priceHistory.createMany(\n" +
    "The column `id` does not exist in the current database."
  ), 10);
});

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exitCode = 1;
