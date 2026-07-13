"""
다나와 상품 상세페이지(prod.danawa.com/info/?pcode=)에서 "쇼핑몰별 최저가" 비교 데이터를 수집한다.

이 페이지의 가격비교 표는 정적 HTML로 렌더링되어 있어 크롤링 가능하다.
(주의: 같은 페이지의 멤버십 할인가 레이어는 /info/ajax/ 로 별도 요청되는데,
 이 경로는 prod.danawa.com robots.txt에서 명시적으로 Disallow 되어 있으므로 절대 접근하지 않는다.
 이 스크립트는 오직 정적으로 내려오는 "쇼핑몰별 최저가" 섹션만 사용한다.)

실행 순서: crawl_products.py 로 products 테이블을 먼저 채운 뒤 이 스크립트를 실행한다.

사용법: python crawl_mall_prices.py [--limit N]
"""

from __future__ import annotations

import os
import re
import time
import logging
import argparse

import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

PG_DSN = os.getenv("PG_DSN", "dbname=vector_shop user=vss_user password=vss_password host=localhost port=5432")
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# prod.danawa.com robots.txt엔 Crawl-delay 명시가 없지만, 예의상 최소한의 텀은 둔다.
REQUEST_DELAY_SECONDS = 1.5


def extract_pcode(source_url: str) -> str | None:
    m = re.search(r"pcode=(\d+)", source_url)
    return m.group(1) if m else None


def fetch_mall_prices(pcode: str) -> list[dict]:
    url = f"https://prod.danawa.com/info/?pcode={pcode}"
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    mall_box = soup.select_one("div.box__mall-price")
    if not mall_box:
        return []

    results = []
    for item in mall_box.select("ul.list__mall-price li.list-item"):
        logo_img = item.select_one(".box__logo img")
        logo_text = item.select_one(".box__logo .text__logo")
        mall_name = (
            logo_img.get("alt", "").strip()
            if logo_img and logo_img.get("alt")
            else (logo_text.get_text(strip=True) if logo_text else None)
        )
        price_tag = item.select_one(".box__price .sell-price .text__num")
        if not mall_name or not price_tag:
            continue

        price = int(price_tag.get_text(strip=True).replace(",", ""))
        is_lowest = item.select_one(".box__price.lowest") is not None
        delivery = item.select_one(".box__delivery")
        free_shipping = bool(delivery and "무료배송" in delivery.get_text())

        results.append(
            {
                "mall_name": mall_name,
                "price": price,
                "is_lowest": is_lowest,
                "free_shipping": free_shipping,
            }
        )

    return results


def get_products_to_crawl(limit: int | None) -> list[tuple[int, str]]:
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()
    query = """
        SELECT p.id, p.source_url
        FROM products p
        LEFT JOIN product_mall_prices m ON m.product_id = p.id
        WHERE m.id IS NULL AND p.source_url IS NOT NULL
        GROUP BY p.id, p.source_url
        ORDER BY p.id
    """
    if limit:
        query += f" LIMIT {int(limit)}"
    cur.execute(query)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def save_mall_prices(product_id: int, prices: list[dict]):
    if not prices:
        return
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()
    rows = [
        (product_id, p["mall_name"], p["price"], p["is_lowest"], p["free_shipping"])
        for p in prices
    ]
    execute_values(
        cur,
        """
        INSERT INTO product_mall_prices (product_id, mall_name, price, is_lowest, free_shipping)
        VALUES %s
        """,
        rows,
    )
    conn.commit()
    cur.close()
    conn.close()


def run(limit: int | None = None):
    targets = get_products_to_crawl(limit)
    log.info("가격비교 수집 대상: %d건", len(targets))

    for i, (product_id, source_url) in enumerate(targets):
        pcode = extract_pcode(source_url)
        if not pcode:
            continue
        try:
            prices = fetch_mall_prices(pcode)
            save_mall_prices(product_id, prices)
            log.info("[%d/%d] product_id=%s -> 쇼핑몰 %d곳", i + 1, len(targets), product_id, len(prices))
        except requests.RequestException as e:
            log.error("product_id=%s 요청 실패: %s (스킵)", product_id, e)

        time.sleep(REQUEST_DELAY_SECONDS)

    log.info("가격비교 수집 완료")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="테스트용으로 N건만 수집 (예: --limit 50)")
    args = parser.parse_args()
    run(limit=args.limit)
