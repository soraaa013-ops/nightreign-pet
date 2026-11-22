import { useEffect, useRef } from 'react'
export function NightRain({
  strength,
  paused,
  visible,
}: {
  strength: number
  paused: boolean
  visible: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const phase = useRef(0)
  useEffect(() => {
    const canvas = ref.current,
      ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let frame = 0,
      last = 0
    const render = (now: number) => {
      if (now - last >= 1000 / 30) {
        last = now
        const width = canvas.clientWidth,
          height = canvas.clientHeight,
          dpr = Math.min(devicePixelRatio, 2)
        if (
          canvas.width !== Math.round(width * dpr) ||
          canvas.height !== Math.round(height * dpr)
        ) {
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)
        if (visible && strength > 0) {
          phase.current += paused ? 0 : 0.025
          ctx.strokeStyle = `rgba(126,152,223,${0.12 + strength * 0.25})`
          ctx.lineWidth = 0.7
          const count = Math.round(8 + strength * 32)
          for (let i = 0; i < count; i++) {
            const x = (i * 67.3 + Math.sin(i) * 30) % Math.max(width, 1)
            const y = (i * 41.7 + phase.current * (70 + (i % 5) * 9)) % Math.max(height, 1)
            ctx.beginPath()
            ctx.moveTo(x, y)
            ctx.lineTo(x - 4, y + 8 + strength * 12)
            ctx.stroke()
          }
        }
      }
      if (visible && !paused && strength > 0) frame = requestAnimationFrame(render)
    }
    render(performance.now())
    return () => cancelAnimationFrame(frame)
  }, [strength, paused, visible])
  return <canvas ref={ref} className="rain-canvas" aria-hidden="true" />
}
