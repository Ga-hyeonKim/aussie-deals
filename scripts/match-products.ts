import { config } from "dotenv";
import path from "path";
config({ path: path.join(__dirname, "../.env") });

import ws from "ws";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";
import { sameSize } from "../lib/unit";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SIMILARITY_THRESHOLD = 0.92;

interface MatchCandidate {
  woolworths_id: string;
  woolworths_name: string;
  woolworths_unit: string | null;
  coles_id: string;
  coles_name: string;
  coles_unit: string | null;
  similarity: number;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

async function findMatches(): Promise<MatchCandidate[]> {
  // pgvector cosine distance: 0 = identical, 2 = opposite
  // similarity = 1 - distance
  const rows = await prisma.$queryRaw<MatchCandidate[]>`
    SELECT
      w.id AS woolworths_id,
      w.name AS woolworths_name,
      w.unit AS woolworths_unit,
      c.id AS coles_id,
      c.name AS coles_name,
      c.unit AS coles_unit,
      1 - (w.embedding <=> c.embedding) AS similarity
    FROM store_products w
    JOIN store_products c
      ON w.canonical_brand = c.canonical_brand
    WHERE w.store = 'WOOLWORTHS'
      AND c.store = 'COLES'
      AND w.embedding IS NOT NULL
      AND c.embedding IS NOT NULL
      AND w.product_group_id IS NULL
      AND c.product_group_id IS NULL
      AND 1 - (w.embedding <=> c.embedding) > ${SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
  `;
  return rows;
}

/**
 * Reject pairs whose pack sizes disagree.
 *
 * Brand is already a hard gate in the SQL join; size was not, and nothing else
 * could supply it — `normalizedName` strips the size, so a 226g tub and a
 * 473mL bottle embed identically. That left 18% of cross-store groups
 * comparing different products (170g yoghurt against 1kg, Aug 2026).
 *
 * Sizes that make no claim ("1EA", "each", empty) abstain rather than reject:
 * one store simply not publishing a size is not evidence of a mismatch.
 */
function gateBySize(matches: MatchCandidate[]): { kept: MatchCandidate[]; rejected: MatchCandidate[] } {
  const kept: MatchCandidate[] = [];
  const rejected: MatchCandidate[] = [];
  for (const m of matches) {
    if (sameSize(m.woolworths_unit, m.coles_unit) === false) rejected.push(m);
    else kept.push(m);
  }
  return { kept, rejected };
}

function dedupeMatches(matches: MatchCandidate[]): MatchCandidate[] {
  const claimed = new Set<string>();
  const result: MatchCandidate[] = [];
  for (const m of matches) {
    if (claimed.has(m.woolworths_id) || claimed.has(m.coles_id)) continue;
    claimed.add(m.woolworths_id);
    claimed.add(m.coles_id);
    result.push(m);
  }
  return result;
}

async function createGroups(matches: MatchCandidate[]): Promise<number> {
  const BATCH = 200;
  let created = 0;

  for (let i = 0; i < matches.length; i += BATCH) {
    const batch = matches.slice(i, i + BATCH);
    const ids: string[] = [];
    const names: string[] = [];
    const woolIds: string[] = [];
    const colesIds: string[] = [];

    for (const m of batch) {
      const gid = crypto.randomUUID();
      ids.push(gid);
      names.push(m.woolworths_name);
      woolIds.push(m.woolworths_id);
      colesIds.push(m.coles_id);
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO product_groups (id, name, "createdAt")
       SELECT unnest($1::text[]), unnest($2::text[]), now()`,
      ids,
      names
    );

    await prisma.$executeRawUnsafe(
      `UPDATE store_products SET product_group_id = data.gid
       FROM unnest($1::text[], $2::text[]) AS data(gid, spid)
       WHERE store_products.id = data.spid`,
      [...ids, ...ids],
      [...woolIds, ...colesIds]
    );

    created += batch.length;
    console.log(`[Match] ${created}/${matches.length}개 그룹 생성...`);
  }

  return created;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("[Match] 매칭 후보 검색 중...");
  const startTime = Date.now();

  const raw = await findMatches();
  console.log(`[Match] ${raw.length}개 후보 발견 (${fmt(Date.now() - startTime)})`);

  const { kept: matches, rejected } = gateBySize(raw);
  if (rejected.length > 0) {
    const pct = ((rejected.length / raw.length) * 100).toFixed(1);
    console.log(`[Match] 용량 불일치로 ${rejected.length}개 거부 (${pct}%)`);
    for (const m of rejected.slice(0, 8)) {
      console.log(`  ${String(m.woolworths_unit).padEnd(9)} ${m.woolworths_name}`);
      console.log(`  ${String(m.coles_unit).padEnd(9)} ${m.coles_name}`);
    }
  }

  if (matches.length === 0) {
    console.log("[Match] 새로운 매칭 없음. 종료.");
    return;
  }

  // 상위 10개 + 하위 10개 미리보기
  console.log("\n[Match] 상위 매칭 미리보기:");
  for (const m of matches.slice(0, 10)) {
    console.log(`  ${(m.similarity * 100).toFixed(1)}% | ${m.woolworths_name} ↔ ${m.coles_name}`);
  }
  if (matches.length > 20) {
    console.log("\n[Match] 하위 매칭 미리보기 (threshold 근처):");
    for (const m of matches.slice(-10)) {
      console.log(`  ${(m.similarity * 100).toFixed(1)}% | ${m.woolworths_name} ↔ ${m.coles_name}`);
    }
  }

  if (dryRun) {
    console.log(`\n[Match] --dry-run 모드. 실제 생성 없이 종료.`);
    return;
  }

  const unique = dedupeMatches(matches);
  console.log(`\n[Match] 중복 제거 후 ${unique.length}개 그룹 생성 중...`);
  const created = await createGroups(unique);
  console.log(`[Match] 완료: ${created}개 그룹 생성 (총 ${fmt(Date.now() - startTime)})`);
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
