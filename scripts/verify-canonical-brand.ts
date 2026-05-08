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

async function main() {
  // 1. null 처리 현황
  const nullCount = await prisma.storeProduct.count({ where: { canonicalBrand: null } });
  const total = await prisma.storeProduct.count();
  console.log(`\n[Coverage] ${total - nullCount}/${total} rows have canonical_brand (${nullCount} null)`);

  // 2. 정규화 전후 비교 샘플 (브랜드명이 변환된 케이스)
  const samples = await prisma.$queryRaw<{ brand: string; canonical_brand: string; count: bigint }[]>`
    SELECT brand, canonical_brand, COUNT(*) as count
    FROM store_products
    WHERE brand IS NOT NULL AND brand != '' AND brand != canonical_brand
    GROUP BY brand, canonical_brand
    ORDER BY count DESC
    LIMIT 15
  `;
  console.log("\n[Sample: brand → canonical_brand]");
  samples.forEach((r) => console.log(`  "${r.brand}" → "${r.canonical_brand}" (${r.count}개)`));

  // 3. 크로스스토어 매칭 가능한 canonical_brand 수
  const crossStore = await prisma.$queryRaw<{ canonical_brand: string; stores: string; count: bigint }[]>`
    SELECT canonical_brand,
           STRING_AGG(DISTINCT store::text, ', ') AS stores,
           COUNT(*) AS count
    FROM store_products
    WHERE canonical_brand IS NOT NULL
    GROUP BY canonical_brand
    HAVING COUNT(DISTINCT store) > 1
    ORDER BY count DESC
    LIMIT 10
  `;
  console.log("\n[Cross-store matchable brands (top 10)]");
  crossStore.forEach((r) => console.log(`  "${r.canonical_brand}" — ${r.stores} (${r.count}개)`));
  console.log(`\n  Total cross-store matchable brands: ${crossStore.length} (showing top 10)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
