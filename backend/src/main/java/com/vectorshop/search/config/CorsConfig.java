package com.vectorshop.search.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // 로컬 개발: React(Vite, 5173) -> Spring Boot(8080) 호출 허용
        // vite.config.js에서 /api 프록시를 쓰면 사실 CORS가 필요 없지만,
        // 프론트를 프록시 없이 직접 호출하는 경우를 대비해 명시적으로 열어둔다.
        registry.addMapping("/api/**")
                .allowedOrigins("http://localhost:5173")
                .allowedMethods("GET", "POST");
    }
}
