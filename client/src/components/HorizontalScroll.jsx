import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function HorizontalScroll({ title, icon: Icon, items, renderItem, emptyMessage }) {
  const scrollContainerRef = useRef(null)

  const scroll = (direction) => {
    if (scrollContainerRef.current) {
      const scrollAmount = 400
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={20} className="text-[#fc3c44]" />}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        {items.length > 0 && (
          <div className="hidden md:flex gap-2">
            <button
              onClick={() => scroll('left')}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
              title="Scroll left"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => scroll('right')}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
              title="Scroll right"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
      {items.length > 0 ? (
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
          style={{ scrollBehavior: 'smooth' }}
        >
          {items.map((item, index) => (
            <div key={item.id || index} className="flex-shrink-0">
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-zinc-500 text-sm">{emptyMessage}</p>
      )}
    </div>
  )
}
