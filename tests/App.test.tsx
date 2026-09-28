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
    expect(screen.getByRole('heading', { name: 'No unexplained meaning changes found' })).toBeInTheDocument()
  })

  it('shows an honest review state for unexplained wording changes', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Original English text'), {
      target: { value: 'The system was partially effective.' },
    })
    fireEvent.change(screen.getByLabelText('AI rewritten English text'), {
      target: { value: 'The system was somewhat efficient.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Check meaning' }))

    expect(screen.getByRole('heading', { name: 'Wording changes need review' })).toBeInTheDocument()
    expect(screen.getByText('Check the wording')).toBeInTheDocument()
    expect(screen.getByText('Important wording changed')).toBeInTheDocument()
    expect(screen.getByText('No protected-term risk')).toBeInTheDocument()
  })
})
