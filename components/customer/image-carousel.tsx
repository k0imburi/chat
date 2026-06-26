"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

export function ImageCarousel({ images, alt = "" }: { images: string[]; alt?: string }) {
  const [idx, setIdx] = useState(0)
  if (!images.length) return null

  if (images.length === 1) {
    return <img src={images[0]} alt={alt} className="w-full object-contain" style={{ maxHeight: "calc(100vh - 180px)" }} />
  }

  return (
    <div className="relative select-none">
      <img
        src={images[idx]}
        alt={alt}
        className="w-full object-contain"
        style={{ maxHeight: "calc(100vh - 180px)" }}
      />

      {idx > 0 && (
        <button
          onClick={() => setIdx((i) => i - 1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white backdrop-blur-sm transition hover:bg-black/75"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {idx < images.length - 1 && (
        <button
          onClick={() => setIdx((i) => i + 1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-2 text-white backdrop-blur-sm transition hover:bg-black/75"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all duration-200 ${
              i === idx ? "w-5 bg-white" : "w-1.5 bg-white/45"
            }`}
          />
        ))}
      </div>

      <div className="absolute right-4 top-4 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-sm">
        {idx + 1} / {images.length}
      </div>
    </div>
  )
}
