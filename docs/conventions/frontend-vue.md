---
domains: [frontend, vue, typescript, testing, component]
---

# Vue3 前端页面工程约定（e-cam-web）

> 事实来源：`D:\Haven\e-cam-web`（Vue3 + TypeScript + Vitest，任务 5.1-5.6）。任何新增 Vue 页面/特性的能力应复用本约定。

## 纯展示逻辑收敛 logic.ts

- 无 Vue/DOM 运行时依赖的纯展示逻辑（标签映射 / 徽标 / 派生 / 校验）收敛到领域 `logic.ts`，node 环境可直接单测（同 cert 领域 `format.ts` 约定）。

## presentational 组件 + 页面编排

- 子组件 presentational：props 进、events 出；页面（index.vue）持有状态并编排 API 调用。
- 不可变原则：组件内编辑一律用本地副本（`ref(list.map(深拷贝))`），不直接改 props 数组项。

## API 分层：专用实例 + 信封解包

- 每个后端服务域用专用 axios 实例 + 统一信封解包函数（如 `unwrapOpsagent`），成功 code 多态（数字 0 vs 字符串 "0"）需明确判定。
- DTO 类型逐个镜像后端 json tag，集中定义于 `src/api/<domain>.ts`。

## 主题与测试

- 深色/品牌设计系统 tokens 作用域到 `.xxx-page` 容器，不污染全局默认主题页。
- 组件挂载测试用 `@vue/test-utils` + `// @vitest-environment happy-dom` 文件级 pragma；el-* 组件经构建期 `unplugin-vue-components` resolver 解析、vitest 环境不含该 resolver，故可测组件用原生元素。