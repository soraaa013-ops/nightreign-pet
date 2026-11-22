import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fields, record } from '../core/validation'

const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'

export class JsonStore {
  readonly warnings: string[] = []
  private previous = new Map<string, string>()
  private writes = Promise.resolve()
  constructor(readonly directory: string) {}

  private file(name: string) {
    if (!/^[a-zA-Z0-9_-]+(?:\.json)?$/.test(name)) throw new Error('本地记录名称无效。')
    return join(this.directory, name.endsWith('.json') ? name : name + '.json')
  }

  async read<T>(name: string, validate: (value: unknown) => T, fallback: T): Promise<T> {
    const path = this.file(name)
    for (const candidate of [path, path + '.bak']) {
      let bytes: string
      try {
        bytes = await readFile(candidate, 'utf8')
      } catch (error) {
        if (missing(error)) continue
        throw new Error('无法读取本地记录，请检查目录权限。')
      }
      try {
        const object = record(JSON.parse(bytes))
        fields(object, ['schemaVersion', 'data'])
        if (object.schemaVersion !== 1) throw new Error('版本不受支持')
        const data = validate(object.data)
        this.previous.set(path, bytes)
        if (candidate !== path) this.warnings.push(name + ' 已使用上一次有效备份恢复。')
        return data
      } catch {
        // Preserve the damaged input before a future write creates its replacement.
        await rename(candidate, candidate + '.corrupt-' + randomUUID())
        this.warnings.push(name + ' 无法读取，原文件已保留。')
      }
    }
    return structuredClone(fallback)
  }

  private async replace(path: string, content: string) {
    const temporary = path + '.' + randomUUID() + '.tmp'
    try {
      const handle = await open(temporary, 'wx', 0o600)
      try {
        await handle.writeFile(content, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true }).catch(() => {})
    }
  }

  write<T>(name: string, data: T): Promise<void> {
    const path = this.file(name)
    const bytes = JSON.stringify({ schemaVersion: 1, data })
    const operation = this.writes.then(async () => {
      await mkdir(this.directory, { recursive: true })
      const previous = this.previous.get(path)
      if (previous !== undefined) await this.replace(path + '.bak', previous)
      await this.replace(path, bytes)
      this.previous.set(path, bytes)
      // Directory sync is supported by normal POSIX file systems.
      if (process.platform !== 'win32') {
        try {
          const directory = await open(this.directory, 'r')
          try {
            await directory.sync()
          } finally {
            await directory.close()
          }
        } catch {
          // rename has committed; reporting failure here would undo only memory.
          const warning = '本地记录已替换，当前文件系统无法确认目录同步。'
          if (!this.warnings.includes(warning)) this.warnings.push(warning)
        }
      }
    })
    this.writes = operation.catch(() => {})
    return operation
  }
}
