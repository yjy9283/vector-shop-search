"""
BM25 / 벡터 / 하이브리드 검색 API를 호출해서 Recall@5, Recall@10과
카테고리 정답률(category precision)@5, @10을 자동 계산한다.

사용법:
  1. eval_queries.json 을 아래 형식으로 채운다.
  2. python docs/eval_runner.py

eval_queries.json 예시:
[
  {
    "_type": "정확 매칭",
    "query": "나이키 에어맥스 270",
    "answer_product_ids": ["1023"]
  },
  {
    "_type": "동의어/유사어",
    "query": "나이키 운동화",
    "answer_product_ids": ["1023", "1024"],
    "answer_category": "신발 > 운동화"
  }
]

"answer_category"는 선택 필드다. 동의어/오타처럼 카테고리 전체가 정답인 쿼리는
정답 상품 ID 몇 개만으로 recall@k를 재는 게 실제 카테고리 규모(수백 건) 대비
로또성 지표가 되기 쉽다. answer_category가 있으면 category precision@k(상위 k개 중
정답 카테고리와 일치하는 비율)를 별도로 계산해서 그 문제를 보완한다.
"""

import json

import requests

BASE_URL = "http://localhost:8080"
ENDPOINTS = {
    "bm25": "/api/search/bm25",
    "vector": "/api/search",
    "hybrid": "/api/search/hybrid",
}
KS = (5, 10)


def recall_at_k(results: list[dict], answer_ids: list[str], k: int) -> bool:
    top_k_ids = [r["productId"] for r in results[:k]]
    return any(a in top_k_ids for a in answer_ids)


def category_precision_at_k(results: list[dict], answer_category: str, k: int) -> float:
    top_k = results[:k]
    if not top_k:
        return 0.0
    matches = sum(1 for r in top_k if r.get("category") == answer_category)
    return matches / len(top_k)


def run():
    with open("docs/eval_queries.json", "r", encoding="utf-8") as f:
        queries = json.load(f)

    types = sorted({q["_type"] for q in queries})

    # recall_scores[method][scope][k] = [bool, ...]  (scope: "전체" or a _type)
    recall_scores = {m: {scope: {k: [] for k in KS} for scope in ("전체", *types)} for m in ENDPOINTS}
    # cat_precision[method][k] = [float, ...] (answer_category 있는 쿼리만)
    cat_precision = {m: {k: [] for k in KS} for m in ENDPOINTS}

    for method, path in ENDPOINTS.items():
        for q in queries:
            resp = requests.get(f"{BASE_URL}{path}", params={"q": q["query"], "topK": max(KS)})
            resp.raise_for_status()
            results = resp.json()

            for k in KS:
                hit = recall_at_k(results, q["answer_product_ids"], k)
                recall_scores[method]["전체"][k].append(hit)
                recall_scores[method][q["_type"]][k].append(hit)

            answer_category = q.get("answer_category")
            if answer_category:
                for k in KS:
                    cat_precision[method][k].append(category_precision_at_k(results, answer_category, k))

    def avg(values):
        return sum(values) / len(values) if values else 0.0

    print("\n=== 검색 방식별 Recall 비교 (전체) ===")
    print(f"{'방식':<10} {'Recall@5':<10} {'Recall@10':<10}")
    for method in ENDPOINTS:
        r5 = avg(recall_scores[method]["전체"][5])
        r10 = avg(recall_scores[method]["전체"][10])
        print(f"{method:<10} {r5:<10.2%} {r10:<10.2%}")

    print("\n=== 유형별 Recall@10 breakdown ===")
    header = f"{'유형':<14}" + "".join(f"{m:<10}" for m in ENDPOINTS)
    print(header)
    for t in types:
        row = f"{t:<14}"
        for method in ENDPOINTS:
            row += f"{avg(recall_scores[method][t][10]):<10.2%}"
        print(row)

    print("\n=== Category Precision@k (answer_category 있는 쿼리만) ===")
    print(f"{'방식':<10} {'CatP@5':<10} {'CatP@10':<10}")
    for method in ENDPOINTS:
        cp5 = avg(cat_precision[method][5])
        cp10 = avg(cat_precision[method][10])
        print(f"{method:<10} {cp5:<10.2%} {cp10:<10.2%}")


if __name__ == "__main__":
    run()
