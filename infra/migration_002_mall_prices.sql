-- init.sql은 컨테이너 최초 생성시에만 실행되므로,
-- 이미 docker compose up을 한 번 실행한 상태라면 아래를 수동으로 적용해야 한다.
--
-- 실행 방법:
--   docker exec -i vss-postgres psql -U vss_user -d vector_shop < infra/migration_002_mall_prices.sql

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
