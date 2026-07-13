package com.vectorshop.search.controller;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 프론트 기동 체크용. ES/임베딩서비스/DB 연결 상태를 각각 확인해서 반환한다.
 * (docs/PLAN.md 3장 API 명세 참고)
 */
@RestController
public class HealthController {

    private final ElasticsearchClient esClient;
    private final JdbcTemplate jdbcTemplate;
    private final WebClient embeddingWebClient;

    public HealthController(ElasticsearchClient esClient,
                             JdbcTemplate jdbcTemplate,
                             WebClient.Builder webClientBuilder,
                             @Value("${embedding-service.base-url}") String embeddingBaseUrl) {
        this.esClient = esClient;
        this.jdbcTemplate = jdbcTemplate;
        this.embeddingWebClient = webClientBuilder.baseUrl(embeddingBaseUrl).build();
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("elasticsearch", checkElasticsearch());
        status.put("embeddingService", checkEmbeddingService());
        status.put("database", checkDatabase());
        return status;
    }

    private boolean checkElasticsearch() {
        try {
            return esClient.ping().value();
        } catch (Exception e) {
            return false;
        }
    }

    private boolean checkEmbeddingService() {
        try {
            embeddingWebClient.get().uri("/health").retrieve().toBodilessEntity().block();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean checkDatabase() {
        try {
            Integer result = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            return result != null && result == 1;
        } catch (Exception e) {
            return false;
        }
    }
}
