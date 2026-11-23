import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'
import { VersionService } from '../src/index.js'

test('package.json and cordis.patch.yml alignment', () => {
  const pkgPath = path.resolve('package.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

  assert.equal(pkg.name, 'dsh-version-status')
  assert.equal(pkg.type, 'module')
  assert.ok(pkg.exports['.'])
  assert.ok(pkg.exports['./client'])
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh?.client?.platform, 'web')

  const patchContent = fs.readFileSync(path.resolve('cordis.patch.yml'), 'utf8')
  assert.ok(patchContent.includes('dsh-version-status'))
})

test('client bundle syntax and module structure', () => {
  const clientCode = fs.readFileSync(path.resolve('src/client.js'), 'utf8')
  
  let registeredModule = null
  const fakeWindow = {
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    __ModuleLoader__: {
      load: (mod) => {
        registeredModule = mod
      }
    }
  }

  const context = vm.createContext({
    window: fakeWindow,
    console
  })

  vm.runInContext(clientCode, context)
  assert.ok(registeredModule, 'Client must call window.__ModuleLoader__.load')
  assert.equal(registeredModule.id, 'dsh-version-status')
  assert.equal(typeof registeredModule.factory, 'function')
})

test('sidebar trigger ships a 220ms delayed hover preview', () => {
  const clientCode = fs.readFileSync(path.resolve('src/client.js'), 'utf8')

  // 220ms 延时弹出，不是即时显示：与 dsh-link-pulse / dsh-cpa-status 的悬停卡片一致。
  assert.match(clientCode, /HOVER_PREVIEW_DELAY\s*=\s*220/)
  assert.match(clientCode, /setTimeout\(\(\)\s*=>\s*\{[\s\S]*?\},\s*HOVER_PREVIEW_DELAY\)/)

  // 进入 / 离开成对挂到触发器与其包裹层上。
  assert.match(clientCode, /onMouseEnter:\s*onTriggerEnter/)
  assert.match(clientCode, /onMouseLeave:\s*onTriggerLeave/)

  // 主面板已打开时两种触发器都不渲染悬停卡片，避免与面板重叠。
  assert.match(clientCode, /if \(!hovering \|\| state\.open\) return pill/)
  assert.match(clientCode, /if \(!hovering \|\| state\.open\) return railButton/)

  // 展开态沿用参考实现的绝对定位；折叠 rail 先测量再用 fixed 定位，避免被侧栏 overflow 裁切。
  assert.match(clientCode, /bottom:\s*'calc\(100% \+ 6px\)'/)
  assert.match(clientCode, /getBoundingClientRect/)
  assert.match(clientCode, /width:\s*HOVER_PREVIEW_WIDTH/)

  // 卡片内容取自 store 已有字段。
  assert.match(clientCode, /formatTime\(st\.checkedAt\)/)
})

test('VersionService response contract against README specification', async () => {
  const service = new VersionService()
  const res = await service.getStatus({
    channel: 'latest',
    mockLatest: '0.1.4',
    mockAlpha: '0.1.5-alpha.1'
  })

  // Check required fields documented in README
  assert.equal(res.ok, true)
  assert.ok(typeof res.currentVersion === 'string')
  assert.equal(res.channel, 'latest')
  assert.equal(res.latestVersion, '0.1.4')
  assert.ok(res.nextVersion)
  assert.equal(res.alphaVersion, '0.1.5-alpha.1')
  assert.ok(res.channels.latest)
  assert.ok(res.channels.next)
  assert.ok(res.channels.alpha)
  assert.ok(res.upgradeCommand)
  assert.ok(res.upgradeCommands.npm)
  assert.ok(res.upgradeCommands.pnpm)
  assert.ok(res.upgradeCommands.yarn)
  assert.ok(res.releaseUrl)
  assert.ok(res.sources)
})
