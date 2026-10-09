// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Datasource } from '@/api/opsagent'
import DatasourceTab from './DatasourceTab.vue'

const DATASOURCES: Datasource[] = [
    { name: 'cdn', cloud: 'aliyun', ok: true, checkedAt: '2026-10-08T10:00:00Z' },
    { name: 'metric', cloud: 'aliyun', ok: false, checkedAt: '2026-10-08T09:00:00Z' },
]

describe('DatasourceTab 数据源配置（任务 5.6 AC#1）', () => {
    it('渲染数据源名称 + 连接状态（正常/异常）+ 检查时间', () => {
        const w = mount(DatasourceTab, { props: { datasources: DATASOURCES } })
        const rows = w.findAll('.ds-row')
        expect(rows).toHaveLength(2)
        expect(rows[0]!.find('.ds-row__name')!.text()).toBe('CDN')
        expect(rows[0]!.find('.ds-row__status')!.text()).toBe('正常')
        expect(rows[1]!.find('.ds-row__status')!.text()).toBe('异常')
        expect(rows[0]!.find('.ds-row__time')!.text()).toBe('2026-10-08 10:00')
    })

    it('空数据源显示空态', () => {
        const w = mount(DatasourceTab, { props: { datasources: [] } })
        expect(w.find('.datasource-tab__empty')!.text()).toBe('未配置数据源')
    })
})