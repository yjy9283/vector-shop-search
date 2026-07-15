# 🔍 벡터 검색 기반 쇼핑몰 상품 검색

BGE-M3 임베딩 모델 + Elasticsearch kNN을 이용해, 쇼핑몰 상품 검색에서 벡터 유사도 검색이
키워드 검색(BM25) 대비 얼마나 관련성 높은 결과를 끌어내는지 검증하는 미니프로젝트.

## 아키텍처

```
[크롤러(Python)] → [PostgreSQL] → [임베딩 서비스(FastAPI+BGE-M3)] → [Elasticsearch(dense_vector)]
                                                                          ↑
                                                    [Spring Boot API] ← [React 검색 UI]
```

## 폴더 구조

```
vector-shop-search/
├── crawler/            # 상품 크롤러 (Python)
├── embedding-service/  # BGE-M3 임베딩 FastAPI 서버 + 배치 색인 스크립트
├── backend/            # Spring Boot 검색 API
├── frontend/           # React 검색 UI
├── infra/              # docker-compose (Postgres, Elasticsearch, Kibana)
└── docs/               # 평가 결과, 회고
```

## 로컬 실행 순서

1. **인프라 기동**
   ```bash
   cd infra
   docker compose up -d
   ```

2. **크롤러 실행 (상품 데이터 → Postgres)**
   ```bash
   cd crawler
   pip install -r requirements.txt --break-system-packages
   python crawl_products.py
   ```

3. **임베딩 서비스 기동**
   ```bash
   cd embedding-service
   pip install -r requirements.txt --break-system-packages
   uvicorn app.main:app --reload --port 8000
   ```

4. **배치 색인 (Postgres → BGE-M3 → Elasticsearch)**
   ```bash
   cd embedding-service
   python scripts/index_to_es.py
   ```

5. **백엔드 실행**
   ```bash
   cd backend
   ./gradlew bootRun
   ```

6. **프론트 실행**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Git 브랜치 전략

- `main`: 항상 동작하는 상태만 머지
- `dev`: 통합 개발 브랜치
- `feat/crawler`, `feat/embedding`, `feat/backend-search`, `feat/frontend-ui`: 기능별 브랜치
- 커밋 컨벤션: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`

## 평가 방법

`docs/evaluation.md` 참고 — Recall@K, Category Precision@K 기준으로 BM25 단독 / 벡터 단독 / 하이브리드 검색을 비교.

**요약**: 전체 Recall@10만 보면 벡터(33%)가 BM25(37.5%)보다 낮지만, 이는 "카테고리 규모 대비 정답 ID가 너무 적은" 평가셋 설계 문제 때문이다. "결과가 정답 카테고리에 실제로 속하는가"를 재는 Category Precision@10으로 보면 벡터(89%)가 BM25(66%)를 크게 앞선다 — 즉 벡터는 동의어/문맥 이해에서 실제로 우수하고, 다만 거의 동일한 상품의 세부 스펙(SKU) 구분에는 약하다. 실무 권장 방식은 두 장점을 합친 **하이브리드**. 자세한 케이스 스터디는 `docs/evaluation.md` 참고.

## 원칙

- 실습 과정임을 명확히: 겪지 않은 문제를 지어내지 않음
- 사용하지 않은 기술 overclaim 금지
- 크롤링 대상 사이트의 robots.txt / 이용약관 확인 후 진행
