// generate-gz.mjs — 构建期 .gz 预生成（tech-design 性能预算「构建期预生成 .gz + nginx gzip_static on」承接）
//
// 递归遍历 dist/，为每个文件生成同名 .gz（gzip 压缩），供 nginx gzip_static 直发。
// 已存在的 .gz 会被覆盖（幂等）。.gz 文件自身不再被二次压缩。
//
// 用法: node scripts/generate-gz.mjs [dist-dir]   （默认 dist）

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

/**
 * 递归收集目录下所有非 .gz 文件（绝对路径）。
 * @param {string} root
 * @returns {string[]}
 */
export function collectSourceFiles(root) {
  const out = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const abs = join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(abs)
      } else if (ent.isFile() && !ent.name.endsWith('.gz')) {
        out.push(abs)
      }
    }
  }
  walk(root)
  return out
}

/**
 * 为 dist 下所有产物生成 .gz。
 * @param {string} distDir
 * @returns {{ generated: number, skipped: number, files: {src:string, gz:string, bytes:number}[] }}
 */
export function generateGz(distDir) {
  if (!existsSync(distDir)) {
    throw new Error(`dist 目录不存在: ${distDir}（先执行 pnpm build）`)
  }
  const files = collectSourceFiles(distDir)
  const generated = []
  let skipped = 0
  for (const src of files) {
    // html/js/css/字体/图标 等都压缩；二进制（woff2/png）gzip 收益小但不报错，gzipSync 兼容
    const buf = readFileSync(src)
    const gz = gzipSync(buf, { level: 9 })
    const gzPath = `${src}.gz`
    writeFileSync(gzPath, gz)
    generated.push({ src, gz: gzPath, bytes: gz.length })
  }
  return { generated: generated.length, skipped, files: generated }
}

// ── CLI 入口
export function main(argv = process.argv) {
  const distDir = argv[2] || 'dist'
  const result = generateGz(distDir)
  const totalKb = Math.round(
    (result.files.reduce((s, f) => s + f.bytes, 0) / 1024) * 10,
  ) / 10
  console.log(`生成 .gz: ${result.generated} 个文件，总 gzip 体积 ${totalKb} KB`)
  for (const f of result.files) {
    console.log(`  ${(f.bytes / 1024).toFixed(2)} KB  ${f.gz}`)
  }
}

import { fileURLToPath } from 'node:url'
const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirect) main()
