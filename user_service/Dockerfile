FROM python:3.9-slim
WORKDIR /app
# Copy service-specific requirements
COPY user_service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Copy common utilities
COPY common /app/common
# Copy service-specific code
COPY user_service/main.py .

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
