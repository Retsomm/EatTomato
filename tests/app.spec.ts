import { test, expect, Page } from '@playwright/test'

// 在每個測試頁面注入 mock electronAPI，模擬 Electron IPC 行為
const mockElectronAPI = async (page: Page) => {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    let todos: { id: number; title: string; pomodoroCount: number; totalMinutes: number; completed: boolean; createdAt: string }[] = []

    w.electronAPI = {
      shrinkToggle: async () => false,
      togglePin: async () => false,
      showNotification: async () => undefined,
      onUpdateStatus: () => undefined,
      todo: {
        getAll: async () => todos,
        create: async (title: string) => {
          const todo = { id: Date.now(), title, pomodoroCount: 0, totalMinutes: 0, completed: false, createdAt: new Date().toISOString() }
          todos.push(todo)
          return todo
        },
        addPomodoro: async (id: number, minutes: number) => {
          const todo = todos.find(t => t.id === id)
          if (!todo) return null
          todo.pomodoroCount++
          todo.totalMinutes += minutes
          return todo
        },
        toggleComplete: async (id: number) => {
          const todo = todos.find(t => t.id === id)
          if (!todo) return null
          todo.completed = !todo.completed
          return todo
        },
        delete: async (id: number) => {
          todos = todos.filter(t => t.id !== id)
        },
      },
    }
  })
}

test.describe('EatTomato 跨平台 UI 測試', () => {
  test.beforeEach(async ({ page }) => {
    await mockElectronAPI(page)
    await page.goto('/')
  })

  test('頁面正常載入，顯示三個模式切換按鈕', async ({ page }) => {
    await expect(page.locator('button', { hasText: '時鐘' })).toBeVisible()
    await expect(page.locator('button', { hasText: '番茄鐘' })).toBeVisible()
    await expect(page.locator('button', { hasText: '計時器' })).toBeVisible()
  })

  test('預設顯示時鐘模式', async ({ page }) => {
    const clockBtn = page.locator('button', { hasText: '時鐘' })
    await expect(clockBtn).toHaveClass(/bg-red-500/)
  })

  test('可切換到番茄鐘模式', async ({ page }) => {
    await page.locator('button', { hasText: '番茄鐘' }).click()
    await expect(page.locator('button', { hasText: '番茄鐘' })).toHaveClass(/bg-red-500/)
    await expect(page.locator('button', { hasText: '開始' })).toBeVisible()
  })

  test('可切換到計時器模式', async ({ page }) => {
    await page.locator('button', { hasText: '計時器' }).click()
    await expect(page.locator('button', { hasText: '計時器' })).toHaveClass(/bg-red-500/)
    await expect(page.locator('button', { hasText: '設定' })).toBeVisible()
  })

  test('深色模式切換可正常運作', async ({ page }) => {
    const darkBtn = page.locator('button', { hasText: /[●○]/ })
    await expect(darkBtn).toBeVisible()

    const darkBefore = await page.locator('html').evaluate(el => el.classList.contains('dark'))
    await darkBtn.click()
    const darkAfter = await page.locator('html').evaluate(el => el.classList.contains('dark'))
    expect(darkAfter).toBe(!darkBefore)
  })

  test('番茄鐘：開始 / 暫停按鈕正常運作', async ({ page }) => {
    await page.locator('button', { hasText: '番茄鐘' }).click()
    await page.locator('button', { hasText: '開始' }).click()
    await expect(page.locator('button', { hasText: '暫停' })).toBeVisible()

    await page.locator('button', { hasText: '暫停' }).click()
    await expect(page.locator('button', { hasText: '開始' })).toBeVisible()
  })

  test('番茄鐘：重置按鈕正常運作', async ({ page }) => {
    await page.locator('button', { hasText: '番茄鐘' }).click()
    await page.locator('button', { hasText: '開始' }).click()
    await page.locator('button', { hasText: '重置' }).click()
    await expect(page.locator('button', { hasText: '開始' })).toBeVisible()
  })

  test('計時器：設定 1 分鐘並開始', async ({ page }) => {
    await page.locator('button', { hasText: '計時器' }).click()

    const inputs = page.locator('input[type="number"]')
    await inputs.nth(0).fill('1')
    await inputs.nth(1).fill('0')
    await page.locator('button', { hasText: '設定' }).click()
    await expect(page.locator('text=01:00')).toBeVisible()

    await page.locator('button', { hasText: '開始' }).click()
    await expect(page.locator('button', { hasText: '暫停' })).toBeVisible()
  })

  test('待辦清單：新增待辦項目', async ({ page }) => {
    await page.locator('button', { hasText: '番茄鐘' }).click()

    const input = page.locator('input[placeholder="新增待辦項目..."]')
    await input.fill('測試待辦項目')
    await input.press('Enter')
    await expect(page.locator('span.truncate', { hasText: '測試待辦項目' }).first()).toBeVisible()
  })

  test('待辦清單：刪除待辦項目', async ({ page }) => {
    await page.locator('button', { hasText: '番茄鐘' }).click()

    const input = page.locator('input[placeholder="新增待辦項目..."]')
    await input.fill('要刪除的項目')
    await input.press('Enter')
    const todoSpan = page.locator('span.truncate', { hasText: '要刪除的項目' }).first()
    await expect(todoSpan).toBeVisible()

    // 點擊垃圾桶圖示刪除（刪除按鈕包含 SVG path，用 p-0.5 class 定位）
    const deleteBtn = page.locator('.p-0\\.5').first()
    await deleteBtn.click()
    await expect(page.locator('span.truncate', { hasText: '要刪除的項目' })).toHaveCount(0)
  })

  test('番茄鐘：工作時間設定可修改', async ({ page }) => {
    await page.locator('button', { hasText: '番茄鐘' }).click()

    // 修改工作時間為 30 分鐘
    const workInput = page.locator('input[type="number"]').first()
    await workInput.fill('30')
    await workInput.blur()

    // 倒數應更新為 30:00
    await expect(page.locator('text=30:00')).toBeVisible()
  })
})
