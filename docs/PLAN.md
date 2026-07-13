# 📋 프로젝트 종합 계획 (VS Code 작업 시작용)

> `git pull` 받은 직후 이 문서 하나만 보고 바로 작업 시작할 수 있도록 기능/데이터/API/디자인/일정을 전부 확정해둔 문서.

---

## 1. 목표 재확인

**핵심 가설**: BGE-M3 dense 벡터 임베딩 기반 유사도 검색이, 키워드 기반(BM25) 검색보다
**동의어·문맥·오타가 섞인 한국어 상품 검색 쿼리**에서 더 관련성 높은 결과를 반환한다.

이 프로젝트는 "예쁜 쇼핑몰"을 만드는 게 아니라 **이 가설을 검증하는 실험 도구**를 만드는 것.
따라서 우선순위는 항상: **① 검색 정확도 검증 > ② API 안정성 > ③ UI 완성도** 순.

### 크롤링 대상 검증 결과 (robots.txt 실제 확인함)

| 사이트 | robots.txt | 결론 |
|---|---|---|
| 무신사 | `User-agent: *` → 전체 Disallow (Googlebot 등 이름이 명시된 봇만 부분 허용) | ❌ 일반 크롤러 차단 |
| 쿠팡/옥션/G마켓 | Cloudflare·Akamai가 robots.txt 요청 자체를 차단 | ❌ 매우 어려움 |
| SSG | 지정된 검색엔진 봇만, 특정 상품 URL 패턴에 한해 허용 | ❌ 어려움 |
| **29CM** | `User-agent: *` → `Allow: /` (`/my-page/`, `/order/`, `/auth/` 등만 제외) | ✅ **채택** |
| 다나와 | `User-agent: *` → 거의 전체 허용 | ✅ 대안 (스펙/설명 텍스트가 더 풍부하나 패션 톤과는 안 맞음) |

→ **29CM로 확정**. 크롤러 구현 시 `/my-page/`, `/order/`, `/auth/`, `/inbox/` 경로는 절대 접근하지 않을 것.

---

## 2. 기능 요구사항 (Feature Spec)

### 2.1 크롤러
| 기능 | 필수 여부 | 설명 |
|---|---|---|
| 상품 목록 페이지네이션 순회 | 필수 | 최소 500~1000건 확보 |
| 필드 수집: 상품명, 카테고리, 가격, 설명, 이미지 URL | 필수 | 설명(description)이 비어있으면 임베딩 품질 저하 → 카테고리라도 채울 것 |
| 중복 상품 스킵 | 권장 | source_url 기준 UNIQUE 제약 |
| 수집 실패 로깅 | 권장 | 실패한 페이지 URL을 별도 로그 파일에 기록 |
| robots.txt 확인 | 필수 | 크롤링 전 반드시 확인, 우회 금지 |

### 2.2 임베딩 서비스
| 기능 | 필수 여부 | 설명 |
|---|---|---|
| `/embed` (쿼리 1건 실시간 변환) | 필수 | Spring Boot가 검색 시마다 호출 |
| 배치 색인 스크립트 | 필수 | Postgres 미색인 상품 → 벡터화 → ES bulk insert |
| 재색인 지원 | 권장 | 상품 설명 텍스트 변경 시 재색인 가능해야 함 |
| 헬스체크 (`/health`) | 필수 | Spring Boot가 기동 시 의존성 체크 가능하도록 |

### 2.3 백엔드 (Spring Boot)
| 기능 | 필수 여부 | 설명 |
|---|---|---|
| `GET /api/search` (벡터 검색) | 필수 | 아래 3장 API 명세 참고 |
| `GET /api/search/hybrid` (BM25+벡터) | 필수 | 비교 실험용 |
| `GET /api/search/bm25` (BM25 단독) | **추가 필요** | 평가표 3종 비교를 위해선 이것도 있어야 함 (기존 계획에 빠져있었음) |
| 임베딩 서비스 장애 시 에러 처리 | 필수 | 5xx 시 프론트에 명확한 에러 메시지 전달 |
| CORS 설정 | 필수 | React(5173) ↔ Spring Boot(8080) 간 로컬 개발 시 필요 |

### 2.4 프론트엔드 (React)
| 기능 | 필수 여부 | 설명 |
|---|---|---|
| 검색창 + 검색 실행 | 필수 | Enter 키 지원 |
| 벡터/하이브리드 모드 토글 | 필수 | BM25 단독 모드도 3번째 옵션으로 추가 권장 |
| 결과 카드 (이미지, 이름, 카테고리, 가격) | 필수 | |
| 유사도 score 시각화 (막대바) | 필수 | 완료됨 - 숫자보다 막대가 직관적 |
| 상태 처리: idle / loading / done(빈 결과 포함) / error | 필수 | 완료됨 |
| 반응형 (모바일) | 선택 | 발표용이면 굳이 안 해도 됨 |

> ⚠️ **놓치기 쉬운 지점**: BM25 단독 API가 계획에 없었는데, 평가 방법론(6장)에서 "BM25 단독 vs 벡터 단독 vs 하이브리드" 3종 비교를 하기로 해놓고 API는 2개만 있었음. `SearchController`에 `/api/search/bm25` 추가 필요 — 아래 체크리스트에 반영함.

---

## 3. API 명세

### `GET /api/search?q={query}&topK={n}`
벡터(kNN) 단독 검색

**요청 예시**: `/api/search?q=나이키+운동화&topK=10`

**응답 (200)**:
```json
[
  {
    "productId": "1023",
    "name": "나이키 에어맥스 270",
    "category": "운동화",
    "price": 139000,
    "imageUrl": "https://...",
    "score": 0.8234
  }
]
```

**에러 응답**:
- `400`: `q` 파라미터 누락 → `{ "error": "검색어를 입력해주세요." }`
- `503`: 임베딩 서비스 또는 ES 연결 실패 → `{ "error": "검색 서비스에 일시적인 문제가 있어요." }`

### `GET /api/search/hybrid?q={query}&topK={n}`
BM25(name, description) + kNN 결합

### `GET /api/search/bm25?q={query}&topK={n}` *(추가)*
BM25 단독 — nori 분석기 적용된 `name`, `description` 필드 대상 `match` 쿼리

### `GET /api/health`
프론트 기동 체크용. ES/임베딩서비스/DB 연결 상태 반환.

---

## 4. 데이터 모델 & Elasticsearch 설계

### PostgreSQL `products` 테이블 (기존 + 보강)
```sql
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    category VARCHAR(200),
    price INTEGER,
    description TEXT,
    image_url TEXT,
    source_url TEXT UNIQUE,        -- 중복 크롤링 방지 (보강)
    crawled_at TIMESTAMP DEFAULT NOW(),
    embedded BOOLEAN DEFAULT FALSE
);
```

### Elasticsearch `products` 인덱스
- `embedding`: `dense_vector`, dims=1024, similarity=cosine (BGE-M3 dense 출력 차원)
- `name`, `description`: **`korean_analyzer`(nori_tokenizer) 적용** — 이미 반영 완료
  - ⚠️ 검증 포인트: 기본 ES 이미지엔 nori 플러그인이 없어서 `infra/elasticsearch/Dockerfile`로 커스텀 빌드하도록 이미 수정해둠. `docker compose up -d --build` 로 실행해야 함 (`up -d`만 하면 이전 이미지로 뜰 수 있음).
- `name.raw`: keyword 서브필드 — 정확 매칭/정렬용

---

## 5. UI/UX 설계

### 디자인 톤 (v2 — 무신사x쿠팡 리뉴얼)
- 베이스: 무신사st 미니멀 블랙(`#12121a`)/오프화이트(`#f6f6f4`) 에디토리얼
- 액센트: 쿠팡st 코발트 블루 `#0b5fff` — 매치율 배지·카테고리 라벨에만 절제해서 사용
- 타이포: 상품명은 Pretendard(가독성), 가격·유사도 숫자는 모노스페이스(`IBM Plex Mono`) — "검색 실험 데이터"라는 성격을 타이포로 드러냄
- 시그니처 요소: 썸네일 위 **원형 매치율 배지** (conic-gradient) — 유사도를 %로 즉시 체감 가능, 이 프로젝트의 핵심(임베딩 유사도)을 시각적으로 가장 먼저 보여줌
- `frontend/src/App.css`, `App.jsx`에 반영 완료

### 화면 상태 (완료 반영됨)
1. **Idle**: "검색어를 입력하고 결과를 확인해보세요."
2. **Loading**: 버튼 텍스트가 "검색 중..."으로 변경, 중복 클릭 방지(disabled)
3. **Done + 결과 있음**: 카드 리스트, score 막대바로 상대적 유사도 시각화
4. **Done + 결과 없음**: "검색 결과가 없어요" 안내
5. **Error**: 백엔드 응답 실패 시 사용자 친화적 에러 메시지 (기술 에러 그대로 노출 금지)

### 향후 추가하면 좋은 것 (이번 미니프로젝트 범위 밖, 참고용)
- 검색 모드별 결과를 나란히 비교하는 "비교 뷰" (좌: 벡터 / 우: BM25) → 발표 자료로 강력함
- 쿼리별 Recall 결과를 표로 보여주는 `/evaluation` 페이지

---

## 6. 평가 방법론 (보강)

`docs/evaluation.md`에 이미 템플릿 있음. 아래 내용 반영해서 채울 것:

1. **3종 비교**로 확정: BM25 단독 / 벡터 단독 / 하이브리드 (API 3개 다 준비됨)
2. 평가셋 20~30개 쿼리, 유형별 최소 5개씩:
   - 정확 매칭, 동의어/유사어, 오타/문맥
3. Recall@5, Recall@10 계산 — 수동 스프레드시트 or 간단한 Python 스크립트로 자동화 권장
   - `docs/eval_runner.py` 추가 권장 (체크리스트에 반영)

---

## 7. 실행 체크리스트 (pull 후 순서대로)

- [ ] **0단계**: `docker compose -f infra/docker-compose.yml up -d --build` (nori 포함 커스텀 이미지라 `--build` 필수)
- [ ] **1단계**: 크롤링 대상 쇼핑몰 확정 (robots.txt 확인) → `crawler/crawl_products.py`의 `fetch_product_list()` 구현
- [ ] **2단계**: 크롤러 실행 → Postgres에 500~1000건 적재 확인
- [ ] **3단계**: `embedding-service` 의존성 설치 (`pip install -r requirements.txt --break-system-packages`) → `uvicorn app.main:app --reload --port 8000`
- [ ] **4단계**: `python scripts/index_to_es.py` 실행 → ES에 벡터 색인 완료 확인 (Kibana `http://localhost:5601`에서 `GET products/_count`)
- [ ] **5단계**: Spring Boot `SearchService` 구현
  - [ ] `vectorSearch()`: embedding-service `/embed` 호출 → ES kNN 쿼리
  - [ ] `hybridSearch()`: BM25(`name`,`description` match) + kNN 결합
  - [ ] `bm25Search()`: **신규 추가** — BM25 단독 (평가 3종 비교용)
  - [ ] `SearchController`에 `/api/search/bm25` 라우트 추가
  - [ ] CORS 설정 추가 (`WebMvcConfigurer` 또는 `@CrossOrigin`)
- [ ] **6단계**: `./gradlew bootRun` → `curl localhost:8080/api/search?q=나이키` 로 수동 확인
- [ ] **7단계**: `npm install && npm run dev` (frontend) → 브라우저에서 벡터/하이브리드 토글 확인
- [ ] **8단계**: 평가셋 20~30개 쿼리 작성 → 3개 API 각각 호출해서 Recall@5/@10 기록
- [ ] **9단계**: `docs/evaluation.md` 결과 채우기 + 케이스 스터디 스크린샷
- [ ] **10단계**: README, 발표자료 정리

---

## 8. Definition of Done (모듈별 완료 기준)

| 모듈 | 완료 기준 |
|---|---|
| 크롤러 | Postgres에 중복 없이 500건 이상, description 채워짐 비율 80% 이상 |
| 임베딩 서비스 | `/embed` 호출 시 1024차원 벡터 반환 확인, 배치 색인 스크립트 에러 없이 전체 완주 |
| 백엔드 | 3개 검색 API 모두 200 응답, 에러 케이스(빈 검색어, 서비스 다운) 처리 확인 |
| 프론트 | 5가지 상태(idle/loading/done/empty/error) 모두 수동으로 재현해서 확인 |
| 평가 | Recall@5/@10 수치 + 케이스 스터디 최소 2건 문서화 |

---

## 9. 리스크 / 주의사항

- **nori 플러그인 누락**: `docker compose up -d --build`로 반드시 재빌드 (4장 참고)
- **임베딩 모델 최초 로딩 시간**: BGE-M3는 처음 로드할 때 수 GB 다운로드 + 로딩 시간 소요 → embedding-service 첫 기동은 몇 분 걸릴 수 있음, 타임아웃 아님
- **GPU 없는 환경**: `use_fp16=True`가 CPU에서는 의미 없을 수 있음 → CPU만 있다면 배치 색인 시간이 길어질 수 있으니 처음엔 50~100건만으로 파이프라인 검증 후 전체 실행 권장
- **실습 정직성 원칙 유지**: 겪지 않은 트러블슈팅 지어내지 않기, overclaim 금지 (기존 원칙 동일 적용)
