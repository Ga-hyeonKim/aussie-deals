"use client"

import { useEffect, useState } from "react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"

type PricePoint = {
  id: string
  price: number
  isOnSale: boolean
  recordedAt: string
}

type Props = {
  storeProductId: string
  currentPrice: number
}

export default function PriceHistoryChart({ storeProductId, currentPrice }: Props) {
  const [history, setHistory] = useState<PricePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/price-history/${storeProductId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setHistory)
      .finally(() => setLoading(false))
  }, [storeProductId])

  if (loading) return <div className="h-32 animate-pulse rounded-xl bg-gray-100" />

  if (history.length === 0) return (
    <p className="text-xs text-gray-400">No price history yet — check back after the next weekly update.</p>
  )

  const data = history.map(h => ({
    date: new Date(h.recordedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    price: h.price,
    isOnSale: h.isOnSale,
  }))

  const prices = history.map(h => h.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length

  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-gray-500">
        <span>Low <span className="font-semibold text-green-600">${minPrice.toFixed(2)}</span></span>
        <span>High <span className="font-semibold text-gray-800">${maxPrice.toFixed(2)}</span></span>
        <span>Avg <span className="font-semibold text-gray-800">${avgPrice.toFixed(2)}</span></span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#16a34a" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} tickFormatter={v => `$${v}`} />
          <Tooltip
            formatter={(v: number, _: string, props: { payload?: { isOnSale?: boolean } }) => [
              `$${v.toFixed(2)}${props.payload?.isOnSale ? " 🏷️ Sale" : ""}`,
              "Price"
            ]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <ReferenceLine y={avgPrice} stroke="#d1d5db" strokeDasharray="4 2" />
          <Area type="monotone" dataKey="price" stroke="#16a34a" strokeWidth={2} fill="url(#priceGrad)" dot={(props) => {
            const { cx, cy, payload } = props
            return payload.isOnSale
              ? <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#16a34a" stroke="white" strokeWidth={2} />
              : <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={2} fill="#16a34a" />
          }} />
        </AreaChart>
      </ResponsiveContainer>
      <p className="mt-1 text-xs text-gray-400">🏷️ = on sale &nbsp;·&nbsp; dashed line = average</p>
    </div>
  )
}
