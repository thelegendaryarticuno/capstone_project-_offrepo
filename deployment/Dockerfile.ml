# FastAPI ML service. Build context: repo root.
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY application/ml-service/requirements.txt .
# CPU-only torch first: the default Linux wheel pulls ~3 GB of CUDA libraries the service never uses
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu  && pip install --no-cache-dir -r requirements.txt
COPY application/ml-service/main.py .
# models/ is filled by scripts/fetch-models.ps1 before the build (see Jenkinsfile 'Fetch models')
COPY application/ml-service/models ./models

# `docker build --target test` runs the unit tests and fails the build on error
FROM base AS test
COPY application/ml-service/test_main.py .
RUN pip install --no-cache-dir pytest httpx && python -m pytest -q

FROM base AS runtime
RUN useradd -r -u 10001 app
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --retries=3 --start-period=90s CMD python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
