import Image from "next/image"
import { ProductModel } from "@/app/generated/prisma/models"
import FavoriteButton from "@/components/FavoriteButton"
import CartButton from "@/components/CartButton"

type Props = {
  product: ProductModel
}

export default function ProductCard({ product }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-2">
      {product.imageUrl && (
        <div className="relative mx-auto h-32 w-32">
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="128px"
            className="object-contain"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">{product.store}</p>
          <h2 className="text-sm font-semibold text-gray-900 leading-tight">{product.name}</h2>
          {product.brand && (
            <p className="text-xs text-gray-500">{product.brand}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {product.discountPercent && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
              -{product.discountPercent}%
            </span>
          )}
          <FavoriteButton productId={product.id} />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-lg font-bold text-gray-900">
          ${product.salePrice.toFixed(2)}
        </span>
        {product.originalPrice && (
          <span className="text-sm text-gray-400 line-through">
            ${product.originalPrice.toFixed(2)}
          </span>
        )}
        {product.unit && (
          <span className="text-xs text-gray-400">{product.unit}</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{product.category}</p>
        <CartButton productId={product.id} />
      </div>
    </div>
  )
}
