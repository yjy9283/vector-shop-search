package com.vectorshop.search.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import com.vectorshop.search.dto.SearchResultDto;
import com.vectorshop.search.exception.SearchUnavailableException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientException;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class SearchService {

    private static final String INDEX = "products";

    private final ElasticsearchClient esClient;
    private final WebClient embeddingWebClient;
    private final JdbcTemplate jdbcTemplate;

    public SearchService(ElasticsearchClient esClient,
                          WebClient.Builder webClientBuilder,
                          @Value("${embedding-service.base-url}") String embeddingBaseUrl,
                          JdbcTemplate jdbcTemplate) {
        this.esClient = esClient;
        this.embeddingWebClient = webClientBuilder.baseUrl(embeddingBaseUrl).build();
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<SearchResultDto> vectorSearch(String queryText, int topK, String category, Integer minPrice, Integer maxPrice) {
        List<Query> filters = buildFilters(category, minPrice, maxPrice);
        if (queryText == null || queryText.isBlank()) {
            requireFilters(filters);
            return browseSearch(topK, filters);
        }
        List<Float> vector = embedQuery(queryText);
        try {
            SearchResponse<Map> response = esClient.search(s -> s
                            .index(INDEX)
                            .knn(k -> k
                                    .field("embedding")
                                    .queryVector(vector)
                                    .k(topK)
                                    .numCandidates(Math.max(topK * 10, 50))
                                    .filter(filters))
                            .size(topK),
                    Map.class);
            return toResults(response);
        } catch (IOException e) {
            throw new SearchUnavailableException("검색 서비스에 일시적인 문제가 있어요.", e);
        }
    }

    public List<SearchResultDto> hybridSearch(String queryText, int topK, String category, Integer minPrice, Integer maxPrice) {
        List<Query> filters = buildFilters(category, minPrice, maxPrice);
        if (queryText == null || queryText.isBlank()) {
            requireFilters(filters);
            return browseSearch(topK, filters);
        }
        List<Float> vector = embedQuery(queryText);
        try {
            SearchResponse<Map> response = esClient.search(s -> s
                            .index(INDEX)
                            .knn(k -> k
                                    .field("embedding")
                                    .queryVector(vector)
                                    .k(topK)
                                    .numCandidates(Math.max(topK * 10, 50))
                                    .filter(filters))
                            .query(q -> q
                                    .bool(b -> b
                                            .must(m -> m.multiMatch(mm -> mm
                                                    .query(queryText)
                                                    .fields("name^2", "description")))
                                            .filter(filters)))
                            .size(topK),
                    Map.class);
            return toResults(response);
        } catch (IOException e) {
            throw new SearchUnavailableException("검색 서비스에 일시적인 문제가 있어요.", e);
        }
    }

    /**
     * BM25 단독 검색 - name(korean_analyzer), description 필드 대상 match 쿼리.
     * 평가 3종 비교(BM25 / 벡터 / 하이브리드)의 baseline이므로 반드시 구현할 것.
     * (docs/PLAN.md 6장 평가 방법론 참고)
     */
    public List<SearchResultDto> bm25Search(String queryText, int topK, String category, Integer minPrice, Integer maxPrice) {
        List<Query> filters = buildFilters(category, minPrice, maxPrice);
        if (queryText == null || queryText.isBlank()) {
            requireFilters(filters);
            return browseSearch(topK, filters);
        }
        try {
            SearchResponse<Map> response = esClient.search(s -> s
                            .index(INDEX)
                            .query(q -> q
                                    .bool(b -> b
                                            .must(m -> m.multiMatch(mm -> mm
                                                    .query(queryText)
                                                    .fields("name^2", "description")))
                                            .filter(filters)))
                            .size(topK),
                    Map.class);
            return toResults(response);
        } catch (IOException e) {
            throw new SearchUnavailableException("검색 서비스에 일시적인 문제가 있어요.", e);
        }
    }

    /**
     * category(정확 일치)와 price 범위를 ES bool filter절로 변환한다.
     * filter절은 스코어링에 영향을 주지 않고 후보군만 좁혀서, 벡터/BM25/하이브리드 세 검색 다
     * 동일한 조건으로 공정하게 비교되도록 한다.
     */
    private List<Query> buildFilters(String category, Integer minPrice, Integer maxPrice) {
        List<Query> filters = new ArrayList<>();
        if (category != null && !category.isBlank()) {
            filters.add(Query.of(q -> q.term(t -> t.field("category").value(category))));
        }
        if (minPrice != null || maxPrice != null) {
            filters.add(Query.of(q -> q.range(r -> r.number(n -> {
                n.field("price");
                if (minPrice != null) {
                    n.gte(minPrice.doubleValue());
                }
                if (maxPrice != null) {
                    n.lte(maxPrice.doubleValue());
                }
                return n;
            }))));
        }
        return filters;
    }

    /**
     * 검색어 없이 카테고리/가격 필터만으로 상품을 둘러보는 모드.
     * 벡터/BM25/하이브리드를 가를 텍스트 쿼리가 없으므로 세 엔드포인트 모두
     * 동일하게 match_all + filter 결과를 반환한다(순위를 매길 텍스트/벡터가 없어서 당연함).
     */
    private List<SearchResultDto> browseSearch(int topK, List<Query> filters) {
        try {
            SearchResponse<Map> response = esClient.search(s -> s
                            .index(INDEX)
                            .query(q -> q.bool(b -> b.filter(filters)))
                            .size(topK),
                    Map.class);
            return toResults(response);
        } catch (IOException e) {
            throw new SearchUnavailableException("검색 서비스에 일시적인 문제가 있어요.", e);
        }
    }

    private void requireFilters(List<Query> filters) {
        if (filters.isEmpty()) {
            throw new IllegalArgumentException("검색어를 입력하거나 필터를 선택해주세요.");
        }
    }

    private List<Float> embedQuery(String queryText) {
        EmbedResponse res;
        try {
            res = embeddingWebClient.post()
                    .uri("/embed")
                    .bodyValue(new EmbedRequest(List.of(queryText)))
                    .retrieve()
                    .bodyToMono(EmbedResponse.class)
                    .block();
        } catch (WebClientException e) {
            throw new SearchUnavailableException("검색 서비스에 일시적인 문제가 있어요.", e);
        }
        if (res == null || res.embeddings() == null || res.embeddings().isEmpty()) {
            throw new SearchUnavailableException("검색 서비스에 일시적인 문제가 있어요.");
        }
        return res.embeddings().get(0);
    }

    @SuppressWarnings("unchecked")
    private List<SearchResultDto> toResults(SearchResponse<Map> response) {
        List<Map<String, Object>> sources = new ArrayList<>();
        List<Double> scores = new ArrayList<>();
        for (Hit<Map> hit : response.hits().hits()) {
            Map<String, Object> source = hit.source();
            if (source == null) {
                continue;
            }
            sources.add(source);
            scores.add(hit.score() == null ? 0.0 : hit.score());
        }

        List<String> productIds = sources.stream().map(s -> String.valueOf(s.get("product_id"))).toList();
        Map<String, String> sourceUrls = fetchSourceUrls(productIds);

        List<SearchResultDto> results = new ArrayList<>();
        for (int i = 0; i < sources.size(); i++) {
            Map<String, Object> source = sources.get(i);
            String productId = productIds.get(i);
            results.add(new SearchResultDto(
                    productId,
                    (String) source.get("name"),
                    (String) source.get("category"),
                    source.get("price") == null ? null : ((Number) source.get("price")).intValue(),
                    (String) source.get("image_url"),
                    scores.get(i),
                    sourceUrls.get(productId)
            ));
        }
        return results;
    }

    /**
     * ES 인덱스엔 source_url이 없어서(색인 당시 안 넣었음) Postgres에서 배치 조회한다.
     * 카드 클릭 시 다나와 원본 상품 페이지로 이동할 수 있게 하기 위함.
     */
    private Map<String, String> fetchSourceUrls(List<String> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Long[] ids = productIds.stream().map(Long::valueOf).toArray(Long[]::new);
        String sql = "SELECT id, source_url FROM products WHERE id = ANY(?)";
        Map<String, String> urlsById = new HashMap<>();
        jdbcTemplate.query(
                sql,
                ps -> ps.setArray(1, ps.getConnection().createArrayOf("bigint", ids)),
                (RowCallbackHandler) rs -> urlsById.put(String.valueOf(rs.getLong("id")), rs.getString("source_url"))
        );
        return urlsById;
    }

    private record EmbedRequest(List<String> texts) {
    }

    private record EmbedResponse(List<List<Float>> embeddings, int dim) {
    }
}
