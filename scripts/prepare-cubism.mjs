import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import unzipper from 'unzipper'

const sdk = 'CubismSdkForWeb-5-r.5'
const archiveUrl = `https://cubism.live2d.com/sdk-web/bin/${sdk}.zip`
const archiveHash = '67064a7fb1812cf502f5c4a03bfe12cc638c75a621bb4acf06bb28763df06ba0'
const coreHash = '8741f739779b5d5210872bd3d7d99f0f1e56e6c87409e7d26d6bb4b80aa1ef47'
const name = 'live2dcubismcore.min.js'
const target = fileURLToPath(new URL(`../resources/character/cubism-core/${name}`, import.meta.url))
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function prepare(archivePath) {
  try {
    if (digest(await readFile(target)) === coreHash) return
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  let archive
  if (archivePath) {
    archive = await readFile(archivePath)
  } else {
    console.info(`从 Live2D 官网获取 ${sdk}。`)
    const response = await fetch(archiveUrl, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`下载 Cubism SDK 失败，HTTP ${response.status}。`)
    archive = Buffer.from(await response.arrayBuffer())
  }
  if (digest(archive) !== archiveHash) throw new Error('Cubism SDK 压缩包的 SHA-256 不匹配。')
  const files = await unzipper.Open.buffer(archive)
  const entry = files.files.find((file) => file.path === `${sdk}/Core/${name}`)
  if (!entry) throw new Error('Cubism SDK 中缺少 Core。')
  const core = await entry.buffer()
  if (digest(core) !== coreHash) throw new Error('Cubism Core 的 SHA-256 不匹配。')
  await mkdir(dirname(target), { recursive: true })
  const temporary = `${target}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, core)
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true })
  }
  console.info('Cubism Core 已通过校验，后续构建可离线使用。')
}

prepare(process.argv[2]).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
