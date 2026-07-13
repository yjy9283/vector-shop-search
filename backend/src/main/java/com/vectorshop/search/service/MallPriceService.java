package com.vectorshop.search.service;

import com.vectorshop.search.dto.MallPriceDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class MallPriceService {

    private final JdbcTemplate jdbcTemplate;

    public MallPriceService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * product_id 기준 쇼핑몰별 최저가 목록. 가격 오름차순(최저가 먼저) 정렬.
     * crawler/crawl_mall_prices.py 가 채워둔 product_mall_prices 테이블을 그대로 조회한다.
     */
    public List<MallPriceDto> getMallPrices(long productId) {
        String sql = """
                SELECT mall_name, price, is_lowest, free_shipping
                FROM product_mall_prices
                WHERE product_id = ?
                ORDER BY price ASC
                """;
        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> new MallPriceDto(
                        rs.getString("mall_name"),
                        rs.getInt("price"),
                        rs.getBoolean("is_lowest"),
                        rs.getBoolean("free_shipping")
                ),
                productId
        );
    }
}
