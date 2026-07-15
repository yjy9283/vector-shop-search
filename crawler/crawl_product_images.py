"""
검색 목록 페이지(search.danawa.com)에는 썸네일이 없어서 "이미지 없음" placeholder로
저장된 상품들을, 상세 페이지(prod.danawa.com/info/?pcode=)에 다시 방문해서
실제 썸네일(og:image)로 채워 넣는다.

⚠️ robots.txt 준수사항:
  - prod.danawa.com robots.txt에는 Crawl-delay 명시가 없음(직접 확인함,
    /api/, /community/, /list/ajax/, /info/ajax/ 만 금지 - 이 스크립트가 쓰는
    /info/?pcode= 경로는 허용됨). 그래도 매너상 요청 간 딜레이는 둔다.

⚠️ 이 스크립트는 image_url 컬럼만 갱신한다. name/category/description은 그대로라
   임베딩 벡터가 이미 실제 텍스트를 반영하고 있으므로 재임베딩/ES 재색인이 필요 없다
   (embedding-service/scripts/index_to_es.py의 build_text()가 image_url을 쓰지 않음).

실행: python crawler/crawl_product_images.py [--limit N] [--delay 0.5]
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import time

import psycopg2
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

PG_DSN = os.getenv("PG_DSN", "dbname=vector_shop user=vss_user password=vss_password host=localhost port=5432")
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
DEFAULT_DELAY_SECONDS = 0.5

OG_IMAGE_RE = re.compile(r'<meta property="og:image" content="([^"]+)"')


def fetch_real_image(source_url: str) -> str | None:
    resp = requests.get(source_url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    m = OG_IMAGE_RE.search(resp.text)
    if not m:
        return None
    url = m.group(1)
    # og:image엔 "?shrink=160:160&_v=..." 같은 캐시버스터 쿼리가 붙는데, 프론트 썸네일
    # 표시엔 필요 없고 시간 지나면 값이 바뀌어서 매번 새로 크롤링해야 하니 잘라낸다.
    return url.split("?")[0]


def run(limit: int | None, delay: float):
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, source_url FROM products
        WHERE image_url ILIKE '%%noimg%%' OR image_url ILIKE '%%nodata%%'
        ORDER BY id
        """
        + (" LIMIT %s" if limit else ""),
        (limit,) if limit else (),
    )
    rows = cur.fetchall()
    log.info("재크롤링 대상 %d건", len(rows))

    updated, failed = 0, 0
    for i, (product_id, source_url) in enumerate(rows, start=1):
        try:
            image_url = fetch_real_image(source_url)
            if image_url:
                cur.execute("UPDATE products SET image_url = %s WHERE id = %s", (image_url, product_id))
                conn.commit()
                updated += 1
            else:
                log.warning("[%d/%d] id=%s og:image 못 찾음 (상세페이지 구조 변경 가능성)", i, len(rows), product_id)
        except requests.RequestException as e:
            failed += 1
            log.error("[%d/%d] id=%s 요청 실패: %s", i, len(rows), product_id, e)

        if i % 100 == 0 or i == len(rows):
            log.info("[%d/%d] 진행 중 (갱신 %d건, 실패 %d건)", i, len(rows), updated, failed)

        if i < len(rows):
            time.sleep(delay)

    cur.close()
    conn.close()
    log.info("완료. 총 %d건 중 %d건 갱신, %d건 실패", len(rows), updated, failed)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="테스트용 처리 건수 제한")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS, help="요청 간 대기(초)")
    args = parser.parse_args()
    run(limit=args.limit, delay=args.delay)
