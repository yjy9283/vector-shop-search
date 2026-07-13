"""
BGE-M3 임베딩 전용 FastAPI 서버

- Spring Boot 백엔드가 검색어(query)를 이 서비스로 보내면 dense vector로 변환해서 돌려준다.
- 배치 색인 스크립트(scripts/index_to_es.py)에서도 동일 모델을 재사용한다.
"""

from fastapi import FastAPI
from pydantic import BaseModel
from FlagEmbedding import BGEM3FlagModel

app = FastAPI(title="BGE-M3 Embedding Service")

# 최초 로딩 시간이 걸리므로 서버 기동 시 한 번만 로드
# devices="cpu" 명시: FlagEmbedding이 MPS 가용 여부만 보고 자동 선택하는데,
# 이 환경은 torch.backends.mps.is_available()=True이면서도 torch.mps.device_count()가 없어 충돌함 (torch 2.2.2)
model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True, devices="cpu")


class EmbedRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dim: int


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    """
    dense vector만 사용 (sparse/colbert는 필요 시 확장).
    BGE-M3 출력 차원은 1024.
    """
    output = model.encode(
        req.texts,
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
    )
    dense_vecs = output["dense_vecs"]
    return EmbedResponse(
        embeddings=[vec.tolist() for vec in dense_vecs],
        dim=len(dense_vecs[0]) if len(dense_vecs) > 0 else 0,
    )


@app.get("/health")
def health():
    return {"status": "ok"}
