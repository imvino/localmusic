import { useState } from 'react'
import { Disc } from 'lucide-react'
import { getImageSrc } from '../utils'

// Bulletproof artwork: normalizes EVERY image shape (string | array of
// {quality,url} | {url}), upgrades to 500x500, sends no-referrer (beats CDN
// hotlink walls), and falls back to a placeholder on error so a dead URL
// never leaves a broken-image icon on screen.
export default function ArtImage({
  image,
  alt = '',
  className = '',
  imgClassName = '',
  iconSize = 32,
  fallback: Fallback = Disc,
  rounded = 'rounded-md',
  ...rest
}) {
  const src = getImageSrc(image)
  const [failed, setFailed] = useState(false)
  const showFallback = !src || failed

  if (showFallback) {
    return (
      <div className={`flex items-center justify-center text-zinc-600 bg-zinc-800 ${rounded} ${className}`} {...rest}>
        <Fallback size={iconSize} />
      </div>
    )
  }

  return (
    <div className={`overflow-hidden bg-zinc-800 ${rounded} ${className}`} {...rest}>
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover ${imgClassName}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  )
}