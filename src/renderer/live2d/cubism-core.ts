let coreLoad: Promise<void> | undefined

export async function loadCubismCore(url: URL): Promise<void> {
  if (!coreLoad) {
    coreLoad = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      const finish = (error?: Error) => {
        window.clearTimeout(timeout)
        script.remove()
        if (error) reject(error)
        else resolve()
      }
      const timeout = window.setTimeout(
        () => finish(new Error(`加载 ${url.pathname} 超时。`)),
        10_000,
      )
      script.src = url.href
      script.onload = () => {
        if ('Live2DCubismCore' in globalThis) finish()
        else finish(new Error(`未找到 Cubism Core：${url.pathname}。`))
      }
      script.onerror = () => finish(new Error(`无法加载 Cubism Core：${url.pathname}。`))
      document.head.append(script)
    }).catch((error) => {
      coreLoad = undefined
      throw error
    })
  }
  return coreLoad
}
