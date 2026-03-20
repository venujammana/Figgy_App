FROM python:3.9-slim
WORKDIR /app/restaurant_service # Change WORKDIR to be specific to the service
COPY common /app/common # Copy common to a shared location

# Copy service-specific requirements relative to original context
COPY restaurant_service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy service-specific code relative to original context
COPY restaurant_service/main.py ./main.py

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
