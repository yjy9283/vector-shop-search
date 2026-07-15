package com.vectorshop.search.controller;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 프론트 카테고리 필터 드롭다운용 - 상품에 실제로 존재하는 카테고리 목록만 반환한다.
 */
@RestController
public class CategoryController {

    private final JdbcTemplate jdbcTemplate;

    public CategoryController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/api/categories")
    public List<String> categories() {
        String sql = """
                SELECT DISTINCT category
                FROM products
                WHERE category IS NOT NULL
                ORDER BY category
                """;
        return jdbcTemplate.queryForList(sql, String.class);
    }
}
