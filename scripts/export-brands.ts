import { config } from "dotenv";
import path from "path";
config({ path: path.join(__dirname, "../.env") });

import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";
import { writeFileSync } from "fs";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. All distinct non-empty brands
  const brands = await prisma.$queryRaw<{ brand: string }[]>`
    SELECT DISTINCT brand
    FROM store_products
    WHERE brand IS NOT NULL AND brand != ''
    ORDER BY brand
  `;

  // 2. Similar pairs via pg_trgm (similarity > 0.5, different strings)
  const pairs = await prisma.$queryRaw<{ a: string; b: string; sim: number }[]>`
    SELECT a.brand AS a, b.brand AS b,
           similarity(a.brand, b.brand) AS sim
    FROM (SELECT DISTINCT brand FROM store_products WHERE brand IS NOT NULL AND brand != '') a
    JOIN (SELECT DISTINCT brand FROM store_products WHERE brand IS NOT NULL AND brand != '') b
      ON a.brand < b.brand
    WHERE similarity(a.brand, b.brand) > 0.5
    ORDER BY sim DESC
  `;

  const output = {
    totalDistinctBrands: brands.length,
    brands: brands.map((r) => r.brand),
    similarPairs: pairs.map((r) => ({
      a: r.a,
      b: r.b,
      sim: Number(r.sim).toFixed(3),
    })),
  };

  writeFileSync("scripts/brands-export.json", JSON.stringify(output, null, 2));
  console.log(`Exported ${brands.length} brands and ${pairs.length} similar pairs.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
