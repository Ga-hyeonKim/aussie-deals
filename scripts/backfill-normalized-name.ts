import { config } from "dotenv";
import path from "path";
config({ path: path.join(__dirname, "../.env") });

import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";
import { normalizeName } from "../lib/normalize";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const BATCH = 500;
  let skip = 0;
  let updated = 0;

  console.log("Starting normalized_name backfill...");

  while (true) {
    const rows = await prisma.storeProduct.findMany({
      select: { id: true, name: true, brand: true },
      skip,
      take: BATCH,
    });

    if (rows.length === 0) break;

    await Promise.all(
      rows.map((row) =>
        prisma.storeProduct.update({
          where: { id: row.id },
          data: { normalizedName: normalizeName(row.name, row.brand) },
        })
      )
    );

    updated += rows.length;
    skip += BATCH;
    console.log(`  ${updated} rows updated...`);
  }

  console.log(`Done. Total: ${updated} rows.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
