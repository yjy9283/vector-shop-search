package com.vectorshop.search.controller;

import com.vectorshop.search.dto.MallPriceDto;
import com.vectorshop.search.service.MallPriceService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class MallPriceController {

    private final MallPriceService mallPriceService;

    public MallPriceController(MallPriceService mallPriceService) {
        this.mallPriceService = mallPriceService;
    }

    /**
     * 상품별 쇼핑몰 최저가 비교 목록
     * GET /api/products/{productId}/prices
     */
    @GetMapping("/api/products/{productId}/prices")
    public List<MallPriceDto> getMallPrices(@PathVariable long productId) {
        return mallPriceService.getMallPrices(productId);
    }
}
