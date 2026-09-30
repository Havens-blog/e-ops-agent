// @vitest-environment happy-dom
// 契约渲染组件单测（2.5，tech-design 三共享组件之一）：
// code → 文案逐字断言（防二次映射回归）+ 纯文本渲染（禁用 v-html 的可执行证据）。
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { COPY_CONTRACT } from '@/utils/copyContract'
import CopyContractText from './CopyContractText.vue'

describe('CopyContractText（2.5 契约渲染组件）', () => {
  it('已知契约 key 逐字渲染，全部 17 key 参数化断言（不二次映射、不改写措辞）', () => {
    for (const [key, expected] of Object.entries(COPY_CONTRACT)) {
      const wrapper = mount(CopyContractText, { props: { code: key } })
      expect(wrapper.text()).toBe(expected)
      wrapper.unmount()
    }
  })

  it('带参渲染：占位符经 params 插值', () => {
    const wrapper = mount(CopyContractText, {
      props: { code: 'auth.account_locked', params: { X: 7 } },
    })
    expect(wrapper.text()).toBe('尝试次数过多，账号已锁定，剩余 7 分钟')
  })

  it('未知 code（eiam 返回原文）纯文本渲染：HTML 内容被转义，不产生任何元素（禁用 v-html 证据）', () => {
    const malicious = '<img src=x onerror=alert(1)>'
    const wrapper = mount(CopyContractText, { props: { code: malicious } })
    expect(wrapper.text()).toBe(malicious)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.element.tagName).toBe('SPAN')
  })

  it('未知 code 含标签字符同样转义为可见文本，不注入 DOM', () => {
    const raw = '<b>数据已被他人修改</b>'
    const wrapper = mount(CopyContractText, { props: { code: raw } })
    expect(wrapper.text()).toBe(raw)
    expect(wrapper.find('b').exists()).toBe(false)
  })

  it('未知 code 不套用 params 插值（eiam 原文不做任何变换）', () => {
    const raw = '剩余 {X} 分钟（eiam 原文）'
    const wrapper = mount(CopyContractText, { props: { code: raw, params: { X: 1 } } })
    expect(wrapper.text()).toBe(raw)
  })

  it('tag prop 可换渲染标签；attrs 透传（id）支持表单 aria-describedby 就近输出', () => {
    const wrapper = mount(CopyContractText, {
      props: { code: 'validation.name_exists', params: { name: '财务部' }, tag: 'p' },
      attrs: { id: 'name-exists-error' },
    })
    expect(wrapper.element.tagName).toBe('P')
    expect(wrapper.attributes('id')).toBe('name-exists-error')
  })

  it('字段错误接线样态：input aria-describedby 指向本组件 id（字段级校验就近输出路径）', () => {
    const wrapper = mount(
      {
        components: { CopyContractText },
        template: `
          <div>
            <input aria-describedby="name-exists-error" />
            <CopyContractText id="name-exists-error" code="validation.name_exists" :params="{ name: '财务部' }" />
          </div>
        `,
      },
      { global: {} },
    )
    const input = wrapper.find('input')
    const error = wrapper.find('#name-exists-error')
    expect(input.attributes('aria-describedby')).toBe('name-exists-error')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe('名称已存在：财务部')
  })
})
