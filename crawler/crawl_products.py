"""
쇼핑몰 상품 크롤러 뼈대 코드.

TODO:
  1. 크롤링 대상 쇼핑몰 확정 (robots.txt / 이용약관 확인 필수)
  2. requests+BeautifulSoup으로 우선 시도, JS 렌더링 필요 시 Selenium으로 전환
  3. 상품명 / 카테고리 / 가격 / 설명 / 이미지 URL 수집 후 save_to_postgres()로 저장
"""

import os
import psycopg2

PG_DSN = os.getenv("PG_DSN", "dbname=vector_shop user=vss_user password=vss_password host=localhost port=5432")


def fetch_product_list(page: int):
    """TODO: 대상 쇼핑몰의 상품 목록 페이지를 크롤링해서 dict 리스트로 반환"""
    raise NotImplementedError


def save_to_postgres(products: list[dict]):
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()
    for p in products:
        cur.execute(
            """
            INSERT INTO products (name, category, price, description, image_url, source_url)
            VALUES (%(name)s, %(category)s, %(price)s, %(description)s, %(image_url)s, %(source_url)s)
            """,
            p,
        )
    conn.commit()
    cur.close()
    conn.close()
    print(f"[PG] {len(products)}건 저장 완료")


if __name__ == "__main__":
    # TODO: 페이지네이션 순회하며 수집
    products = fetch_product_list(page=1)
    save_to_postgres(products)
