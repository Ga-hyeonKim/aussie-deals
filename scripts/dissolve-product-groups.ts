import { config } from "dotenv";
import path from "path";
config({ path: path.join(__dirname, "../.env"), quiet: true });

import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/**
 * Dissolve every ProductGroup so match-products can rebuild them with the pack
 * size gate applied uniformly.
 *
 * Safe to run: Favorite and CartItem point at StoreProduct and Product
 * respectively, never at ProductGroup, so nothing user-owned is lost. Only the
 * /product-group/[id] URLs change.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const groups = await prisma.productGroup.count();
  const linked = await prisma.storeProduct.count({ where: { productGroupId: { not: null } } });
  const favourites = await prisma.favorite.count();
  console.log(`ProductGroup rows:               ${groups}`);
  console.log(`StoreProducts linked to a group: ${linked}`);
  console.log(`Favorites (must be unaffected):  ${favourites}`);

  if (dryRun) {
    console.log("\n--dry-run: nothing deleted.");
    return;
  }

  const unlinked = await prisma.storeProduct.updateMany({
    where: { productGroupId: { not: null } },
    data: { productGroupId: null },
  });
  console.log(`\nunlinked ${unlinked.count} store_products`);

  const deleted = await prisma.productGroup.deleteMany({});
  console.log(`deleted  ${deleted.count} product_groups`);

  const favouritesAfter = await prisma.favorite.count();
  console.log(`\nFavorites after: ${favouritesAfter} (was ${favourites})`);
  if (favouritesAfter !== favourites) throw new Error("favourites changed — investigate");
}

main()
  .catch(e => { console.error("FAILED:", e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect());
