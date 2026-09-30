// 主题令牌拷贝测试（2.2）：令牌值锚定 ui-design §Design System 色彩令牌表；
// 拷贝面保真（与 e-cam-web 源文件逐字节一致）+ shared-hashes.json 登记完整性
// （漂移防线数据源，CI 对比由 2.11 承接）。纯 fs 断言，node 环境即可。
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesDir = resolve(__dirname)
const read = (p: string) => readFileSync(resolve(stylesDir, p))

describe('theme-variables.scss 令牌（ui-design 色彩令牌表锚定）', () => {
  const css = () => read('theme-variables.scss').toString('utf8')

  it('强调色 + 语义色两主题一致，与规格逐项相同', () => {
    const cssText = css()
    expect(cssText).toContain('--accent-primary: #5e6ad2;')
    expect(cssText).toContain('--accent-blue: #7170ff;')
    expect(cssText).toContain('--accent-cyan: #06b6d4;')
    expect(cssText).toContain('--accent-green: #10b981;')
    expect(cssText).toContain('--accent-purple: #8b5cf6;')
    expect(cssText).toContain('--color-success: #27a644;')
    expect(cssText).toContain('--color-warning: #f59e0b;')
    expect(cssText).toContain('--color-danger: #ef4444;')
    expect(cssText).toContain('--color-info: #8a8f98;')
  })

  it('深色默认主题：表面 / 文本令牌与规格一致', () => {
    const cssText = css()
    expect(cssText).toContain('--bg-base: #08090a;')
    expect(cssText).toContain('--bg-elevated: #0f1011;')
    expect(cssText).toContain('--bg-surface: #191a1b;')
    expect(cssText).toContain('--bg-hover: #28282c;')
    expect(cssText).toContain('--text-primary: #f7f8f8;')
    expect(cssText).toContain('--text-regular: #d0d6e0;')
    expect(cssText).toContain('--text-secondary: #8a8f98;')
    expect(cssText).toContain('--text-tertiary: #62666d;')
  })

  it('浅色主题（:root.light）：表面 / 文本 / 边框令牌与规格一致', () => {
    const cssText = css()
    const lightStart = cssText.indexOf(':root.light')
    expect(lightStart).toBeGreaterThan(-1)
    const light = cssText.slice(lightStart)

    expect(light).toContain('--bg-base: #f7f8f8;')
    expect(light).toContain('--bg-elevated: #ffffff;')
    expect(light).toContain('--bg-hover: #f3f4f5;')
    expect(light).toContain('--text-primary: #111111;')
    expect(light).toContain('--text-regular: #333333;')
    expect(light).toContain('--border-base: #e6e6e6;')
    expect(light).toContain('--border-strong: #d0d6e0;')
  })
})

describe('element-theme.scss（Element Plus 令牌覆盖）', () => {
  it('EP 变量桥接语义令牌，且含 :root.light 浅色覆盖段', () => {
    const cssText = read('element-theme.scss').toString('utf8')
    expect(cssText).toContain('--el-color-primary: var(--accent-primary);')
    expect(cssText).toContain(':root.light {')
  })
})

describe('拷贝面保真 + shared-hashes.json 登记（漂移防线数据源）', () => {
  const copies = [
    { path: 'theme-variables.scss', source: 'src/assets/styles/theme-variables.scss' },
    { path: 'element-theme.scss', source: 'src/assets/styles/element-theme.scss' },
  ] as const

  const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')

  it('拷贝与 e-cam-web 源文件逐字节一致（源仓缺席时跳过——CI 侧由 2.11 承接）', () => {
    for (const copy of copies) {
      const sourcePath = resolve(stylesDir, '../../../../e-cam-web', copy.source)
      if (!existsSync(sourcePath)) {
        console.warn(`[skip] e-cam-web 源不可达：${copy.source}`)
        continue
      }
      expect(read(copy.path).equals(readFileSync(sourcePath)), copy.path).toBe(true)
    }
  })

  it('shared-hashes.json 登记完整，sha256 与本地文件实算一致', () => {
    const registryPath = resolve(stylesDir, '../../../shared-hashes.json')
    expect(existsSync(registryPath), 'shared-hashes.json 应登记于仓根').toBe(true)
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as {
      files: Array<{ path: string; sha256: string; sourceCommit: string }>
    }

    for (const copy of copies) {
      const entry = registry.files.find((e) => e.path.endsWith(copy.path))
      expect(entry, `shared-hashes.json 缺少 ${copy.path} 登记`).toBeDefined()
      expect(entry!.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(entry!.sourceCommit).toMatch(/^[0-9a-f]{40}$/)
      expect(entry!.sha256).toBe(sha256(read(copy.path)))
    }
  })
})
