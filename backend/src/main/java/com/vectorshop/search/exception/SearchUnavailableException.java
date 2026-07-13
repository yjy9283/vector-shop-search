package com.vectorshop.search.exception;

/**
 * embedding-service 또는 Elasticsearch 호출 실패 시 던진다.
 * GlobalExceptionHandler가 503으로 변환한다.
 */
public class SearchUnavailableException extends RuntimeException {

    public SearchUnavailableException(String message) {
        super(message);
    }

    public SearchUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
