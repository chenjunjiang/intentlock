import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

describe('IntentLock main flow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
  })

  it('shows semantic risks for the example rewrite', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Check meaning' }))
    expect(screen.getByRole('heading', { name: /possible meaning changes/i })).toBeInTheDocument()
    expect(screen.getByText('Permission reversal')).toBeInTheDocument()
  })

  it('runs a minimal fix without changing protected terms', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Minimal grammar fix' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fix without meaning drift' }))
    expect(screen.getByRole('heading', { name: 'No protected meaning changes found' })).toBeInTheDocument()
  })
})
