import { config } from "dotenv";
import path from "path";
config({ path: path.join(__dirname, "../.env") });

import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function canonicalizeBrand(brand: string | null): string | null {
  if (!brand || brand.trim() === "") return null;
  return brand
    .toLowerCase()
    .replace(/[®™]/g, "")        // 상표 기호 제거
    .replace(/['’]/g, "")   // 아포스트로피 제거
    .replace(/-/g, " ")          // 하이픈 → 공백
    .replace(/[.!?]+$/g, "")     // 후행 구두점 제거
    .replace(/\s+/g, " ")        // 공백 정규화
    .trim() || null;
}

async function main() {
  const BATCH = 500;
  let skip = 0;
  let updated = 0;

  console.log("Starting canonical_brand backfill...");

  while (true) {
    const rows = await prisma.storeProduct.findMany({
      select: { id: true, brand: true },
      skip,
      take: BATCH,
    });

    if (rows.length === 0) break;

    await Promise.all(
      rows.map((row) =>
        prisma.storeProduct.update({
          where: { id: row.id },
          data: { canonicalBrand: canonicalizeBrand(row.brand) },
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
