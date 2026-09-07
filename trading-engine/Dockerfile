FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY engine ./engine

ENV PYTHONUNBUFFERED=1
EXPOSE 8088

CMD ["python", "-m", "engine.app"]
