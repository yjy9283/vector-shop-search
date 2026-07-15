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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SearchService {

    private static final String INDEX = "products";
    // Reciprocal Rank Fusion 상수 - 원 논문(Cormack et al., 2009) 및 업계 관례상 k=60이 표준값.
    // 벡터(코사인 0~1)와 BM25(수십 단위) 점수를 그냥 더하면 스케일이 안 맞아서 BM25가 사실상
    // 전부 지배해버리는 문제가 있었음 - 순위(rank)만 보는 RRF는 두 검색의 점수 스케일과 무관하게
    // 공정하게 섞인다.
    private static final double RRF_K = 60.0;
    private static final int RRF_POOL_SIZE = 50;

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

    /**
     * 벡터(kNN)와 BM25를 Reciprocal Rank Fusion(RRF)으로 결합한다.
     * 예전엔 ES 하나의 요청에 knn절+query절을 같이 넣어서 점수를 단순 합산했는데,
     * 코사인(0~1)과 BM25(수십)의 스케일 차이 때문에 BM25가 매치되기만 하면 사실상
     * BM25 순위 그대로 나오는 문제가 있었다(직접 확인: "노트북" 쿼리에서 하이브리드
     * 점수가 BM25 점수와 소수점까지 동일했음). RRF는 원점수가 아니라 "몇 등이었는가"만
     * 보므로 스케일 문제 자체가 없다.
     */
    public List<SearchResultDto> hybridSearch(String queryText, int topK, String category, Integer minPrice, Integer maxPrice) {
        List<Query> filters = buildFilters(category, minPrice, maxPrice);
        if (queryText == null || queryText.isBlank()) {
            requireFilters(filters);
            return browseSearch(topK, filters);
        }
        List<Float> vector = embedQuery(queryText);
        try {
            SearchResponse<Map> vectorResponse = esClient.search(s -> s
                            .index(INDEX)
                            .knn(k -> k
                                    .field("embedding")
                                    .queryVector(vector)
                                    .k(RRF_POOL_SIZE)
                                    .numCandidates(Math.max(RRF_POOL_SIZE * 10, 50))
                                    .filter(filters))
                            .size(RRF_POOL_SIZE),
                    Map.class);
            SearchResponse<Map> bm25Response = esClient.search(s -> s
                            .index(INDEX)
                            .query(q -> q
                                    .bool(b -> b
                                            .must(m -> m.multiMatch(mm -> mm
                                                    .query(queryText)
                                                    .fields("name^2", "description")))
                                            .filter(filters)))
                            .size(RRF_POOL_SIZE),
                    Map.class);
            return fuseRrf(vectorResponse, bm25Response, topK);
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
     * category(대분류 단독이면 prefix, "대분류 > 소분류" 전체면 정확 일치)와 price 범위를
     * ES bool filter절로 변환한다. filter절은 스코어링에 영향을 주지 않고 후보군만 좁혀서,
     * 벡터/BM25/하이브리드 세 검색 다 동일한 조건으로 공정하게 비교되도록 한다.
     */
    private List<Query> buildFilters(String category, Integer minPrice, Integer maxPrice) {
        List<Query> filters = new ArrayList<>();
        if (category != null && !category.isBlank()) {
            if (category.contains(">")) {
                filters.add(Query.of(q -> q.term(t -> t.field("category").value(category))));
            } else {
                // 대분류만 선택된 경우 - "대분류 > 소분류" 전체를 대상으로 prefix 매칭한다.
                String prefix = category.trim() + " >";
                filters.add(Query.of(q -> q.prefix(p -> p.field("category").value(prefix))));
            }
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
        List<String> productIds = new ArrayList<>();
        Map<String, Map<String, Object>> sourceById = new LinkedHashMap<>();
        Map<String, Double> scoreById = new HashMap<>();
        for (Hit<Map> hit : response.hits().hits()) {
            Map<String, Object> source = hit.source();
            if (source == null) {
                continue;
            }
            String productId = String.valueOf(source.get("product_id"));
            productIds.add(productId);
            sourceById.put(productId, source);
            scoreById.put(productId, hit.score() == null ? 0.0 : hit.score());
        }
        return buildResults(productIds, sourceById, scoreById);
    }

    /**
     * 벡터 결과와 BM25 결과 두 순위 목록을 RRF 점수로 합쳐서 상위 topK를 뽑는다.
     * RRF(d) = sum(1 / (RRF_K + rank_in_list)) - 문서가 한쪽 목록에만 있으면 그쪽 항만 더해진다.
     */
    @SuppressWarnings("unchecked")
    private List<SearchResultDto> fuseRrf(SearchResponse<Map> vectorResponse, SearchResponse<Map> bm25Response, int topK) {
        Map<String, Map<String, Object>> sourceById = new LinkedHashMap<>();
        Map<String, Double> rrfById = new HashMap<>();

        List<Hit<Map>> vectorHits = vectorResponse.hits().hits();
        for (int i = 0; i < vectorHits.size(); i++) {
            Map<String, Object> source = vectorHits.get(i).source();
            if (source == null) {
                continue;
            }
            String productId = String.valueOf(source.get("product_id"));
            sourceById.put(productId, source);
            rrfById.merge(productId, 1.0 / (RRF_K + i + 1), Double::sum);
        }
        List<Hit<Map>> bm25Hits = bm25Response.hits().hits();
        for (int i = 0; i < bm25Hits.size(); i++) {
            Map<String, Object> source = bm25Hits.get(i).source();
            if (source == null) {
                continue;
            }
            String productId = String.valueOf(source.get("product_id"));
            sourceById.putIfAbsent(productId, source);
            rrfById.merge(productId, 1.0 / (RRF_K + i + 1), Double::sum);
        }

        List<String> rankedIds = rrfById.entrySet().stream()
                .sorted(Map.Entry.<String, Double>comparingByValue().reversed())
                .map(Map.Entry::getKey)
                .limit(topK)
                .toList();

        return buildResults(rankedIds, sourceById, rrfById);
    }

    /**
     * ES 응답(들)에서 뽑은 productId/원본 필드/점수를 Postgres 최신 메타(source_url, image_url)와
     * 합쳐 최종 응답 DTO 목록을 만든다.
     */
    private List<SearchResultDto> buildResults(
            List<String> productIds,
            Map<String, Map<String, Object>> sourceById,
            Map<String, Double> scoreById
    ) {
        Map<String, ProductMeta> metaById = fetchProductMeta(productIds);

        List<SearchResultDto> results = new ArrayList<>();
        for (String productId : productIds) {
            Map<String, Object> source = sourceById.get(productId);
            ProductMeta meta = metaById.get(productId);
            // image_url은 재크롤링으로 계속 갱신될 수 있어서(embedding-service/scripts/index_to_es.py의
            // build_text()가 image_url을 안 쓰므로 재색인 없이 값이 바뀜) ES가 아니라 Postgres의
            // 최신 값을 우선한다. ES 색인 당시 값은 최후 fallback으로만 쓴다.
            String imageUrl = meta != null && meta.imageUrl() != null ? meta.imageUrl() : (String) source.get("image_url");
            results.add(new SearchResultDto(
                    productId,
                    (String) source.get("name"),
                    (String) source.get("category"),
                    source.get("price") == null ? null : ((Number) source.get("price")).intValue(),
                    imageUrl,
                    scoreById.getOrDefault(productId, 0.0),
                    meta == null ? null : meta.sourceUrl()
            ));
        }
        return results;
    }

    /**
     * ES 인덱스엔 source_url이 없고 image_url은 색인 시점 값이라 오래될 수 있어서,
     * 매 요청마다 Postgres에서 최신 값을 배치 조회한다. 카드 클릭 시 다나와 원본 페이지로
     * 이동하고, 재크롤링한 실제 썸네일이 재색인 없이 바로 반영되게 하기 위함.
     */
    private Map<String, ProductMeta> fetchProductMeta(List<String> productIds) {
        if (productIds.isEmpty()) {
            return Map.of();
        }
        Long[] ids = productIds.stream().map(Long::valueOf).toArray(Long[]::new);
        String sql = "SELECT id, source_url, image_url FROM products WHERE id = ANY(?)";
        Map<String, ProductMeta> metaById = new HashMap<>();
        jdbcTemplate.query(
                sql,
                ps -> ps.setArray(1, ps.getConnection().createArrayOf("bigint", ids)),
                (RowCallbackHandler) rs -> metaById.put(
                        String.valueOf(rs.getLong("id")),
                        new ProductMeta(rs.getString("source_url"), rs.getString("image_url"))
                )
        );
        return metaById;
    }

    private record ProductMeta(String sourceUrl, String imageUrl) {
    }

    private record EmbedRequest(List<String> texts) {
    }

    private record EmbedResponse(List<List<Float>> embeddings, int dim) {
    }
}
