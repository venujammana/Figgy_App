# Figgy Food Delivery - A GCP Microservices Application

This document provides a comprehensive guide to building, deploying, and troubleshooting the Figgy Food Delivery application on Google Cloud Platform.

## Table of Contents
1.  [Architecture Overview](#1-architecture-overview)
2.  [Prerequisites](#2-prerequisites)
3.  [Deployment](#3-deployment)
4.  [API Gateway Setup](#4-api-gateway-setup)
5.  [Testing the Application](#5-testing-the-application)
6.  [Troubleshooting](#6-troubleshooting)

---

## 1. Architecture Overview

The system uses a microservices architecture on Google Cloud, consisting of:
*   **API Gateway:** The single entry point for all external traffic. It routes requests to the appropriate backend service.
*   **Cloud Run Services:**
    *   `user-service`: A public-facing service that handles user-related requests like placing orders and checking status.
    *   `order-processor`: An internal service that processes new orders.
    *   `restaurant-service`: An internal service that handles restaurant-related logic.
*   **Cloud Functions:** For asynchronous tasks like delivery orchestration and completion.
*   **Pub/Sub:** For event-driven communication between services.
*   **Firestore:** As the database for storing order and user data.

**Important:** The `order-processor` and `restaurant-service` are internal and cannot be accessed directly from the internet. All requests must go through the API Gateway.

---

## 2. Prerequisites

*   **Google Cloud SDK (`gcloud` CLI):** Make sure you have the `gcloud` CLI installed and authenticated.
*   **A Google Cloud Project with billing enabled.**

---

## 3. Deployment

The recommended way to deploy the application is by using Google Cloud Build, which reads the `cloudbuild.yaml` file and automates the entire process.

1.  **Set your Project and Region:**
    ```bash
    gcloud config set project [YOUR_PROJECT_ID]
    gcloud config set run/region us-central1
    gcloud config set functions/region us-central1
    ```
    Replace `[YOUR_PROJECT_ID]` with your actual project ID.

2.  **Run the GCP Setup Script:**
    This script enables necessary APIs and sets up service accounts and permissions.
    ```bash
    chmod +x setup_gcp.sh
    ./setup_gcp.sh
    ```

3.  **Submit the build to Cloud Build:**
    This command will build and deploy all services. We provide a `COMMIT_SHA` substitution to ensure the build works correctly.
    ```bash
    gcloud builds submit . --config cloudbuild.yaml --substitutions=COMMIT_SHA=manual-deploy-$(date +%s),_REGION=us-central1
    ```
    This process can take several minutes. You can monitor the build progress in the Google Cloud Console.

---

## 4. API Gateway Setup

After the deployment is complete, you need to set up the API Gateway.

1.  **Get the `user-service` URL:**
    ```bash
    gcloud run services describe user-service --platform managed --region us-central1 --format 'value(status.url)'
    ```
    Copy the URL.

2.  **Update `openapi.yaml`:**
    Open `Figgy_App/openapi.yaml` and replace all instances of `[PASTE_YOUR_USER_SERVICE_URL_HERE]` with the URL you copied.

3.  **Enable API Gateway services:**
    ```bash
    gcloud services enable apigateway.googleapis.com servicemanagement.googleapis.com servicecontrol.googleapis.com
    ```

4.  **Create the API Gateway:**
    ```bash
    # Create the API
    gcloud api-gateway apis create figgy-api --project=[YOUR_PROJECT_ID]

    # Create the API Config
    gcloud api-gateway api-configs create figgy-api-config --api=figgy-api --project=[YOUR_PROJECT_ID] --openapi-spec=openapi.yaml

    # Create the Gateway
    gcloud api-gateway gateways create figgy-gateway --api=figgy-api --api-config=figgy-api-config --location=us-central1 --project=[YOUR_PROJECT_ID]
    ```

5.  **Get the API Gateway URL:**
    ```bash
    gcloud api-gateway gateways describe figgy-gateway --location=us-central1 --project=[YOUR_PROJECT_ID] --format 'value(defaultHostname)'
    ```
    This will be your public API endpoint.

---

## 5. Testing the Application

Let `GATEWAY_URL` be the `defaultHostname` of your API Gateway.

**1. Place an Order:**
```bash
curl -X POST "https://${GATEWAY_URL}/orders" \
-H "Content-Type: application/json" \
-d '{"user_id": "user123", "restaurant_id": "rest789", "items": ["pizza", "coke"]}'
```
This will return an `order_id` and a `202 Accepted` status. Copy the `order_id`.

**2. Check Order Status:**
```bash
curl "https://${GATEWAY_URL}/orders/[YOUR_ORDER_ID]"
```

**3. List Restaurants:**
```bash
curl "https://${GATEWAY_URL}/restaurants"
```

---

## 6. Troubleshooting

### "Service Unavailable" or 503 Errors from `user-service`

If you see `503 Service Unavailable` errors when accessing the `user-service` directly, it's likely due to a dependency issue. We have fixed this by upgrading `Flask` in `user_service/requirements.txt`. If you encounter similar issues, check the logs of the service:
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=user-service AND severity>=ERROR" --project [YOUR_PROJECT_ID] --limit 10
```

### "Forbidden" or 403 Errors

If you try to access `order-processor` or `restaurant-service` directly via their URLs, you will get a "Forbidden" error. This is expected, as these services are internal and can only be accessed through the API Gateway or by other internal services.
