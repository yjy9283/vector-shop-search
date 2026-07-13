package com.vectorshop.search.service;

import com.vectorshop.search.dto.SearchResultDto;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * TODO 구현 순서:
 * 1. WebClient로 embedding-service의 POST /embed 호출 -> 쿼리 텍스트를 1024차원 벡터로 변환
 * 2. Elasticsearch Java Client로 knn 쿼리 실행 (index: products, field: embedding)
 * 3. hybridSearch()는 kNN + BM25(match on name/description)를 rank fusion으로 결합
 *    (참고: ES 8.x는 kNN + query를 동시에 넣으면 자동으로 조합 가능)
 */
@Service
public class SearchService {

    public List<SearchResultDto> vectorSearch(String queryText, int topK) {
        // TODO: 1) queryText -> embedding-service 호출 -> 벡터
        //       2) ES knn 검색 실행
        throw new UnsupportedOperationException("구현 예정");
    }

    public List<SearchResultDto> hybridSearch(String queryText, int topK) {
        // TODO: BM25(match) + knn 결합 쿼리
        throw new UnsupportedOperationException("구현 예정");
    }

    /**
     * BM25 단독 검색 - name(korean_analyzer), description 필드 대상 match 쿼리.
     * 평가 3종 비교(BM25 / 벡터 / 하이브리드)의 baseline이므로 반드시 구현할 것.
     * (docs/PLAN.md 6장 평가 방법론 참고)
     */
    public List<SearchResultDto> bm25Search(String queryText, int topK) {
        // TODO: ES multi_match 쿼리 (fields: name^2, description)
        throw new UnsupportedOperationException("구현 예정");
    }
}
