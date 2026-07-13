package com.vectorshop.search.dto;

public record MallPriceDto(
        String mallName,
        int price,
        boolean isLowest,
        boolean freeShipping
) {
}
