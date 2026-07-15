import { useEffect, useState } from 'react'
import './App.css'

const MODES = [
  { key: 'vector', label: '벡터', caption: '의미가 비슷한 상품을 찾아요' },
  { key: 'hybrid', label: '하이브리드', caption: '의미와 검색어를 함께 봐요' },
  { key: 'bm25', label: '키워드', caption: '검색어와 정확히 겹치는 상품을 찾아요' },
]

const ENDPOINTS = {
  vector: '/api/search',
  hybrid: '/api/search/hybrid',
  bm25: '/api/search/bm25',
}

const TOP_K = 100

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
  const [imgFailed, setImgFailed] = useState(false)
  const pct = Math.round((item.score / maxScore) * 100)
  const categoryLeaf = item.category?.split('>').pop()?.trim()
  // 다나와 원본 데이터 자체가 "이미지 없음" 자리표시 gif(noImg/noData)를 주는 경우가 많아서,
  // 그 상태도 실제 로딩 실패(onError)와 동일하게 우리 fallback 박스로 대체한다.
  const isPlaceholderUrl = /noimg|nodata/i.test(item.imageUrl || '')
  const showImage = item.imageUrl && !imgFailed && !isPlaceholderUrl

  return (
    <div className="card">
      <div className="card-thumb-wrap">
        {showImage ? (
          <img
            className="card-thumb"
            src={item.imageUrl}
            alt={item.name}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="card-thumb-fallback">
            <span>{categoryLeaf || '이미지 없음'}</span>
          </div>
        )}
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
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [mode, setMode] = useState('vector')
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('')

  const [categories, setCategories] = useState([])
  const [category, setCategory] = useState('')
  const [minPriceInput, setMinPriceInput] = useState('')
  const [maxPriceInput, setMaxPriceInput] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => (res.ok ? res.json() : []))
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  // 검색어를 제출한 뒤에는, 검색 모드 탭이나 필터를 바꾸는 즉시 같은 검색어로 재검색한다.
  // (모드 탭만 바꾸고 다시 "검색"을 눌러야 하는 건 혼란스러워서 자동 반영하도록 함)
  useEffect(() => {
    if (!submittedQuery) return
    let cancelled = false

    const run = async () => {
      setStatus('loading')
      setErrorMsg('')
      try {
        const params = new URLSearchParams({ q: submittedQuery, topK: String(TOP_K) })
        if (category) params.set('category', category)
        if (minPrice) params.set('minPrice', minPrice)
        if (maxPrice) params.set('maxPrice', maxPrice)

        const res = await fetch(`${ENDPOINTS[mode]}?${params.toString()}`)
        if (!res.ok) throw new Error(`검색 서버 응답 오류 (status: ${res.status})`)
        const data = await res.json()
        if (cancelled) return
        setResults(data)
        setStatus('done')
      } catch (err) {
        if (cancelled) return
        console.error('검색 실패:', err)
        setErrorMsg(err.message || '검색 서버에 연결할 수 없어요. 백엔드가 켜져 있는지 확인해주세요.')
        setStatus('error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery, mode, category, minPrice, maxPrice])

  const handleSearch = () => {
    if (!query.trim()) return
    setSubmittedQuery(query.trim())
  }

  const commitPriceFilter = () => {
    setMinPrice(minPriceInput)
    setMaxPrice(maxPriceInput)
  }

  const resetFilters = () => {
    setCategory('')
    setMinPriceInput('')
    setMaxPriceInput('')
    setMinPrice('')
    setMaxPrice('')
  }

  const hasActiveFilter = category || minPrice || maxPrice
  const maxScore = results.length > 0 ? Math.max(...results.map((r) => r.score)) : 1
  const activeMode = MODES.find((m) => m.key === mode)
  const activeModeIndex = MODES.findIndex((m) => m.key === mode)

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
              placeholder="무선청소기, 노트북 추천처럼 검색해보세요"
            />
            <button className="search-button" onClick={handleSearch} disabled={status === 'loading'}>
              {status === 'loading' ? '검색 중' : '검색'}
            </button>
          </div>
        </div>
      </header>

      <div className="mode-panel">
        <div className="mode-eyebrow">검색 엔진</div>
        <div className="mode-switch">
          <div
            className="mode-switch-indicator"
            style={{ transform: `translateX(${activeModeIndex * 100}%)` }}
          />
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`mode-seg ${mode === m.key ? 'active' : ''}`}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="mode-caption">{activeMode.caption}</div>
      </div>

      <div className="filter-bar">
        <span className="filter-eyebrow">필터</span>
        <select
          className="filter-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">전체 카테고리</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="filter-divider" />
        <div className="filter-price-group">
          <span className="filter-price-currency">₩</span>
          <input
            className="filter-price-input"
            type="number"
            inputMode="numeric"
            placeholder="최소가"
            value={minPriceInput}
            onChange={(e) => setMinPriceInput(e.target.value)}
            onBlur={commitPriceFilter}
            onKeyDown={(e) => e.key === 'Enter' && commitPriceFilter()}
          />
          <span className="filter-price-sep">–</span>
          <input
            className="filter-price-input"
            type="number"
            inputMode="numeric"
            placeholder="최대가"
            value={maxPriceInput}
            onChange={(e) => setMaxPriceInput(e.target.value)}
            onBlur={commitPriceFilter}
            onKeyDown={(e) => e.key === 'Enter' && commitPriceFilter()}
          />
        </div>
        {hasActiveFilter && (
          <button className="filter-reset" onClick={resetFilters}>
            ✕ 초기화
          </button>
        )}
      </div>

      <main className="main">
        {status === 'done' && results.length > 0 && (
          <div className="result-count">
            "{submittedQuery}" 검색 결과 <b>{results.length}</b>건 · 배지 숫자는 최고 결과 대비 상대 유사도
          </div>
        )}

        {status === 'idle' && (
          <div className="state-panel">
            <div className="state-title">검색어를 입력해보세요</div>
            <div className="state-desc">벡터 / 하이브리드 / 키워드 검색 엔진을 같은 검색어로 바로 비교할 수 있어요</div>
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
            <div className="state-title">"{submittedQuery}"에 대한 결과가 없어요</div>
            <div className="state-desc">다른 검색어, 다른 모드, 또는 필터 조건을 완화해서 시도해보세요</div>
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
