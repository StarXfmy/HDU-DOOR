const ICON_PATHS = [
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/favicon.png',
  '/favicon.svg',
]

const ICON_COLORS: Record<string, string> = {
  green: '#4f7c68',
  blue: '#527da3',
  orange: '#b87842',
  purple: '#80659b',
  teal: '#3f8585',
  rose: '#ad6471',
}

export function faviconCandidates(value: string): string[] {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return []
    return ICON_PATHS.map(path => new URL(path, url.origin).href)
  } catch {
    return []
  }
}

function canvasIcon(callback: (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void): string {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法生成图标')
  callback(context, canvas)
  return canvas.toDataURL('image/webp', .86)
}

export function generateLetterIcon(name: string, color: string): string {
  const letter = Array.from(name.trim())[0] || '网'
  return canvasIcon((context, canvas) => {
    context.fillStyle = ICON_COLORS[color] || ICON_COLORS.green
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#ffffff'
    context.font = '700 64px "Microsoft YaHei UI", "PingFang SC", sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(letter.toUpperCase(), 64, 68)
  })
}

export async function loadSiteIcon(value: string, timeoutMs = 4000): Promise<string | null> {
  const candidates = faviconCandidates(value)
  if (!candidates.length || typeof createImageBitmap !== 'function') return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'force-cache',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        })
        if (!response.ok) continue
        const blob = await response.blob()
        if (!blob.type.startsWith('image/') || blob.size > 1024 * 1024) continue
        const bitmap = await createImageBitmap(blob)
        try {
          return canvasIcon((context, canvas) => {
            const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height)
            const width = bitmap.width * scale
            const height = bitmap.height * scale
            context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
          })
        } finally {
          bitmap.close()
        }
      } catch {
        if (controller.signal.aborted) break
      }
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}
