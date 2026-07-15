import { useEffect, useState } from 'react'
import './App.css'

const MODES = [
  { key: 'vector', label: '벡터', caption: '의미가 비슷한 상품을 찾아요', color: 'var(--vector)' },
  { key: 'hybrid', label: '하이브리드', caption: '의미와 검색어를 함께 봐요', color: 'var(--ink)' },
  { key: 'bm25', label: '키워드', caption: '검색어와 정확히 겹치는 상품을 찾아요', color: 'var(--keyword)' },
]

const ENDPOINTS = {
  vector: '/api/search',
  hybrid: '/api/search/hybrid',
  bm25: '/api/search/bm25',
}

const PRICE_PRESETS = [
  { label: '전체 가격', min: '', max: '' },
  { label: '10만원 이하', min: '', max: '100000' },
  { label: '10~30만원', min: '100000', max: '300000' },
  { label: '30~50만원', min: '300000', max: '500000' },
  { label: '50~100만원', min: '500000', max: '1000000' },
  { label: '100만원 이상', min: '1000000', max: '' },
]

const TOP_K = 100
const COMPARE_TOP_K = 10

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

function ResultCard({ item, maxScore, accentColor }) {
  const [imgFailed, setImgFailed] = useState(false)
  // 필터만으로 둘러보는 모드(검색어 없음)는 순위를 매길 유사도 자체가 없어서 maxScore가 0 -
  // 이때는 배지를 아예 숨긴다(0/0 = NaN을 그대로 보여주지 않기 위해).
  const hasScore = maxScore > 0
  const pct = hasScore ? Math.round((item.score / maxScore) * 100) : 0
  const categoryLeaf = item.category?.split('>').pop()?.trim()
  // 다나와 원본 데이터 자체가 "이미지 없음" 자리표시 gif(noImg/noData)를 주는 경우가 많아서,
  // 그 상태도 실제 로딩 실패(onError)와 동일하게 우리 fallback 박스로 대체한다.
  const isPlaceholderUrl = /noimg|nodata/i.test(item.imageUrl || '')
  const showImage = item.imageUrl && !imgFailed && !isPlaceholderUrl
  // 다나와 원본 상품 페이지로 연결 - source_url이 없는 극소수 상품은 그냥 카드로 둔다
  // (details/summary인 MallPriceList는 밖에 둬서 링크 안에 인터랙티브 요소가 중첩되지 않게 함).
  const LinkWrap = item.sourceUrl ? 'a' : 'div'
  const linkProps = item.sourceUrl
    ? { href: item.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }
    : {}

  return (
    <div className="card">
      <LinkWrap className="card-link" {...linkProps}>
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
        </div>
        <div className="card-body">
          {hasScore && (
            <div className="spectrum-row">
              <div className="spectrum-track">
                <div className="spectrum-fill" style={{ width: `${pct}%`, background: accentColor }} />
              </div>
              <span className="spectrum-value" style={{ color: accentColor }}>
                {pct}%
              </span>
            </div>
          )}
          <div className="card-category">{item.category}</div>
          <div className="card-name">{item.name}</div>
          <div className="card-price">
            <span className="lowest-label">최저</span> {item.price?.toLocaleString()}
            <span className="won">원</span>
          </div>
        </div>
      </LinkWrap>
      <div className="card-footer">
        <MallPriceList productId={item.productId} />
      </div>
    </div>
  )
}

function CompareColumn({ info, items, status, errorMsg }) {
  const maxScore = items.length > 0 ? Math.max(...items.map((r) => r.score)) : 0
  const hasScore = maxScore > 0
  return (
    <div className="compare-col" style={{ '--col-color': info.color }}>
      <div className="compare-col-head">
        <span className="compare-col-dot" style={{ background: info.color }} />
        <span className="compare-col-label">{info.label}</span>
        <span className="compare-col-caption">{info.caption}</span>
      </div>
      {status === 'loading' && <div className="compare-empty">불러오는 중...</div>}
      {status === 'error' && <div className="compare-empty compare-error">{errorMsg}</div>}
      {status === 'done' && items.length === 0 && <div className="compare-empty">결과 없음</div>}
      {status === 'done' && items.length > 0 && (
        <ol className="compare-list">
          {items.map((item, i) => (
            <li className={`compare-item ${i === 0 ? 'compare-item-top' : ''}`} key={item.productId}>
              <span className="compare-rank">{i + 1}</span>
              {item.sourceUrl ? (
                <a
                  className="compare-item-body compare-item-link"
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="compare-item-category">{item.category?.split('>').pop()?.trim()}</div>
                  <div className="compare-item-name">{item.name}</div>
                  <div className="compare-item-price">{item.price?.toLocaleString()}원</div>
                </a>
              ) : (
                <div className="compare-item-body">
                  <div className="compare-item-category">{item.category?.split('>').pop()?.trim()}</div>
                  <div className="compare-item-name">{item.name}</div>
                  <div className="compare-item-price">{item.price?.toLocaleString()}원</div>
                </div>
              )}
              {hasScore && (
                <span className="compare-item-score" style={{ color: info.color }}>
                  {Math.round((item.score / maxScore) * 100)}%
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
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

  const [compareMode, setCompareMode] = useState(false)
  const [compareResults, setCompareResults] = useState({ vector: [], hybrid: [], bm25: [] })
  const [compareStatus, setCompareStatus] = useState('idle')
  const [compareErrorMsg, setCompareErrorMsg] = useState('')

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

  // 검색어가 없어도 카테고리/가격 필터만 골랐으면 그 조건에 맞는 상품을 바로 둘러볼 수 있다.
  const hasSearchable = Boolean(submittedQuery || category || minPrice || maxPrice)

  const buildParams = (topK) => {
    const params = new URLSearchParams({ q: submittedQuery, topK: String(topK) })
    if (category) params.set('category', category)
    if (minPrice) params.set('minPrice', minPrice)
    if (maxPrice) params.set('maxPrice', maxPrice)
    return params
  }

  // 검색어를 제출/필터를 바꾼 뒤에는, 검색 모드 탭을 바꾸는 즉시 같은 조건으로 재검색한다.
  // (모드 탭만 바꾸고 다시 "검색"을 눌러야 하는 건 혼란스러워서 자동 반영하도록 함)
  useEffect(() => {
    if (compareMode) return
    if (!hasSearchable) return
    let cancelled = false

    const run = async () => {
      setStatus('loading')
      setErrorMsg('')
      try {
        const res = await fetch(`${ENDPOINTS[mode]}?${buildParams(TOP_K).toString()}`)
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
  }, [compareMode, submittedQuery, mode, category, minPrice, maxPrice])

  // 비교 보기: 같은 조건으로 벡터/하이브리드/키워드 3종을 동시에 불러와 나란히 보여준다.
  useEffect(() => {
    if (!compareMode) return
    if (!hasSearchable) return
    let cancelled = false

    const run = async () => {
      setCompareStatus('loading')
      setCompareErrorMsg('')
      try {
        const qs = buildParams(COMPARE_TOP_K).toString()
        const entries = await Promise.all(
          Object.entries(ENDPOINTS).map(async ([key, path]) => {
            const res = await fetch(`${path}?${qs}`)
            const data = res.ok ? await res.json() : []
            return [key, data]
          })
        )
        if (cancelled) return
        setCompareResults(Object.fromEntries(entries))
        setCompareStatus('done')
      } catch (err) {
        if (cancelled) return
        console.error('비교 검색 실패:', err)
        setCompareErrorMsg('비교 결과를 불러오지 못했어요.')
        setCompareStatus('error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, submittedQuery, category, minPrice, maxPrice])

  const handleSearch = () => {
    setSubmittedQuery(query.trim())
  }

  const commitPriceFilter = () => {
    setMinPrice(minPriceInput)
    setMaxPrice(maxPriceInput)
  }

  const applyPricePreset = (e) => {
    const preset = PRICE_PRESETS.find((p) => p.label === e.target.value)
    if (!preset) return
    setMinPriceInput(preset.min)
    setMaxPriceInput(preset.max)
    setMinPrice(preset.min)
    setMaxPrice(preset.max)
  }

  const resetFilters = () => {
    setCategory('')
    setMinPriceInput('')
    setMaxPriceInput('')
    setMinPrice('')
    setMaxPrice('')
  }

  const hasActiveFilter = category || minPrice || maxPrice
  const matchedPreset = PRICE_PRESETS.find((p) => p.min === minPrice && p.max === maxPrice)
  const priceSelectValue = matchedPreset ? matchedPreset.label : '직접 입력'

  const maxScore = results.length > 0 ? Math.max(...results.map((r) => r.score)) : 1
  const activeMode = MODES.find((m) => m.key === mode)
  const activeModeIndex = MODES.findIndex((m) => m.key === mode)
  const queryLabel = submittedQuery ? `"${submittedQuery}" 검색 결과` : '필터 조건에 맞는 상품'
  const emptyTitle = submittedQuery ? `"${submittedQuery}"에 대한 결과가 없어요` : '조건에 맞는 상품이 없어요'

  return (
    <div className="app-shell">
      <div className="ticker">
        <div className="ticker-inner">19,639 SKU 색인 · 3개 검색엔진 · BGE-M3 dense vector · cosine similarity</div>
      </div>
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            cosine<span className="logo-dot">.</span>
            <span className="logo-kicker">검색엔진 비교 실험실</span>
          </div>
          <div className="search-bar">
            <input
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="무선청소기, 노트북 추천처럼 검색해보세요 (비워두고 필터만 골라도 돼요)"
            />
            <button className="search-button" onClick={handleSearch} disabled={status === 'loading'}>
              {status === 'loading' ? '검색 중' : '검색'}
            </button>
          </div>
        </div>
      </header>

      <div className="console">
        <div className="console-row">
          <div className="console-engine">
            <div className="console-row-head">
              <div className="mode-eyebrow">검색 엔진</div>
              <button className="compare-toggle" onClick={() => setCompareMode((v) => !v)}>
                {compareMode ? '개별 결과 보기' : '3종 비교 보기'}
              </button>
            </div>
            {!compareMode && (
              <>
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
                      <span className="mode-seg-dot" style={{ background: m.color }} />
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="mode-caption">{activeMode.caption}</div>
              </>
            )}
            {compareMode && (
              <div className="mode-caption">
                같은 조건으로 세 엔진 결과를 나란히 비교해요 — 유사도 검색이 실제로 얼마나 잘 통하는지 여기서 바로 확인할 수 있어요
              </div>
            )}
          </div>
        </div>

        <div className="console-divider" />

        <div className="console-row filter-bar">
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
          <select className="filter-select" value={priceSelectValue} onChange={applyPricePreset}>
            {PRICE_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
            {!matchedPreset && <option value="직접 입력">직접 입력</option>}
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
      </div>

      <main className="main">
        {!hasSearchable && (
          <div className="state-panel">
            <div className="state-title">검색어를 입력하거나 필터를 골라보세요</div>
            <div className="state-desc">벡터 / 하이브리드 / 키워드 검색 엔진을 같은 조건으로 바로 비교할 수 있어요</div>
          </div>
        )}

        {hasSearchable && !compareMode && (
          <>
            {status === 'done' && results.length > 0 && (
              <div className="result-count">
                {queryLabel} <b>{results.length}</b>건 · 막대 숫자는 최고 결과 대비 상대 유사도
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
                <div className="state-title">{emptyTitle}</div>
                <div className="state-desc">다른 검색어, 다른 모드, 또는 필터 조건을 완화해서 시도해보세요</div>
              </div>
            )}

            {status === 'done' && results.length > 0 && (
              <div className="grid">
                {results.map((r) => (
                  <ResultCard key={r.productId} item={r} maxScore={maxScore} accentColor={activeMode.color} />
                ))}
              </div>
            )}
          </>
        )}

        {hasSearchable && compareMode && (
          <>
            <div className="result-count">{queryLabel} · 엔진별 상위 {COMPARE_TOP_K}건 비교</div>
            <div className="compare-grid">
              {MODES.map((m) => (
                <CompareColumn
                  key={m.key}
                  info={m}
                  items={compareResults[m.key] || []}
                  status={compareStatus}
                  errorMsg={compareErrorMsg}
                />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
