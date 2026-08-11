"use client"

import { useEffect, useMemo, useState } from "react"
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from "recharts"

type PricePoint = {
  price: number
  isOnSale: boolean
  recordedAt: string
}

type StoreInput = {
  storeProductId: string
  store: string
}

type Props = {
  stores: StoreInput[]
}

const STORE_VAR: Record<string, string> = {
  WOOLWORTHS: "var(--chart-woolworths)",
  COLES: "var(--chart-coles)",
}

const STORE_LABEL: Record<string, string> = {
  WOOLWORTHS: "Woolworths",
  COLES: "Coles",
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

const money = (n: number) => `$${n.toFixed(2)}`

const RANGES = [
  { label: "1M", days: 30, phrase: "in the last month" },
  { label: "3M", days: 90, phrase: "in the last 3 months" },
  { label: "6M", days: 180, phrase: "in the last 6 months" },
  { label: "1Y", days: 365, phrase: "in the last year" },
  { label: "All", days: null, phrase: "on record" },
] as const

const DAY = 24 * 60 * 60 * 1000

export default function CrossStorePriceChart({ stores }: Props) {
  const [series, setSeries] = useState<Record<string, PricePoint[]>>({})
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<string>("All")

  useEffect(() => {
    let cancelled = false

    Promise.all(
      stores.map(s =>
        fetch(`/api/price-history/${s.storeProductId}`)
          .then(r => (r.ok ? r.json() : []))
          .then((h: PricePoint[]) => [s.store, h] as const)
      )
    ).then(entries => {
      if (cancelled) return
      setSeries(Object.fromEntries(entries))
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [stores])

  // Deduped per-store readings, before any range filtering
  const clean = useMemo(() => {
    const out: Record<string, { date: string; price: number }[]> = {}
    for (const s of stores) {
      // The scrapers write several rows for the same day (failed-run retries plus
      // four workflows each recording), so collapse to one reading per date —
      // last wins. Without this the x-axis is padded with duplicate points.
      const perDay = new Map<string, number>()
      for (const p of series[s.store] ?? []) {
        perDay.set(new Date(p.recordedAt).toISOString().slice(0, 10), p.price)
      }
      out[s.store] = [...perDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, price]) => ({ date, price }))
    }
    return out
  }, [series, stores])

  // Only offer ranges that actually cut something. With ~3 months of history a
  // "6M" button would return the same view as "All" — the options grow into
  // existence as the archive does, so a range never silently does nothing.
  const available = useMemo(() => {
    const dates = Object.values(clean).flat().map(p => p.date)
    if (dates.length === 0) return [RANGES[RANGES.length - 1]]
    const spanDays =
      (Date.now() - new Date(dates.reduce((a, b) => (a < b ? a : b))).getTime()) / DAY
    return RANGES.filter(r => r.days === null || r.days < spanDays)
  }, [clean])

  const activeRange =
    available.find(r => r.label === range) ?? available[available.length - 1]

  const model = useMemo(() => {
    const cutoff = activeRange.days ? Date.now() - activeRange.days * DAY : null
    const byDate = new Map<string, Record<string, number | string>>()
    const stats: Record<string, { now: number; low: number; avg: number } | null> = {}

    for (const s of stores) {
      const points = (clean[s.store] ?? []).filter(
        p => cutoff === null || new Date(p.date).getTime() >= cutoff
      )

      if (points.length === 0) {
        stats[s.store] = null
        continue
      }

      for (const { date, price } of points) {
        if (!byDate.has(date)) byDate.set(date, { date })
        byDate.get(date)![s.store] = price
      }

      const prices = points.map(p => p.price)
      stats[s.store] = {
        now: prices[prices.length - 1],
        low: Math.min(...prices),
        avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      }
    }

    const data = [...byDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    )

    const present = stores.map(s => stats[s.store]).filter(Boolean) as { now: number; low: number; avg: number }[]

    // One benchmark, not one per store: the best this product has been at
    // either store. Per-store lows would measure each line against its own
    // yardstick and flatter whichever store is simply expensive.
    const bestEver = present.length ? Math.min(...present.map(p => p.low)) : null

    const all = data.flatMap(row =>
      stores.map(s => row[s.store]).filter((v): v is number => typeof v === "number")
    )
    const lo = all.length ? Math.min(...all) : 0
    const hi = all.length ? Math.max(...all) : 1
    const pad = hi === lo ? Math.max(lo * 0.08, 0.5) : (hi - lo) * 0.08
    const domain: [number, number] = [Math.max(0, lo - pad), hi + pad]

    return { data, stats, bestEver, domain }
  }, [clean, stores, activeRange])

  if (loading) return <div className="h-56 animate-pulse rounded-xl bg-gray-100 dark:bg-neutral-800" />

  const live = stores
    .map(s => ({ store: s.store, st: model.stats[s.store] }))
    .filter((x): x is { store: string; st: { now: number; low: number; avg: number } } => Boolean(x.st))

  if (live.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-neutral-500">
        No price history yet — check back after the next weekly update.
      </p>
    )
  }

  // Verdict — the conclusion, so the reader doesn't have to derive it
  const cheapest = live.reduce((a, b) => (a.st.now <= b.st.now ? a : b))
  const other = live.find(x => x !== cheapest)
  const gap = other ? other.st.now - cheapest.st.now : 0
  const atBest = model.bestEver !== null && cheapest.st.now <= model.bestEver * 1.02

  return (
    <div>
      <div className="mb-4 rounded-xl bg-gray-900 px-3.5 py-3 text-white dark:bg-neutral-100 dark:text-neutral-900">
        <p className="text-sm font-semibold leading-snug">
          {live.length === 1 || gap < 0.005
            ? `Same price at both stores — ${money(cheapest.st.now)}`
            : `Cheapest at ${STORE_LABEL[cheapest.store] ?? cheapest.store} right now`}
        </p>
        <p className="mt-0.5 text-xs tabular-nums opacity-70">
          {gap >= 0.005 && other && (
            <>{money(cheapest.st.now)} · {money(gap)} less than {STORE_LABEL[other.store] ?? other.store}</>
          )}
          {gap >= 0.005 && other && atBest && " · "}
          {atBest && `lowest ${activeRange.phrase}`}
        </p>
      </div>

      <div className="mb-2 flex items-center justify-between gap-3">
        {/* Legend — identity in text, never colour alone */}
        <div className="flex flex-wrap gap-3">
          {live.map(({ store }) => (
            <span key={store} className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-neutral-300">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: STORE_VAR[store] ?? "#6b7280" }}
              />
              {STORE_LABEL[store] ?? store}
            </span>
          ))}
        </div>

        {available.length > 1 && (
          <div className="flex shrink-0 gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-neutral-800">
            {available.map(r => (
              <button
                key={r.label}
                onClick={() => setRange(r.label)}
                aria-pressed={activeRange.label === r.label}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                  activeRange.label === r.label
                    ? "bg-white text-gray-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={model.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tickMargin={8}
            minTickGap={36}
            tickFormatter={fmtDate}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
            tickLine={false}
            axisLine={false}
            width={46}
            domain={model.domain}
            tickCount={4}
            tickFormatter={v => `$${Number(v).toFixed(Number(v) % 1 === 0 ? 0 : 2)}`}
          />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            formatter={(v, name) => [money(Number(v)), STORE_LABEL[String(name)] ?? String(name)]}
            labelFormatter={d => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            contentStyle={{
              fontSize: 12,
              borderRadius: 10,
              border: "1px solid var(--chart-grid)",
              background: "var(--chart-surface)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              padding: "8px 10px",
            }}
          />

          {model.bestEver !== null && (
            <ReferenceLine
              y={model.bestEver}
              stroke="var(--chart-rule)"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{
                value: `best ${money(model.bestEver)}`,
                position: "insideBottomRight",
                fontSize: 10,
                fill: "var(--chart-axis)",
              }}
            />
          )}

          {live.map(({ store }, i) => (
            <Line
              key={store}
              type="stepAfter"
              dataKey={store}
              name={store}
              stroke={STORE_VAR[store] ?? "#6b7280"}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-surface)" }}
              dot={(props) => {
                const { payload, index } = props
                const cx = Number(props.cx ?? 0)
                const cy = Number(props.cy ?? 0)
                const k = `${store}-${String(payload?.date ?? index)}`
                if (index !== model.data.length - 1) return <g key={k} />

                const color = STORE_VAR[store] ?? "#6b7280"
                // Shape differs per store so the latest reading is identifiable
                // without relying on hue at all.
                return i === 0 ? (
                  <rect
                    key={k}
                    x={cx - 3.5} y={cy - 3.5} width={7} height={7} rx={1.5}
                    fill={color} stroke="var(--chart-surface)" strokeWidth={2}
                  />
                ) : (
                  <circle
                    key={k}
                    cx={cx} cy={cy} r={4}
                    fill={color} stroke="var(--chart-surface)" strokeWidth={2}
                  />
                )
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Figures in text — the chart never gates a value */}
      <div className="mt-3 flex flex-col gap-1.5">
        {live.map(({ store, st }) => (
          <div key={store} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-neutral-100">
              <span
                aria-hidden
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: STORE_VAR[store] ?? "#6b7280" }}
              />
              {STORE_LABEL[store] ?? store}
            </span>
            <span className="tabular-nums text-gray-500 dark:text-neutral-400">
              <span className="font-semibold text-gray-900 dark:text-neutral-100">{money(st.now)}</span>
              {" · low "}{money(st.low)}
              {" · usually "}{money(st.avg)}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-neutral-500">
        Price holds until the next weekly update · dashed line = best price seen at either store
      </p>
    </div>
  )
}
