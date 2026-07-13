# 기본 Elasticsearch 이미지에는 한국어 형태소 분석기(nori)가 없다.
# BM25 vs 벡터 검색 비교 실험의 공정성을 위해 nori 플러그인을 반드시 추가해야 한다.
# (nori 없이 standard analyzer만 쓰면 "나이키운동화"처럼 띄어쓰기가 붙은 경우
#  형태소 분리가 안 되어 BM25 쪽이 불리하게 평가되고, 실험 결과 자체가 왜곡된다.)

FROM docker.elastic.co/elasticsearch/elasticsearch:8.15.0

RUN bin/elasticsearch-plugin install --batch analysis-nori
