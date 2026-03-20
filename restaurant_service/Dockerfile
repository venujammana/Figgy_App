FROM python:3.9-slim
WORKDIR /app

# Copy common utilities to /app/common
COPY common /app/common

# Copy service-specific requirements
COPY restaurant_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy service-specific code
COPY restaurant_service/main.py ./main.py

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
