import { useState } from 'react'
import './App.css'

export default function App() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('vector') // 'vector' | 'hybrid' - 성능 비교용
  const [results, setResults] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [errorMsg, setErrorMsg] = useState('')

  const handleSearch = async () => {
    if (!query.trim()) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const endpoint = mode === 'hybrid' ? '/api/search/hybrid' : '/api/search'
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}&topK=10`)
      if (!res.ok) throw new Error(`검색 서버 응답 오류 (status: ${res.status})`)
      const data = await res.json()
      setResults(data)
      setStatus('done')
    } catch (err) {
      console.error('검색 실패:', err)
      setErrorMsg(err.message || '검색 중 오류가 발생했어요. 백엔드가 켜져 있는지 확인해주세요.')
      setStatus('error')
    }
  }

  const maxScore = results.length > 0 ? Math.max(...results.map((r) => r.score)) : 1

  return (
    <div className="app-container">
      <h1 className="app-title">🔍 벡터 검색 쇼핑몰</h1>
      <p className="app-subtitle">BGE-M3 + Elasticsearch 기반 상품 유사도 검색 데모</p>

      <div className="search-bar">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="상품을 검색해보세요 (예: 나이키 운동화)"
        />
        <button className="search-button" onClick={handleSearch} disabled={status === 'loading'}>
          {status === 'loading' ? '검색 중...' : '검색'}
        </button>
      </div>

      <div className="mode-toggle">
        <label>
          <input type="radio" checked={mode === 'vector'} onChange={() => setMode('vector')} />
          벡터 검색
        </label>
        <label>
          <input type="radio" checked={mode === 'hybrid'} onChange={() => setMode('hybrid')} />
          하이브리드 (BM25 + 벡터)
        </label>
      </div>

      {status === 'idle' && (
        <p className="state-message">검색어를 입력하고 결과를 확인해보세요.</p>
      )}

      {status === 'error' && <p className="state-message error">⚠ {errorMsg}</p>}

      {status === 'done' && results.length === 0 && (
        <p className="state-message">"{query}"에 대한 검색 결과가 없어요.</p>
      )}

      {status === 'done' && results.length > 0 && (
        <ul className="result-list">
          {results.map((r) => (
            <li key={r.productId} className="result-card">
              {r.imageUrl && <img className="result-thumb" src={r.imageUrl} alt={r.name} />}
              <div className="result-info">
                <div className="result-name">{r.name}</div>
                <div className="result-meta">
                  {r.category} · {r.price?.toLocaleString()}원
                </div>
                <div className="score-row">
                  <div className="score-bar-track">
                    <div
                      className="score-bar-fill"
                      style={{ width: `${(r.score / maxScore) * 100}%` }}
                    />
                  </div>
                  <span className="score-value">{r.score.toFixed(4)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
