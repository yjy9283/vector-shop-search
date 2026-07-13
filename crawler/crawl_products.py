"""
다나와 통합검색(search.danawa.com/dsearch.php) 기반 상품 크롤러.

선정 이유 (docs/PLAN.md 1장 참고):
  - robots.txt가 일반 크롤러(User-agent: *)에게 명시적으로 열려 있음
  - 통합검색을 쓰면 카테고리 코드를 몰라도 키워드만으로 다양한 상품군(가전/PC주변기기/생활가전 등)을
    한 번에 수집할 수 있어, 여러 카테고리를 다양하게 모으기에 적합함
  - 상품명 + 짧은 소개(intro_text) + 상세 스펙(spec_list)까지 한 번에 나와서 임베딩용 텍스트가 풍부함

⚠️ robots.txt 준수사항 (반드시 지킬 것):
  - search.danawa.com robots.txt: Crawl-delay: 10 (요청 간 최소 10초 대기)
  - prod.danawa.com robots.txt: /api/, /community/, /list/ajax/, /info/ajax/ 접근 금지
    (이 크롤러는 해당 경로를 사용하지 않음)
"""

import os
import re
import time
import logging
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

PG_DSN = os.getenv("PG_DSN", "dbname=vector_shop user=vss_user password=vss_password host=localhost port=5432")
SEARCH_URL = "https://search.danawa.com/dsearch.php"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# search.danawa.com robots.txt의 Crawl-delay: 10 을 반드시 지킨다.
CRAWL_DELAY_SECONDS = 10

# 다양한 카테고리를 폭넓게 모으기 위한 키워드 목록.
# 필요에 따라 자유롭게 추가/수정해도 됨 (평가셋 다양성을 위해 카테고리를 고르게 섞는 게 좋음).
KEYWORDDS_DEFAULT = [
    "노트북", "스마트폰", "태블릿", "무선이어폰", "헤드폰", "스마트워치",
    "냉장고", "세탁기", "청소기", "로봇청소기", "에어컨", "공기청정기",
    "TV", "모니터", "키보드", "마우스", "게이밍의자", "프린터",
    "커피머신", "전기밥솥", "에어프라이어", "믹서기",
    "캠핑용품", "선풍기", "제습기",
]


def fetch_keyword(keyword: str) -> list[dict]:
    """다나와 통합검색 결과 페이지 1개에서 상품 목록을 파싱한다."""
    resp = requests.get(SEARCH_URL, params={"query": keyword}, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    products = []
    for item in soup.select("li.prod_item"):
        try:
            name_tag = item.select_one("p.prod_name a")
            if not name_tag:
                continue  # 광고 배너 등 상품이 아닌 블록은 스킵
            name = name_tag.get_text(strip=True)

            # pcode는 li id="productItem{pcode}" 에서 추출
            item_id = item.get("id", "")
            m = re.search(r"productItem(\d+)", item_id)
            if not m:
                continue
            pcode = m.group(1)

            # 가격은 hidden input min_price_{pcode} 에 콤마 없는 정수로 들어있음
            price_input = item.select_one(f'input[id="min_price_{pcode}"]')
            price = int(price_input["value"]) if price_input and price_input.get("value") else None

            # 카테고리: hidden input productItem_categoryInfo_{pcode} (예: "태블릿/휴대폰_헤드폰/이어폰")
            cat_input = item.select_one(f'input[id="productItem_categoryInfo_{pcode}"]')
            category = cat_input["value"].replace("_", " > ") if cat_input else keyword

            # 설명: 짧은 소개문(intro_text) 우선, 없으면 스펙 목록으로 대체
            intro_tag = item.select_one("div.prod_intro p.intro_text")
            spec_tag = item.select_one("div.spec-box .spec_list")
            description = (
                intro_tag.get_text(strip=True)
                if intro_tag
                else (spec_tag.get_text(" ", strip=True) if spec_tag else "")
            )

            img_tag = item.select_one(".thumb_image img")
            image_url = img_tag["src"] if img_tag else None

            products.append(
                {
                    "name": name,
                    "category": category,
                    "price": price,
                    "description": description,
                    "image_url": image_url,
                    "source_url": f"https://prod.danawa.com/info/?pcode={pcode}",
                }
            )
        except (AttributeError, KeyError, ValueError) as e:
            log.warning("상품 파싱 실패, 스킵: %s", e)
            continue

    return products


def save_to_postgres(products: list[dict]) -> int:
    """source_url 중복은 자동 스킵(ON CONFLICT DO NOTHING)."""
    if not products:
        return 0
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()
    rows = [
        (p["name"], p["category"], p["price"], p["description"], p["image_url"], p["source_url"])
        for p in products
    ]
    execute_values(
        cur,
        """
        INSERT INTO products (name, category, price, description, image_url, source_url)
        VALUES %s
        ON CONFLICT (source_url) DO NOTHING
        """,
        rows,
    )
    inserted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    return inserted


def run(keywords: list[str] = None):
    keywords = keywords or KEYWORDDS_DEFAULT
    total_inserted = 0

    for i, keyword in enumerate(keywords):
        log.info("[%d/%d] '%s' 검색 중...", i + 1, len(keywords), keyword)
        try:
            products = fetch_keyword(keyword)
            inserted = save_to_postgres(products)
            total_inserted += inserted
            log.info("  -> %d건 파싱, %d건 신규 저장 (누적 %d건)", len(products), inserted, total_inserted)
        except requests.RequestException as e:
            log.error("  -> 요청 실패: %s (스킵하고 계속)", e)

        if i < len(keywords) - 1:
            time.sleep(CRAWL_DELAY_SECONDS)  # robots.txt Crawl-delay 준수

    log.info("크롤링 완료. 총 신규 저장: %d건", total_inserted)


if __name__ == "__main__":
    run()
