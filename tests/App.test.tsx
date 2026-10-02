import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'

describe('IntentLock main flow', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204, headers: { 'x-intentlock-storage': 'stored' } })))
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('sends normalized channel and internal marker on visit', async () => {
    window.history.replaceState({}, '', '/?il_internal=1&utm_source=reddit&utm_campaign=private')
    render(<App />)

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls
      const visitCall = calls.find(([, options]) => JSON.parse(String(options?.body)).eventName === 'visit')
      expect(visitCall).toBeDefined()
      expect(JSON.parse(String(visitCall?.[1]?.body)).metadata).toEqual({ channel: 'reddit', internal: true })
      expect(visitCall?.[1]?.referrerPolicy).toBe('no-referrer')
    })
    expect(localStorage.getItem('intentlock_internal')).toBe('1')
    expect(window.location.search).toBe('?utm_source=reddit&utm_campaign=private')
  })

  it('keeps local checking available when visit telemetry fails', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Check meaning' }))
    expect(screen.getByRole('heading', { name: /possible meaning changes/i })).toBeInTheDocument()
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

  it('records one first edit and only aggregate check classifications', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Original English text'), { target: { value: 'Alice pays Bob.' } })
    fireEvent.change(screen.getByLabelText('AI rewritten English text'), { target: { value: 'Bob pays Alice.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check meaning' }))

    expect(screen.getByRole('heading', { name: 'Wording changes need review' })).toBeInTheDocument()
    await waitFor(() => {
      const events = vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(String(options?.body)))
      expect(events.filter((event) => event.eventName === 'input_edited')).toHaveLength(1)
      const check = events.find((event) => event.eventName === 'analysis_completed')
      expect(check?.metadata).toMatchObject({ inputKind: 'custom', resultState: 'review' })
      expect(JSON.stringify(events)).not.toContain('Alice pays Bob')
      expect(JSON.stringify(events)).not.toContain('Bob pays Alice')
    })
  })

  it('clears a previous green result when the writing or mode changes', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Minimal grammar fix' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fix without meaning drift' }))
    expect(screen.getByRole('heading', { name: 'No unexplained meaning changes found' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Original English text'), { target: { value: 'New wording.' } })
    expect(screen.queryByRole('heading', { name: 'No unexplained meaning changes found' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fix without meaning drift' }))
    expect(screen.getByRole('heading', { name: 'No unexplained meaning changes found' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check an AI rewrite' }))
    expect(screen.queryByRole('heading', { name: 'No unexplained meaning changes found' })).not.toBeInTheDocument()
  })

  it('waits for confirmed storage before thanking the user', async () => {
    let confirmStorage: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body)) as { eventName: string }
      if (body.eventName === 'pricing_interest') {
        return new Promise<Response>((resolve) => { confirmStorage = resolve })
      }
      return Promise.resolve(new Response(null, { status: 204, headers: { 'x-intentlock-storage': 'stored' } }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const checkButton = screen.getByRole('button', { name: 'Check meaning' })
    fireEvent.click(checkButton)
    fireEvent.click(checkButton)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, if it works' }))

    expect(screen.getByText('Saving your answer…')).toBeInTheDocument()
    expect(screen.queryByText('Thanks—your answer was recorded.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes, if it works' })).toBeDisabled()
    expect(checkButton).toBeEnabled()

    confirmStorage?.(new Response(null, { status: 204, headers: { 'x-intentlock-storage': 'stored' } }))
    expect(await screen.findByText('Thanks—your answer was recorded.')).toBeInTheDocument()
  })

  it.each(['degraded', 'rate-limited', 'network-error'])('allows retry after %s feedback failure', async (failure) => {
    let attempts = 0
    const fetchMock = vi.fn((_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body)) as { eventName: string }
      if (body.eventName !== 'pricing_interest') {
        return Promise.resolve(new Response(null, { status: 204, headers: { 'x-intentlock-storage': 'stored' } }))
      }
      attempts += 1
      if (attempts === 1 && failure === 'network-error') return Promise.reject(new Error('offline'))
      return Promise.resolve(new Response(null, {
        status: 204,
        headers: { 'x-intentlock-storage': attempts === 1 ? failure : 'stored' },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)
    const checkButton = screen.getByRole('button', { name: 'Check meaning' })
    fireEvent.click(checkButton)
    fireEvent.click(checkButton)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, if it works' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Your answer was not saved. Please try again.')
    expect(screen.queryByText('Thanks—your answer was recorded.')).not.toBeInTheDocument()
    expect(checkButton).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, if it works' }))

    await waitFor(() => expect(screen.getByText('Thanks—your answer was recorded.')).toBeInTheDocument())
    expect(attempts).toBe(2)
  })
})
