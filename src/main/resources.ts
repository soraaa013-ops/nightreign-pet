import { app, net, protocol } from 'electron'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

export function serveResources(issue: (message: string) => void) {
  const rootPath = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), 'resources')
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  }
  const denied = (status: number) => new Response(null, { status, headers })
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    if (
      url.host !== 'assets' ||
      url.username ||
      url.password ||
      !['GET', 'HEAD'].includes(request.method)
    )
      return denied(403)
    let name: string
    try {
      name = decodeURIComponent(url.pathname)
    } catch {
      return denied(400)
    }
    if (name.includes('\\') || name.includes('\0') || name.split('/').includes('..'))
      return denied(400)
    try {
      const root = await realpath(rootPath)
      const path = await realpath(resolve(root, '.' + name))
      const child = relative(root, path)
      if (
        !child ||
        child === '..' ||
        child.startsWith('..' + sep) ||
        isAbsolute(child) ||
        !(await stat(path)).isFile()
      )
        return denied(403)
      const response = await net.fetch(pathToFileURL(path).href, { method: request.method })
      const out = new Headers(response.headers)
      for (const [key, val] of Object.entries(headers)) out.set(key, val)
      return new Response(response.body, { status: response.status, headers: out })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT' || code === 'ENOTDIR') return denied(404)
      issue(
        code === 'EACCES'
          ? '无法读取角色资源，请检查本地资源目录的访问权限。'
          : '无法读取应用资源，请检查所安装的资源文件。',
      )
      return denied(500)
    }
  })
}
