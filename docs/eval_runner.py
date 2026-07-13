"""
BM25 / 벡터 / 하이브리드 검색 API를 호출해서 Recall@5, Recall@10을 자동 계산한다.

사용법:
  1. eval_queries.json 을 아래 형식으로 채운다.
  2. python docs/eval_runner.py

eval_queries.json 예시:
[
  {"query": "나이키 운동화", "answer_product_ids": ["1023", "1024"]},
  {"query": "나이키 에어맥스 270", "answer_product_ids": ["1023"]}
]
"""

import json
import requests

BASE_URL = "http://localhost:8080"
ENDPOINTS = {
    "bm25": "/api/search/bm25",
    "vector": "/api/search",
    "hybrid": "/api/search/hybrid",
}


def recall_at_k(results: list[dict], answer_ids: list[str], k: int) -> bool:
    top_k_ids = [r["productId"] for r in results[:k]]
    return any(a in top_k_ids for a in answer_ids)


def run():
    with open("docs/eval_queries.json", "r", encoding="utf-8") as f:
        queries = json.load(f)

    summary = {name: {"recall@5": 0, "recall@10": 0} for name in ENDPOINTS}

    for method, path in ENDPOINTS.items():
        hit5, hit10 = 0, 0
        for q in queries:
            resp = requests.get(f"{BASE_URL}{path}", params={"q": q["query"], "topK": 10})
            resp.raise_for_status()
            results = resp.json()
            if recall_at_k(results, q["answer_product_ids"], 5):
                hit5 += 1
            if recall_at_k(results, q["answer_product_ids"], 10):
                hit10 += 1
        summary[method]["recall@5"] = hit5 / len(queries)
        summary[method]["recall@10"] = hit10 / len(queries)

    print("\n=== 검색 방식별 Recall 비교 ===")
    print(f"{'방식':<10} {'Recall@5':<10} {'Recall@10':<10}")
    for method, scores in summary.items():
        print(f"{method:<10} {scores['recall@5']:<10.2%} {scores['recall@10']:<10.2%}")


if __name__ == "__main__":
    run()
