import { useState } from 'react'

export default function App() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('vector') // 'vector' | 'hybrid' - 성능 비교용
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const endpoint = mode === 'hybrid' ? '/api/search/hybrid' : '/api/search'
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(query)}&topK=10`)
      const data = await res.json()
      setResults(data)
    } catch (err) {
      console.error('검색 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>🔍 벡터 검색 쇼핑몰</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="상품을 검색해보세요 (예: 나이키 운동화)"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={handleSearch}>검색</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label>
          <input type="radio" checked={mode === 'vector'} onChange={() => setMode('vector')} /> 벡터 검색
        </label>
        <label style={{ marginLeft: 12 }}>
          <input type="radio" checked={mode === 'hybrid'} onChange={() => setMode('hybrid')} /> 하이브리드(BM25+벡터)
        </label>
      </div>

      {loading && <p>검색 중...</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {results.map((r) => (
          <li key={r.productId} style={{ border: '1px solid #eee', padding: 12, marginBottom: 8 }}>
            <strong>{r.name}</strong> ({r.category}) - {r.price}원
            <div style={{ fontSize: 12, color: '#888' }}>유사도 score: {r.score.toFixed(4)}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
