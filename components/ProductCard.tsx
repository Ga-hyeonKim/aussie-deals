import Image from "next/image"
import Link from "next/link"
import { ProductModel } from "@/app/generated/prisma/models"
import FavoriteButton from "@/components/FavoriteButton"
import CartButton from "@/components/CartButton"

type Props = {
  product: ProductModel & { storeProductId?: string | null }
}

export default function ProductCard({ product }: Props) {
  return (
    <div className="relative rounded-2xl border border-gray-200 bg-white p-3 shadow-sm flex flex-col gap-2">
      <Link href={`/product/${product.id}`} className="absolute inset-0 z-0 rounded-2xl" aria-label={product.name} />

      {product.imageUrl && (
        <div className="relative mx-auto h-20 w-20">
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="80px"
            className="object-contain"
          />
        </div>
      )}

      <div className="min-w-0">
        <p className="text-xs text-gray-400 uppercase tracking-wide">{product.store}</p>
        <h2 className="truncate text-sm font-semibold text-gray-900 leading-tight">{product.name}</h2>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-base font-bold text-gray-900">${product.salePrice.toFixed(2)}</span>
        {product.discountPercent && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
            -{product.discountPercent}%
          </span>
        )}
      </div>

      <div className="relative z-10 flex items-center justify-end gap-2">
        <FavoriteButton storeProductId={product.storeProductId} productId={product.id} />
        <CartButton productId={product.id} />
      </div>
    </div>
  )
}
