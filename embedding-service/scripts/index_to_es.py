"""
PostgreSQL의 products 테이블을 읽어 BGE-M3로 벡터화한 뒤 Elasticsearch에 색인한다.

실행: python scripts/index_to_es.py
전제:
  - infra/docker-compose.yml 로 Postgres, Elasticsearch가 떠 있어야 함
  - pip install -r requirements.txt 완료
"""

import os
import psycopg2
from elasticsearch import Elasticsearch, helpers
from FlagEmbedding import BGEM3FlagModel

PG_DSN = os.getenv("PG_DSN", "dbname=vector_shop user=vss_user password=vss_password host=localhost port=5432")
ES_HOST = os.getenv("ES_HOST", "http://localhost:9200")
ES_INDEX = "products"
BATCH_SIZE = 32

INDEX_MAPPING = {
    "settings": {
        "analysis": {
            "analyzer": {
                # 한국어 형태소 분석기 - BM25 비교 실험의 정확도를 위해 필수
                # (infra/elasticsearch/Dockerfile 에서 analysis-nori 플러그인 설치 필요)
                "korean_analyzer": {
                    "type": "custom",
                    "tokenizer": "nori_tokenizer",
                    "filter": ["nori_readingform", "lowercase"],
                }
            }
        }
    },
    "mappings": {
        "properties": {
            "product_id": {"type": "keyword"},
            "name": {
                "type": "text",
                "analyzer": "korean_analyzer",
                "fields": {"raw": {"type": "keyword"}},
            },
            "category": {"type": "keyword"},
            "price": {"type": "integer"},
            "description": {"type": "text", "analyzer": "korean_analyzer"},
            "image_url": {"type": "keyword", "index": False},
            "embedding": {
                "type": "dense_vector",
                "dims": 1024,
                "index": True,
                "similarity": "cosine",
            },
        }
    },
}


def build_text(row):
    """상품명 + 카테고리 + 설명을 합쳐서 임베딩 품질을 높인다."""
    name, category, description = row[1], row[2] or "", row[4] or ""
    return f"{name} {category} {description}".strip()


def main():
    model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True, devices="cpu")
    es = Elasticsearch(ES_HOST)

    if not es.indices.exists(index=ES_INDEX):
        es.indices.create(index=ES_INDEX, body=INDEX_MAPPING)
        print(f"[ES] '{ES_INDEX}' 인덱스 생성 완료")

    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, category, price, description, image_url FROM products WHERE embedded = FALSE"
    )
    rows = cur.fetchall()
    print(f"[PG] 미색인 상품 {len(rows)}건 조회")

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        texts = [build_text(r) for r in batch]

        output = model.encode(texts, return_dense=True, return_sparse=False, return_colbert_vecs=False)
        vectors = output["dense_vecs"]

        actions = []
        ids = []
        for row, vec in zip(batch, vectors):
            product_id, name, category, price, description, image_url = row
            actions.append(
                {
                    "_index": ES_INDEX,
                    "_id": str(product_id),
                    "_source": {
                        "product_id": str(product_id),
                        "name": name,
                        "category": category,
                        "price": price,
                        "description": description,
                        "image_url": image_url,
                        "embedding": vec.tolist(),
                    },
                }
            )
            ids.append(product_id)

        helpers.bulk(es, actions)

        cur.execute(
            "UPDATE products SET embedded = TRUE WHERE id = ANY(%s)", (ids,)
        )
        conn.commit()
        print(f"[ES] {i + len(batch)}/{len(rows)} 색인 완료")

    cur.close()
    conn.close()
    print("전체 색인 완료")


if __name__ == "__main__":
    main()
