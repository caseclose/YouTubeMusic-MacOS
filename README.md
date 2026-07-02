# YouTube Music for Mac

**原生体验的 macOS 桌面客户端**

<p align="center">完整网页功能 · 系统集成 · 开源自用</p>

<p align="center">
  <a href="https://github.com/caseclose">
    <img src="https://img.shields.io/badge/设计_&_开发-Feng_Wang-181717?style=for-the-badge&logo=github&logoColor=white" alt="设计 & 开发" />
  </a>
  <a href="mailto:fengw2002@gmail.com">
    <img src="https://img.shields.io/badge/Gmail-fengw2002%40gmail.com-EA4335?style=for-the-badge&logo=gmail&logoColor=white" alt="Gmail" />
  </a>
  <a href="mailto:fengwang@stu.pku.edu.cn">
    <img src="https://img.shields.io/badge/北大邮箱-fengwang%40stu.pku.edu.cn-8B0000?style=for-the-badge&logo=telegram&logoColor=white" alt="北大邮箱" />
  </a>
</p>

<p align="center">WebView 壳 · 媒体键 · 菜单栏托盘 · 迷你播放器</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" />
  <img src="https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/macOS-11%2B-000000?logo=apple&logoColor=white" alt="macOS" />
</p>

---

## 为什么选择这个项目？

| | |
|:---:|:---:|
| 🎵 **完整网页体验** | 加载 [music.youtube.com](https://music.youtube.com)，搜索、播放列表、歌词、登录等功能与浏览器一致 |
| 🖥️ **macOS 原生集成** | 菜单栏托盘、全局快捷键、控制中心 Now Playing、无边框窗口拖拽 |
| 🎧 **媒体控制** | 键盘媒体键、托盘菜单播放控制、迷你播放器窗口 |
| 🔐 **会话持久化** | Google 登录状态本地保存，重启后保持登录 |
| 📦 **轻量可构建** | Electron + TypeScript，一键打包 `.dmg` 安装包 |

---

## 功能清单

| 类别 | 功能 |
|------|------|
| 播放 | 完整 YouTube Music 网页播放、歌词、队列 |
| 登录 | Google 账号登录，OAuth 弹窗，会话持久化 |
| 系统集成 | 媒体键、控制中心 / 锁屏 Now Playing（Media Session API） |
| 窗口 | 无边框标题栏、顶部拖拽区域、关闭后保留在托盘 |
| 托盘 | 播放 / 暂停 / 上一首 / 下一首、显示主窗口、退出 |
| 快捷键 | `Cmd+Shift+M` 切换主窗口，`Cmd+Shift+P` 迷你播放器，`Cmd+L` 登录 |
| 打包 | electron-builder 生成 macOS `.dmg` |

---

## 快速开始

### 开发

```bash
git clone https://github.com/caseclose/YouTubeMusic-MacOS.git
cd YouTubeMusic-MacOS
npm install
npm run dev
```

开启 DevTools（可选）：

```bash
YTM_DEVTOOLS=1 npm run dev
```

### 构建安装包

```bash
npm run build        # 编译
npm run dist:mac     # 打包 macOS 安装程序 → release/
```

安装到应用程序文件夹：

```bash
cp -R "release/mac-arm64/YouTube Music.app" /Applications/
xattr -cr "/Applications/YouTube Music.app"
```

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| 媒体键 播放/暂停 | 播放 / 暂停 |
| 媒体键 下一首 | 下一首 |
| 媒体键 上一首 | 上一首 |
| `Cmd+Shift+M` | 显示 / 隐藏主窗口 |
| `Cmd+Shift+P` | 切换迷你播放器 |
| `Cmd+L` | 打开登录页 |

---

## 技术栈

```
Electron 33  +  electron-vite  +  TypeScript  +  electron-builder
        ↓
WebView (music.youtube.com)  +  注入脚本桥接  +  electron-store
```

| 模块 | 用途 |
|------|------|
| [Electron](https://www.electronjs.org/) | 桌面壳、窗口管理、托盘、全局快捷键 |
| [electron-vite](https://electron-vite.org/) | 主进程 / 预加载脚本构建 |
| [electron-store](https://github.com/sindresorhus/electron-store) | 快捷键等配置持久化 |
| Media Session API | 控制中心 Now Playing、媒体键回调 |

---

## 常见问题

### 首次打开提示「已损坏，无法打开」

未签名应用可能被 macOS 拦截，可执行：

```bash
xattr -cr /Applications/YouTube\ Music.app
```

或右键应用 → **打开**。

### Google 登录失败

1. 关闭 VPN / 代理后重试
2. 菜单栏 **账户 → 清除登录缓存并重启**
3. 使用 **账户 → 登录…**（`Cmd+L`）打开登录页

### 媒体键无响应

播放音频后，Media Session API 会注册到控制中心。若被 Apple Music 抢占，请在控制中心切换播放来源为 YouTube Music。

### 窗口无法拖动

按住窗口顶部左侧（交通灯按钮旁）或导航栏空白区域拖动。

---

## 免责声明

本应用为第三方 WebView 壳，与 Google / YouTube **无官方关联**。使用须遵守 [YouTube 服务条款](https://www.youtube.com/t/terms)。

---

## 许可证

MIT
