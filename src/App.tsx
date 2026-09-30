import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { compareLocks, conservativeRewrite, wordDiff, type Risk } from './lib/intent-lock'
import { getVisitAttribution } from './lib/attribution'
import './App.css'

type Mode = 'compare' | 'fix'
type IconName = 'alert' | 'arrow' | 'check' | 'copy' | 'lock' | 'reset' | 'shield' | 'sparkles'

const SAMPLE_SOURCE = 'Priya may approves up to $5,000 after Monday, but Sam must not promises it.'
const SAMPLE_REWRITE = 'Priya will approve $5,000 on Monday, and Sam can promise it.'

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    copy: <><rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>,
    lock: <><rect width="18" height="12" x="3" y="10" rx="2" /><path d="M7 10V7a5 5 0 0 1 10 0v3" /></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    shield: <><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
    sparkles: <><path d="m12 3-1.3 3.4a2 2 0 0 1-1.1 1.1L6 9l3.6 1.5a2 2 0 0 1 1.1 1.1L12 15l1.3-3.4a2 2 0 0 1 1.1-1.1L18 9l-3.6-1.5a2 2 0 0 1-1.1-1.1Z" /><path d="M5 3v4M3 5h4M19 17v4M17 19h4" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function getLengthBucket(length: number) {
  if (length < 100) return 'short'
  if (length < 500) return 'medium'
  return 'long'
}

function getOrCreateSessionId() {
  let id = localStorage.getItem('intentlock_session')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('intentlock_session', id)
  }
  return id
}

function getStoredUsageCount() {
  const count = Number(localStorage.getItem('intentlock_usage') ?? '0')
  return Number.isFinite(count) ? count : 0
}

export default function App() {
  const [source, setSource] = useState(SAMPLE_SOURCE)
  const [rewrite, setRewrite] = useState(SAMPLE_REWRITE)
  const [mode, setMode] = useState<Mode>('compare')
  const [analysis, setAnalysis] = useState<ReturnType<typeof compareLocks> | null>(null)
  const [checkedOutput, setCheckedOutput] = useState('')
  const [usageCount, setUsageCount] = useState(getStoredUsageCount)
  const [sessionId] = useState(getOrCreateSessionId)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)
  const [interest, setInterest] = useState<'yes' | 'not-yet' | null>(null)
  const [interestStatus, setInterestStatus] = useState<'idle' | 'saving' | 'error'>('idle')

  useEffect(() => {
    const visit = getVisitAttribution(window.location.href, document.referrer, localStorage.getItem('intentlock_internal') === '1')
    localStorage.setItem('intentlock_internal', visit.internal ? '1' : '0')
    if (visit.cleanUrl !== null) window.history.replaceState(window.history.state, '', visit.cleanUrl)
    void postEvent('visit', { channel: visit.channel, internal: visit.internal }, sessionId)
  }, [sessionId])

  async function postEvent(eventName: string, metadata: Record<string, unknown> = {}, id = sessionId) {
    if (!id) return false
    try {
      const response = await fetch('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventName, sessionId: id, metadata }),
        keepalive: true,
        referrerPolicy: 'no-referrer',
      })
      return response.status === 204 && response.headers.get('x-intentlock-storage') === 'stored'
    } catch {
      return false
    }
  }

  function runCheck() {
    setNotice('')
    setCopied(false)
    if (!source.trim()) {
      setNotice('Paste the original text first.')
      return
    }
    const output = mode === 'fix' ? conservativeRewrite(source) : rewrite.trim()
    if (!output) {
      setNotice('Paste the AI rewrite you want to check.')
      return
    }

    const result = compareLocks(source, output)
    const nextCount = usageCount + 1
    setCheckedOutput(output)
    setAnalysis(result)
    setUsageCount(nextCount)
    localStorage.setItem('intentlock_usage', String(nextCount))
    void postEvent('analysis_completed', {
      mode,
      riskCount: result.risks.length,
      reviewCount: result.reviews.length,
      lockCount: result.locks.length,
      lengthBucket: getLengthBucket(source.length),
    })
    if (nextCount === 2) void postEvent('repeat_use', { checks: nextCount })
  }

  function resetDemo() {
    setSource(SAMPLE_SOURCE)
    setRewrite(SAMPLE_REWRITE)
    setAnalysis(null)
    setCheckedOutput('')
    setNotice('')
  }

  async function copyResult() {
    await navigator.clipboard.writeText(checkedOutput)
    setCopied(true)
    void postEvent('result_copied', { mode })
  }

  async function recordInterest(answer: 'yes' | 'not-yet') {
    if (interestStatus === 'saving' || interest) return
    setInterestStatus('saving')
    const stored = await postEvent('pricing_interest', { answer, proposedMonthlyPriceUsd: 4 })
    if (stored) {
      setInterest(answer)
      setInterestStatus('idle')
    } else {
      setInterestStatus('error')
    }
  }

  const diff = useMemo(() => analysis ? wordDiff(source, checkedOutput) : [], [analysis, source, checkedOutput])
  const resultState = analysis?.risks.length ? 'danger' : analysis?.reviews.length ? 'review' : 'safe'

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#workspace" aria-label="IntentLock home">
          <span className="brand-mark"><Icon name="lock" size={18} /></span>
          <span>IntentLock</span>
          <span className="beta">Free beta</span>
        </a>
        <div className="privacy-note"><span /> Your text stays in this browser</div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">SEMANTIC SAFETY CHECK</p>
          <h1>Did AI improve your writing—or change what you meant?</h1>
        </div>
        <p>Compare the original with any AI rewrite. IntentLock flags changed names, numbers, dates, negation, and commitment strength before you send it.</p>
      </section>

      <section className="workspace" id="workspace" aria-label="Semantic safety checker">
        <div className="toolbar">
          <div className="mode-group" role="group" aria-label="Check mode">
            <button type="button" className={mode === 'compare' ? 'mode active' : 'mode'} onClick={() => setMode('compare')}>Check an AI rewrite</button>
            <button type="button" className={mode === 'fix' ? 'mode active' : 'mode'} onClick={() => setMode('fix')}>Minimal grammar fix</button>
          </div>
          <div className="free-count"><span>Free</span> during beta · {usageCount} checks on this device</div>
        </div>

        <div className={mode === 'compare' ? 'editor-grid' : 'editor-grid single-mode'}>
          <article className="editor-panel">
            <div className="panel-label"><span>1</span> Original</div>
            <label className="sr-only" htmlFor="source">Original English text</label>
            <textarea id="source" value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} maxLength={5000} />
            <small>{source.length} / 5,000</small>
          </article>

          {mode === 'compare' && (
            <article className="editor-panel">
              <div className="panel-label"><span>2</span> AI rewrite</div>
              <label className="sr-only" htmlFor="rewrite">AI rewritten English text</label>
              <textarea id="rewrite" value={rewrite} onChange={(event) => setRewrite(event.target.value)} spellCheck={false} maxLength={5000} />
              <small>{rewrite.length} / 5,000</small>
            </article>
          )}
        </div>

        <div className="actionbar">
          <button type="button" className="text-button" onClick={resetDemo}><Icon name="reset" size={15} /> Reset example</button>
          <div className="action-copy">
            {notice && <p role="alert">{notice}</p>}
            <button type="button" className="primary" onClick={runCheck}>
              {mode === 'compare' ? 'Check meaning' : 'Fix without meaning drift'}<Icon name="arrow" />
            </button>
          </div>
        </div>
      </section>

      {analysis && (
        <section className="results" aria-live="polite">
          <div className="result-heading">
            <div>
              <p className="eyebrow">RESULT</p>
              <h2>{resultState === 'danger'
                ? `${analysis.risks.length} possible meaning changes`
                : resultState === 'review'
                  ? 'Wording changes need review'
                  : 'No unexplained meaning changes found'}</h2>
            </div>
            <span className={`result-status ${resultState}`}>
              <Icon name={resultState === 'danger' ? 'shield' : resultState === 'review' ? 'alert' : 'check'} size={17} />
              {resultState === 'danger' ? 'Review before sending' : resultState === 'review' ? 'Check the wording' : 'No unexplained changes'}
            </span>
          </div>

          <div className="result-grid">
            <article className="result-card">
              <div className="card-title"><Icon name="sparkles" /><h3>What changed</h3></div>
              <div className="diff" aria-label="Word-level differences">
                {diff.map((part, index) => <span key={`${part.type}-${index}`} className={`diff-${part.type}`}>{part.text}</span>)}
              </div>
              <button type="button" className="copy-button" onClick={() => void copyResult()}><Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy checked text'}</button>
            </article>

            <article className="result-card">
              <div className="card-title"><Icon name="lock" /><h3>Protected meaning</h3><span>{analysis.locks.length}</span></div>
              <div className="lock-list">
                {analysis.locks.length ? analysis.locks.map((lock) => (
                  <div className="lock-chip" key={`${lock.type}-${lock.value}`}>
                    <span>{lock.icon}</span><div><small>{lock.type}</small><strong>{lock.value}</strong></div>
                  </div>
                )) : <span className="empty-lock">No protected-term risk</span>}
              </div>
            </article>
          </div>

          <div className="risk-list">
            {analysis.risks.length ? analysis.risks.map((risk: Risk, index: number) => (
              <article className="risk-card" key={`${risk.category}-${index}`}>
                <div><span>{risk.category}</span><strong>{risk.severity} risk</strong></div>
                <h3>Original: “{risk.original}”</h3>
                <p>{risk.explanation}</p>
              </article>
            )) : analysis.reviews.length ? analysis.reviews.map((review, index) => (
              <article className="review-card" key={`${review.category}-${index}`}>
                <Icon name="alert" size={22} />
                <div>
                  <strong>Important wording changed</strong>
                  <p>{review.explanation} Review the highlighted wording before sending.</p>
                  <small>
                    {review.removed.length > 0 && <>Removed: “{review.removed.join(', ')}”</>}
                    {review.removed.length > 0 && review.added.length > 0 && ' · '}
                    {review.added.length > 0 && <>Added: “{review.added.join(', ')}”</>}
                  </small>
                </div>
              </article>
            )) : (
              <article className="clear-card"><Icon name="check" size={22} /><div><strong>No unexplained material changes found.</strong><p>Protected terms match and remaining edits are recognized. This focused check is not a guarantee that every nuance is unchanged.</p></div></article>
            )}
          </div>
        </section>
      )}

      {usageCount >= 2 && (
        <section className="interest-card" id="interest">
          <div>
            <p className="eyebrow">ONE-CLICK RESEARCH QUESTION</p>
            <h2>If IntentLock added deeper sentence-level checks, would $4/month feel reasonable?</h2>
            <p>The beta stays free. This answer only helps decide whether to keep building.</p>
          </div>
          {interest ? (
            <div className="interest-thanks"><Icon name="check" /> Thanks—your answer was recorded.</div>
          ) : (
            <div className="interest-response">
              <div className="interest-actions">
                <button type="button" disabled={interestStatus === 'saving'} onClick={() => void recordInterest('yes')}>Yes, if it works</button>
                <button type="button" disabled={interestStatus === 'saving'} onClick={() => void recordInterest('not-yet')}>Not yet</button>
              </div>
              {interestStatus === 'saving' && <p role="status">Saving your answer…</p>}
              {interestStatus === 'error' && <p role="alert">Your answer was not saved. Please try again.</p>}
            </div>
          )}
        </section>
      )}

      <footer>
        <span>IntentLock free beta · Browser-side semantic checks</span>
        <span>We record anonymous product events, never your writing.</span>
      </footer>
    </main>
  )
}
