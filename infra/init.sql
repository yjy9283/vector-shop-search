-- 상품 원본 데이터 테이블
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(500) NOT NULL,
    category VARCHAR(200),
    price INTEGER,
    description TEXT,
    image_url TEXT,
    source_url TEXT,
    crawled_at TIMESTAMP DEFAULT NOW(),
    -- 임베딩 완료 여부 (embedding-service가 처리 후 true로 갱신)
    embedded BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_products_embedded ON products (embedded);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);

-- 쇼핑몰별 최저가 비교 데이터 (다나와 상품 상세페이지에서 크롤링)
CREATE TABLE IF NOT EXISTS product_mall_prices (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    mall_name VARCHAR(100) NOT NULL,
    price INTEGER NOT NULL,
    is_lowest BOOLEAN DEFAULT FALSE,
    free_shipping BOOLEAN DEFAULT FALSE,
    crawled_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mall_prices_product_id ON product_mall_prices (product_id);
