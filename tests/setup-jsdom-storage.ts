class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, String(value)) }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const globalRecord = globalThis as Record<string, unknown>
  const documentRecord = globalRecord.document as { defaultView?: Record<string, unknown> } | undefined
  const fromJsdom = documentRecord?.defaultView?.[name] as Storage | undefined
  const implementation = fromJsdom && typeof fromJsdom.clear === 'function'
    ? fromJsdom
    : new MemoryStorage()
  Object.defineProperty(globalThis, name, {
    value: implementation,
    configurable: true,
    writable: true,
  })
}
