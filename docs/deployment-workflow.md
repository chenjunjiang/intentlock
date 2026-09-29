# Git-first 部署工作流

适用项目：GitHub `chenjunjiang/intentlock` → Vercel `gumu1/intentlock`，生产分支 `main`，稳定域名 `https://intentlock-nine.vercel.app`。

## 当前过渡状态

2026-09-29 有一次生产部署来自未提交工作树；这是历史流程缺陷，不能把该 CLI 部署记作 Git 自动部署。目前已将同一已验收源码推送至 GitHub `main@7277b33`，并将 Vercel 项目连接到 `chenjunjiang/intentlock`。连接后的首次 Git 推送、Git 来源生产部署及稳定域名复验仍待完成。

## 首次对账

1. 在隔离分支检查文件范围、敏感信息、测试与证据，提交已验收版本；提交本身不部署。
2. 经用户授权，在主 checkout 合并该分支。核对 `HEAD`、索引和工作树；在主分支运行 lint、单元/组件测试、build、桌面与移动 E2E，确保无 skip/xfail。若测试会写入生产事件，按固定测试 session 先预检、经确认后清理并复查。
3. 输出测试、核心链路、UI、数据清理与风险结论。`git push origin main` 必须单独签退；推送前不修改远端分支。
4. 远端 `main` 与已验收代码一致后，连接 Vercel 项目与 GitHub 仓库，确认 Production Branch 是 `main`，并确认该项目的自动部署未被关闭。首次连接可能触发部署，按生产发布处理。
5. 在 Vercel 部署详情核对来源是 Git、仓库/分支/提交哈希与远端 `main` 一致、部署状态 `READY`，稳定域名指向该部署。随后检查 `/api/e?health=1`、安全头、桌面与移动真实入口 E2E、浏览器错误及测试事件清理。任何一项失败都不得称为自动发布链路已完成。

## 后续日常发布

功能分支提交并通过本地/CI 验证 → 经授权合并至 `main` → 主分支验证与独立 push 签退 → 推送 `main` → Vercel Git 集成自动构建、部署 → 核对提交哈希和生产复验。分支推送只产生预览，不应更新稳定生产域名。不要用本地 Git hook、Deploy Hook 或直接 CLI 发布替代仓库提交与推送。

若自动部署失败，保留失败部署与日志，先查根因；必要时只有获得明确应急发布授权，才可使用固定版本的 Vercel CLI 临时恢复，并立即补齐 Git 提交与线上版本对账。不得把 CLI 应急发布记作 Git 自动部署通过。
