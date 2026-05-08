# CCTools

基于 Manifest V3 的 Chromium 浏览器扩展：常用文本小工具 + 本地加密的 TOTP / 验证器（兼容 Google Authenticator 等方式）。

## 功能概览

### 工具箱

在弹出窗口的编辑区中粘贴或输入文本，一键处理：

| 功能 | 说明 |
|------|------|
| 格式化 / 压缩 | JSON 等文本格式化与压缩 |
| MD5 | 计算 MD5 |
| Base64 | 编码 / 解码 |
| URL | URL 编码相关 |
| 时间戳 | 时间与时间戳互转 |
| 随机密码 | 生成随机密码 |
| 获取 CSS | 从当前标签页提取样式相关能力（见 `getcss.js`） |
| 智能整理地址 | 调用阿里云 DashScope 接口整理地址文本（需网络；扩展已声明对应 `host_permissions`） |

### 验证器（TOTP）

- **本地保险箱**：密钥与帐号数据使用主密码经 PBKDF2 派生密钥，再以 AES-GCM 加密后存入 `chrome.storage.local`。
- **会话**：解锁后约 **1 天**内免重复输入主密码；可随时「退出保险箱」清除内存中的会话密钥。
- **主密码**：支持首次留空使用内置默认逻辑；可在「修改管理密码」中设置或更换新密码（至少 6 位）。
- **帐号管理**：支持 Base32 密钥、`otpauth://totp/...` 单链、以及 **`otpauth-migration://offline?data=...`** 批量迁移导入；列表按名称排序；**双击名称**可修改显示名称。
- **智能填充**：检测到当前页可能存在 OTP 输入框时，在选项卡上方显示智能填充条；根据**页面标题与域名**对帐号排序推荐，选择后可将当前 TOTP **填入页面**（含常见 Shadow DOM、拆分为多格的输入框等，逻辑见 `otp-dom-fill.js`）。

## 安装（开发者模式）

1. 克隆或下载本仓库。
2. 打开 Chrome（或 Edge 等 Chromium 浏览器）→ **扩展程序** → 开启「开发者模式」。
3. **加载已解压的扩展程序**，选择本项目根目录（包含 `manifest.json` 的文件夹）。

## 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 保存加密保险箱与扩展设置 |
| `activeTab` | 在当前标签执行「获取 CSS」、OTP 检测与填入等操作 |
| `scripting` | 向页面注入 OTP 检测与填充脚本 |
| `https://dashscope.aliyuncs.com/*` | 「智能整理地址」调用云端 API |

## 项目结构（主要文件）

```
manifest.json      # 扩展清单（MV3）
popup.html / popup.js   # 弹出窗口界面与逻辑
totp.js / totp-crypto.js   # TOTP 算法与保险箱加解密
otp-dom-fill.js    # 页面内 OTP 输入框检测与填充（content script）
content.js         # 与弹出窗口的消息通信等
getcss.js          # 获取 CSS 相关脚本
icons/             # 扩展图标
```

## 安全提示

- 主密码与解密后的密钥仅在本地使用；请勿在公共设备上长期保持解锁状态。
- 若代码或依赖被篡改，可能影响安全性；请尽量从可信来源获取本扩展。

## 作者

yasea（见 `manifest.json` 中的描述字段）。
