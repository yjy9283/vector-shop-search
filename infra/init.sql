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
