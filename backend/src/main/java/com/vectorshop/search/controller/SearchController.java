package com.vectorshop.search.controller;

import com.vectorshop.search.dto.SearchResultDto;
import com.vectorshop.search.service.SearchService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class SearchController {

    private final SearchService searchService;

    public SearchController(SearchService searchService) {
        this.searchService = searchService;
    }

    /**
     * 벡터(kNN) 검색
     * GET /api/search?q=나이키+운동화&topK=10
     */
    @GetMapping("/api/search")
    public List<SearchResultDto> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "10") int topK) {
        return searchService.vectorSearch(q, topK);
    }

    /**
     * 하이브리드 검색(BM25 + kNN 가중합) - 평가 비교용
     * GET /api/search/hybrid?q=나이키+운동화&topK=10
     */
    @GetMapping("/api/search/hybrid")
    public List<SearchResultDto> hybridSearch(
            @RequestParam String q,
            @RequestParam(defaultValue = "10") int topK) {
        return searchService.hybridSearch(q, topK);
    }

    /**
     * BM25 단독 검색 - 3종 비교 평가(BM25 vs 벡터 vs 하이브리드)의 기준선(baseline) 역할
     * GET /api/search/bm25?q=나이키+운동화&topK=10
     */
    @GetMapping("/api/search/bm25")
    public List<SearchResultDto> bm25Search(
            @RequestParam String q,
            @RequestParam(defaultValue = "10") int topK) {
        return searchService.bm25Search(q, topK);
    }
}
