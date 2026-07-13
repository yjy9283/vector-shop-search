import { useState } from 'react'
import './App.css'

const MODES = [
  { key: 'vector', label: '벡터 검색' },
  { key: 'hybrid', label: '하이브리드' },
  { key: 'bm25', label: 'BM25' },
]

const ENDPOINTS = {
  vector: '/api/search',
  hybrid: '/api/search/hybrid',
  bm25: '/api/search/bm25',
}

function SkeletonGrid({ count = 8 }) {
  return (
    <div className="grid">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-thumb" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
      ))}
    </div>
  )
}

function MallPriceList({ productId }) {
  const [prices, setPrices] = useState(null) // null = 아직 안 불러옴
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (prices !== null) return // 이미 불러온 경우 재요청 안 함
    setLoading(true)
    try {
      const res = await fetch(`/api/products/${productId}/prices`)
      const data = res.ok ? await res.json() : []
      setPrices(data)
    } catch {
      setPrices([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <details className="price-compare" onToggle={(e) => e.target.open && load()}>
      <summary className="price-compare-toggle">쇼핑몰 가격비교</summary>
      <div className="price-compare-body">
        {loading && <div className="price-compare-empty">불러오는 중...</div>}
        {!loading && prices && prices.length === 0 && (
          <div className="price-compare-empty">비교 가능한 쇼핑몰 정보가 아직 없어요</div>
        )}
        {!loading &&
          prices &&
          prices.map((p, i) => (
            <div className="price-compare-row" key={i}>
              <span className="mall-name">
                {p.mallName}
                {p.isLowest && <span className="mall-lowest-badge">최저</span>}
              </span>
              <span className="mall-price">
                {p.price.toLocaleString()}원{p.freeShipping && <span className="mall-free">무료배송</span>}
              </span>
            </div>
          ))}
      </div>
    </details>
  )
}

function ResultCard({ item, maxScore }) {
  const pct = Math.round((item.score / maxScore) * 100)
  return (
    <div className="card">
      <div className="card-thumb-wrap">
        {item.imageUrl && <img className="card-thumb" src={item.imageUrl} alt={item.name} />}
        <div className="match-badge" style={{ '--pct': pct }}>
          <div className="match-badge-inner">{pct}%</div>
        </div>
      </div>
      <div className="card-body">
        <div className="card-category">{item.category}</div>
        <div className="card-name">{item.name}</div>
        <div className="card-price">
          <span className="lowest-label">최저</span> {item.price?.toLocaleString()}
          <span className="won">원</span>
        </div>
        <MallPriceList productId={item.productId} />
      </div>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('vector')
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('')

  const handleSearch = async () => {
    if (!query.trim()) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch(`${ENDPOINTS[mode]}?q=${encodeURIComponent(query)}&topK=12`)
      if (!res.ok) throw new Error(`검색 서버 응답 오류 (status: ${res.status})`)
      const data = await res.json()
      setResults(data)
      setStatus('done')
    } catch (err) {
      console.error('검색 실패:', err)
      setErrorMsg(err.message || '검색 서버에 연결할 수 없어요. 백엔드가 켜져 있는지 확인해주세요.')
      setStatus('error')
    }
  }

  const maxScore = results.length > 0 ? Math.max(...results.map((r) => r.score)) : 1

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            VSS<span className="logo-dot">.</span>
          </div>
          <div className="search-bar">
            <input
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="나이키 운동화, 여름 원피스처럼 검색해보세요"
            />
            <button className="search-button" onClick={handleSearch} disabled={status === 'loading'}>
              {status === 'loading' ? '검색 중' : '검색'}
            </button>
          </div>
        </div>
      </header>

      <nav className="mode-tabs">
        {MODES.map((m) => (
          <button
            key={m.key}
            className={`mode-tab ${mode === m.key ? 'active' : ''}`}
            onClick={() => setMode(m.key)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <main className="main">
        {status === 'done' && results.length > 0 && (
          <div className="result-count">
            "{query}" 검색 결과 <b>{results.length}</b>건 · 배지 숫자는 최고 결과 대비 상대 유사도
          </div>
        )}

        {status === 'idle' && (
          <div className="state-panel">
            <div className="state-title">검색어를 입력해보세요</div>
            <div className="state-desc">벡터 검색 / 하이브리드 / BM25 결과를 바로 비교할 수 있어요</div>
          </div>
        )}

        {status === 'loading' && <SkeletonGrid />}

        {status === 'error' && (
          <div className="state-panel error">
            <div className="state-title">검색을 완료하지 못했어요</div>
            <div className="state-desc">{errorMsg}</div>
          </div>
        )}

        {status === 'done' && results.length === 0 && (
          <div className="state-panel">
            <div className="state-title">"{query}"에 대한 결과가 없어요</div>
            <div className="state-desc">다른 검색어나 다른 모드로 시도해보세요</div>
          </div>
        )}

        {status === 'done' && results.length > 0 && (
          <div className="grid">
            {results.map((r) => (
              <ResultCard key={r.productId} item={r} maxScore={maxScore} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
