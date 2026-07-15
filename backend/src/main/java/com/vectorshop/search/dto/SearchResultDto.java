package com.vectorshop.search.dto;

public record SearchResultDto(
        String productId,
        String name,
        String category,
        Integer price,
        String imageUrl,
        double score, // 유사도 점수 - 프론트에서 표시해 성능 체감할 수 있게
        String sourceUrl // 다나와 원본 상품 페이지 - 카드 클릭 시 새 탭으로 열기 위함
) {
}
