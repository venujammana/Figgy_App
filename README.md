# Figgy Food Delivery - A GCP Microservices Application (New Architecture)

This document provides a comprehensive guide to building and deploying the Figgy Food Delivery application based on the updated microservices architecture on Google Cloud Platform.

## Table of Contents
1.  [Architecture Overview](#1-architecture-overview)
2.  [Prerequisites](#2-prerequisites)
3.  [Project Setup & Configuration](#3-project-setup--configuration)
    *   [Enable APIs](#enable-apis)
    *   [IAM & Service Account Setup](#iam--service-account-setup)
    *   [Create GCP Resources](#create-gcp-resources)
    *   [GCP Setup Script](#gcp-setup-script)
4.  [Application Implementation](#4-application-implementation)
    *   [Project Directory Structure](#project-directory-structure)
    *   [Common Utilities](#common-utilities)
    *   [User Service (Cloud Run)](#user-service-cloud-run)
    *   [Order Processor (Cloud Run)](#order-processor-cloud-run)
    *   [Restaurant Service (Cloud Run)](#restaurant-service-cloud-run)
    *   [Delivery Orchestrator (Cloud Function)](#delivery-orchestrator-cloud-function)
    *   [Delivery Completion Service (Cloud Function)](#delivery-completion-service-cloud-function)
5.  [Continuous Integration/Continuous Deployment (CI/CD)](#5-continuous-integrationcontinuous-deployment-cicd)
    *   [Cloud Build Configuration](#cloud-build-configuration)
    *   [Skaffold Configuration](#skaffold-configuration)
6.  [Deployment Steps](#6-deployment-steps)
    *   [Initial GCP Setup](#initial-gcp-setup)
    *   [Deploy Services](#deploy-services)
    *   [API Gateway Setup](#api-gateway-setup)
7.  [Testing the End-to-End Flow](#7-testing-the-end-to-end-flow)

---

## 1. Architecture Overview

The system employs an event-driven, asynchronous microservices architecture to handle food order processing, as per the detailed diagram provided.

**Workflow:**
1.  A **User** initiates an order via **API Gateway**, which routes the request to the **User Service** (Flask on Cloud Run).
2.  The **User Service** publishes an `orders.place` event to a **Pub/Sub** topic.
3.  The **Order Processor** (a Cloud Run service configured for Pub/Sub Push) is triggered by the `orders.place` message. It validates the user and order data, creates the initial `pending` order in **Firestore**, and then publishes an `orders.created` event.
4.  The **Restaurant Service** (another Cloud Run service with Pub/Sub Push) consumes `orders.created` messages. It simulates assigning a restaurant and its decision to `accept` or `reject` the order. It updates the order status in Firestore and publishes either `orders.accepted` or `orders.rejected` events to dedicated **Pub/Sub** topics.
5.  Upon an `orders.accepted` event, the **Delivery Orchestrator** (an HTTP-triggered Cloud Function) is invoked (e.g., by a Pub/Sub subscriber that triggers it via HTTP, or directly by the Restaurant Service if an HTTP call is preferred). It simulates assigning a delivery agent, updates the order status to `out_for_delivery` in Firestore, and enqueues a **Cloud Task** to simulate the delivery duration.
6.  After a configured delay, the **Cloud Task** triggers the **Delivery Completion Service** (an HTTP-triggered Cloud Function). This function updates the order status to `delivered` in Firestore.
7.  Users can query the **User Service** to retrieve the latest status of their orders.

**Diagram:**
```
[User] -> [API Gateway] -> [User Service (Cloud Run)]
                              | (Publishes order.place)
                              v
                      [Pub/Sub: orders.place]
                              | (Triggers via Push Subscription)
                              v
                 +-----------------------+
                 | Order Processor       |  Cloud Run
                 | - Validates request   |
                 | - Creates order in Firestore |
                 | - Publishes orders.created |
                 +-----------+-----------+
                             | (Publishes orders.created)
                             v
                     [Pub/Sub: orders.created]
                             | (Triggers via Push Subscription)
                             v
                 +-----------------------+
                 | Restaurant Service    |  Cloud Run
                 | - Assigns restaurant  |
                 | - Accepts/Rejects (updates Firestore) |
                 | - Publishes orders.accepted/rejected |
                 +-----------+-----------+
                             |
             accepts -> v          v <- rejects
      [Pub/Sub: orders.accepted]   [Pub/Sub: orders.rejected]
                             |
                             v (Invokes HTTP Endpoint, e.g., via Cloud Function subscriber)
               +-----------------------+
               | Delivery Orchestrator |  Cloud Function (HTTP)
               | - Assigns delivery agent |
               | - Updates status (Firestore) |
               | - Creates Cloud Task  |
               +-----------+-----------+
                             | (Enqueues Task)
                             v
                     [Cloud Tasks Queue]
                             |
                             v (Triggers after delay via HTTP)
    [Delivery Completion Service (HTTP Cloud Function)]
                             |
                             v (Updates DB)
                       [Firestore] (collections: users, orders, restaurants)
```

---

## 2. Prerequisites

To set up and run the Figgy Food Delivery application, you will need the following installed and configured on your local machine:

*   **Google Cloud SDK (`gcloud` CLI):**
    This is the command-line interface for Google Cloud, essential for interacting with your GCP resources.
    *   **Installation:** Follow the official Google Cloud SDK installation guide for your operating system: [Install gcloud CLI](https://cloud.google.com/sdk/docs/install)
    *   **Initialization:** After installation, initialize the SDK: `gcloud init`

*   **Python 3.9+:**
    Python is required for running the backend microservices (Flask applications) and Cloud Functions.
    *   **Installation:**
        *   **Linux (Debian/Ubuntu):** `sudo apt update && sudo apt install python3.9 python3.9-venv python3-pip`
        *   **macOS (with Homebrew):** `brew install python@3.9`
        *   **Windows:** Download the installer from the [official Python website](https://www.python.org/downloads/). Ensure you add Python to your system PATH during installation.

*   **Docker:**
    Docker is essential for building and running the containerized Cloud Run services (both locally and for Cloud Build).
    *   **Installation:** Follow the official Docker installation guides for your operating system: [Get Docker](https://docs.docker.com/get-docker/)

*   **A Google Cloud Project with billing enabled:**
    This is a fundamental requirement for deploying and using any Google Cloud services.
    *   **Creation:** Create a new project via the [Google Cloud Console](https://console.cloud.google.com/).
    *   **Billing:** Ensure billing is enabled and linked to your project in the Cloud Console's "Billing" section.

---

## 3. Project Setup & Configuration

Replace `[YOUR_PROJECT_ID]` and `[YOUR_REGION]` (e.g., `us-central1`, `asia-east1`) in all commands.
Set your desired project and region:

```bash
gcloud config set project [YOUR_PROJECT_ID]
gcloud config set run/region [YOUR_REGION]
gcloud config set functions/region [YOUR_REGION]
```

### Enable APIs
All necessary GCP APIs can be enabled using the provided setup script.

### IAM & Service Account Setup
A dedicated service account with the principle of least privilege will be created and configured by the setup script.

### Create GCP Resources
Firestore, Pub/Sub topics, and Cloud Tasks Queue will be created by the setup script.

### GCP Setup Script (`setup_gcp.sh`)
This script automates the initial setup of your GCP project, including API enablement, service account creation, IAM role assignments, Firestore database creation, Pub/Sub topic setup, and Cloud Tasks queue creation.

```bash
#!/bin/bash

# Configuration variables - REPLACE WITH YOUR VALUES
PROJECT_ID="[YOUR_PROJECT_ID]"
REGION="[YOUR_REGION]" # e.g., us-central1
SERVICE_ACCOUNT_NAME="figgy-service-account"
SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# --- Project Setup ---
echo "Configuring gcloud project and region..."
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"
gcloud config set functions/region "$REGION"

# --- Enable necessary APIs ---
echo "Enabling required GCP APIs..."
gcloud services enable 
  run.googleapis.com 
  cloudfunctions.googleapis.com 
  cloudbuild.googleapis.com 
  pubsub.googleapis.com 
  firestore.googleapis.com 
  cloudtasks.googleapis.com 
  apigateway.googleapis.com 
  iam.googleapis.com 
  servicecontrol.googleapis.com 
  servicemanagement.googleapis.com 
  cloudresourcemanager.googleapis.com # Needed for policy bindings

# --- Service Account Setup ---
echo "Creating service account: ${SERVICE_ACCOUNT_NAME}..."
gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" 
  --display-name="Figgy Food Delivery Service Account" || true # '|| true' to ignore if already exists

echo "Assigning IAM roles to service account: ${SA_EMAIL}..."
# Common roles for all services
gcloud projects add-iam-policy-binding "$PROJECT_ID" 
  --member="serviceAccount:$SA_EMAIL" 
  --role="roles/datastore.user" --quiet

gcloud projects add-iam-policy-binding "$PROJECT_ID" 
  --member="serviceAccount:$SA_EMAIL" 
  --role="roles/pubsub.publisher" --quiet

# Roles specific to Pub/Sub Push subscribers (Cloud Run services)
gcloud projects add-iam-policy-binding "$PROJECT_ID" 
  --member="serviceAccount:$SA_EMAIL" 
  --role="roles/pubsub.subscriber" --quiet

# Role for Cloud Tasks to enqueue
gcloud projects add-iam-policy-binding "$PROJECT_ID" 
  --member="serviceAccount:$SA_EMAIL" 
  --role="roles/cloudtasks.enqueuer" --quiet

# Role for Cloud Tasks to invoke HTTP Cloud Function (OIDC token generation)
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" 
    --member="serviceAccount:$SA_EMAIL" 
    --role="roles/iam.serviceAccountUser" --quiet

# Role for Cloud Run services to invoke other services (e.g. Delivery Orchestrator) if using authenticated calls
gcloud projects add-iam-policy-binding "$PROJECT_ID" 
  --member="serviceAccount:$SA_EMAIL" 
  --role="roles/run.invoker" --quiet


# --- GCP Resource Creation ---
echo "Creating Firestore database..."
gcloud firestore databases create --location="$REGION" || true # '|| true' to ignore if already exists

echo "Creating Pub/Sub topics..."
gcloud pubsub topics create orders.place || true
gcloud pubsub topics create orders.created || true
gcloud pubsub topics create orders.accepted || true
gcloud pubsub topics create orders.rejected || true

echo "Creating Cloud Tasks queue: delivery-simulation-queue..."
gcloud tasks queues create delivery-simulation-queue --location="$REGION" || true

echo "GCP Setup Complete."
echo "Remember to update [YOUR_PROJECT_ID] and [YOUR_REGION] in this script before running."
echo "Also, ensure the 'Cloud Functions Developer', 'Artefact Registry Writer', and 'Storage Admin' roles are granted to the Google-managed service account for Cloud Build (service-[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com) for deploying Cloud Functions, pushing images to Artefact Registry, and deploying to Cloud Storage via Cloud Build."
```

---

## 4. Application Implementation

This section details the code for each microservice.

### Project Directory Structure
```
Figgy/
├── common/
│   ├── firestore_client.py
│   └── pubsub_client.py
├── user_service/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── order_processor/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── restaurant_service/
│   ├── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── delivery_orchestrator/
│   ├── main.py
│   └── requirements.txt
├── delivery_completion_service/
│   ├── main.py
│   └── requirements.txt
├── frontend/             # NEW: React UI application
│   ├── public/
│   ├── src/
│   ├── .env              # Environment variables for local dev
│   ├── package.json
│   ├── tsconfig.json
│   └── cloudbuild.yaml   # Cloud Build config for frontend deployment
├── openapi.yaml
├── cloudbuild.yaml
├── skaffold.yaml
└── setup_gcp.sh
```

### Frontend Application (React)

The frontend is a React application built with TypeScript, providing a rich user interface for interacting with the Figgy Food Delivery backend. It's designed to mimic food ordering platforms like Zomato or Swiggy.

**`Figgy/frontend/`**

This directory contains the React application.

#### Local Development

To run the frontend application locally:

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    The application will typically run on `http://localhost:3000`. It will attempt to connect to the backend services via the API Gateway URL configured in `.env`.

    ```bash
    npm start
    ```
    **Important:** Ensure the `REACT_APP_API_GATEWAY_URL` in `frontend/.env` points to your *deployed* API Gateway (or a proxy to it) if you want to interact with the deployed backend. For initial local testing with the backend also running locally, you might point it to `http://localhost:8080` (or wherever your backend serves).

#### Deployment to Google Cloud Storage

The frontend can be deployed as a static website to Google Cloud Storage and optionally served via Google Cloud CDN for optimal performance. A dedicated `cloudbuild.yaml` is provided within the `frontend/` directory for this purpose.

1.  **Ensure Cloud Storage API is enabled:** This is handled by the `setup_gcp.sh` script.
2.  **Ensure necessary IAM roles are granted:** The Cloud Build service account needs write permissions to the GCS bucket (`roles/storage.admin` or `roles/storage.objectAdmin`).
3.  **Deploy using Cloud Build:**
    Navigate to the root of the `Figgy_App` directory and submit the `frontend/cloudbuild.yaml`. You *must* provide the `_API_GATEWAY_URL` substitution with the URL of your deployed API Gateway.

    ```bash
    gcloud builds submit . --config frontend/cloudbuild.yaml \
      --substitutions=_API_GATEWAY_URL="https://[YOUR_API_GATEWAY_DOMAIN]"
    ```
    Replace `[YOUR_API_GATEWAY_DOMAIN]` with the `defaultHostname` obtained after setting up your API Gateway.

    After successful deployment, your frontend application will be available at `https://storage.googleapis.com/[YOUR_FRONTEND_BUCKET_NAME]/index.html` (where `[YOUR_FRONTEND_BUCKET_NAME]` defaults to `figgy-frontend-[YOUR_PROJECT_ID]`). For a custom domain or CDN setup, further GCP configuration is required.


### Common Utilities (`Figgy/common/`)

**`Figgy/common/firestore_client.py`**
```python
from google.cloud import firestore

def get_firestore_client():
    """Returns a Firestore client instance."""
    return firestore.Client()
```

**`Figgy/common/pubsub_client.py`**
```python
import os
from google.cloud import pubsub_v1

def get_pubsub_publisher_client():
    """Returns a Pub/Sub publisher client instance."""
    return pubsub_v1.PublisherClient()

def get_topic_path(project_id, topic_id):
    """Returns the full topic path for a given topic ID."""
    publisher = get_pubsub_publisher_client()
    return publisher.topic_path(project_id, topic_id)
```

### User Service (Cloud Run)
Handles initial order placement and status checks. Publishes to `orders.place`.

**`Figgy/user_service/requirements.txt`**
```
Flask==2.0.1
google-cloud-firestore==2.3.4
google-cloud-pubsub==2.8.0
gunicorn==20.1.0
```

**`Figgy/user_service/main.py`**
```python
import os
import uuid
import json
from flask import Flask, request, jsonify
from common.pubsub_client import get_pubsub_publisher_client, get_topic_path

PROJECT_ID = os.environ.get("GCP_PROJECT")
ORDERS_PLACE_TOPIC_ID = "orders.place"

publisher = get_pubsub_publisher_client()
orders_place_topic_path = get_topic_path(PROJECT_ID, ORDERS_PLACE_TOPIC_ID)

app = Flask(__name__)

@app.route("/orders", methods=["POST"])
def place_order():
    data = request.get_json()
    if not data or not data.get("user_id") or not data.get("restaurant_id") or not data.get("items"):
        return jsonify({"error": "Missing user_id, restaurant_id, or items"}), 400

    order_id = str(uuid.uuid4())
    order_payload = {
        "order_id": order_id,
        "user_id": data["user_id"],
        "restaurant_id": data["restaurant_id"],
        "items": data["items"],
        # Status will be set by Order Processor
    }

    try:
        # Publish order details to orders.place topic
        future = publisher.publish(orders_place_topic_path, json.dumps(order_payload).encode("utf-8"))
        future.result() # Wait for publish to complete
        print(f"Published initial order {order_id} to {ORDERS_PLACE_TOPIC_ID}")
    except Exception as e:
        print(f"Error publishing order {order_id}: {e}")
        return jsonify({"error": "Failed to place order due to publish error"}), 500

    # For status tracking, we'll immediately return the order ID.
    # The actual order will be created in Firestore by the Order Processor.
    return jsonify({"message": "Order initiated successfully", "order_id": order_id}), 202 # Accepted status

@app.route("/orders/<string:order_id>", methods=["GET"])
def get_order_status(order_id):
    from common.firestore_client import get_firestore_client # Import here to avoid circular dependency with app initialization
    db = get_firestore_client()

    order_ref = db.collection("orders").document(order_id)
    order = order_ref.get()

    if not order.exists:
        return jsonify({"error": "Order not found or still processing"}), 404

    return jsonify(order.to_dict()), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
```

**`Figgy/user_service/Dockerfile`**
```Dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Copy common utilities
COPY common /app/common

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
```

### Order Processor (Cloud Run)
Subscribes to `orders.place`, creates the Firestore entry, and publishes to `orders.created`.

**`Figgy/order_processor/requirements.txt`**
```
Flask==2.0.1
google-cloud-firestore==2.3.4
google-cloud-pubsub==2.8.0
gunicorn==20.1.0
```

**`Figgy/order_processor/main.py`**
```python
import os
import json
import base64
from flask import Flask, request, jsonify
from common.firestore_client import get_firestore_client
from common.pubsub_client import get_pubsub_publisher_client, get_topic_path
from google.cloud import firestore

PROJECT_ID = os.environ.get("GCP_PROJECT")
ORDERS_CREATED_TOPIC_ID = "orders.created"

db = get_firestore_client()
publisher = get_pubsub_publisher_client()
orders_created_topic_path = get_topic_path(PROJECT_ID, ORDERS_CREATED_TOPIC_ID)

app = Flask(__name__)

@app.route("/", methods=["POST"])
def process_order_place():
    envelope = request.get_json()
    if not envelope:
        return 'No Pub/Sub message received', 400
    
    if not isinstance(envelope, dict) or 'message' not in envelope:
        return 'Invalid Pub/Sub message format', 400

    pubsub_message = envelope['message']

    if 'data' in pubsub_message:
        message_data = base64.b64decode(pubsub_message['data']).decode('utf-8')
        order_payload = json.loads(message_data)
        
        order_id = order_payload.get("order_id")
        user_id = order_payload.get("user_id")
        restaurant_id = order_payload.get("restaurant_id")
        items = order_payload.get("items")

        if not all([order_id, user_id, restaurant_id, items]):
            print(f"Invalid order payload received: {order_payload}")
            return 'Invalid order payload', 400

        print(f"Processing order {order_id} from {ORDERS_PLACE_TOPIC_ID}")

        order_data = {
            "order_id": order_id,
            "user_id": user_id,
            "restaurant_id": restaurant_id,
            "items": items,
            "status": "pending", # Initial status after processing
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
        }

        # 1. Save order to Firestore
        db.collection("orders").document(order_id).set(order_data)
        print(f"Order {order_id} created in Firestore with status 'pending'.")

        # 2. Publish to orders.created topic
        try:
            future = publisher.publish(orders_created_topic_path, json.dumps({"order_id": order_id}).encode("utf-8"))
            future.result()
            print(f"Published order {order_id} to {ORDERS_CREATED_TOPIC_ID}")
        except Exception as e:
            print(f"Error publishing orders.created for {order_id}: {e}")
            # Consider rolling back Firestore or implementing dead-letter queue
            return jsonify({"error": "Failed to publish orders.created"}), 500

        return 'Order processed and published to orders.created', 200

    return 'No data in Pub/Sub message', 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
```

**`Figgy/order_processor/Dockerfile`**
```Dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Copy common utilities
COPY common /app/common

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
```

### Restaurant Service (Cloud Run)
Subscribes to `orders.created`, simulates acceptance/rejection, updates Firestore, and publishes to `orders.accepted` or `orders.rejected`.

**`Figgy/restaurant_service/requirements.txt`**
```
Flask==2.0.1
google-cloud-firestore==2.3.4
google-cloud-pubsub==2.8.0
gunicorn==20.1.0
```

**`Figgy/restaurant_service/main.py`**
```python
import os
import json
import base64
import random
from flask import Flask, request, jsonify
from common.firestore_client import get_firestore_client
from common.pubsub_client import get_pubsub_publisher_client, get_topic_path
from google.cloud import firestore

PROJECT_ID = os.environ.get("GCP_PROJECT")
ORDERS_ACCEPTED_TOPIC_ID = "orders.accepted"
ORDERS_REJECTED_TOPIC_ID = "orders.rejected"

db = get_firestore_client()
publisher = get_pubsub_publisher_client()
orders_accepted_topic_path = get_topic_path(PROJECT_ID, ORDERS_ACCEPTED_TOPIC_ID)
orders_rejected_topic_path = get_topic_path(PROJECT_ID, ORDERS_REJECTED_TOPIC_ID)

app = Flask(__name__)

@app.route("/", methods=["POST"])
def process_order_created():
    envelope = request.get_json()
    if not envelope:
        return 'No Pub/Sub message received', 400
    if not isinstance(envelope, dict) or 'message' not in envelope:
        return 'Invalid Pub/Sub message format', 400

    pubsub_message = envelope['message']

    if 'data' in pubsub_message:
        message_data = base64.b64decode(pubsub_message['data']).decode('utf-8')
        payload = json.loads(message_data)
        order_id = payload.get("order_id")

        if not order_id:
            print(f"Invalid order_id in payload: {payload}")
            return 'Invalid order_id', 400

        print(f"Restaurant processing order {order_id}")
        order_ref = db.collection("orders").document(order_id)
        order = order_ref.get()

        if not order.exists:
            print(f"Order {order_id} not found in Firestore. Ignoring.")
            return 'Order not found', 200 # Acknowledge message, idempotent

        current_status = order.to_dict().get("status")
        if current_status != "pending":
            print(f"Order {order_id} already in status '{current_status}'. Skipping restaurant decision.")
            return 'Order already processed by restaurant', 200

        # Simulate restaurant decision (e.g., 80% accept, 20% reject)
        if random.random() < 0.8:
            new_status = "accepted"
            publish_topic_path = orders_accepted_topic_path
            print(f"Restaurant accepted order {order_id}.")
        else:
            new_status = "rejected"
            publish_topic_path = orders_rejected_topic_path
            print(f"Restaurant rejected order {order_id}.")

        # Update Firestore
        order_ref.update({
            "status": new_status,
            "updated_at": firestore.SERVER_TIMESTAMP,
        })

        # Publish to appropriate topic
        try:
            future = publisher.publish(publish_topic_path, json.dumps({"order_id": order_id}).encode("utf-8"))
            future.result()
            print(f"Published order {order_id} status '{new_status}' to Pub/Sub.")
        except Exception as e:
            print(f"Error publishing order {order_id} status '{new_status}': {e}")
            # Consider error handling/dead-letter queue
            return jsonify({"error": f"Failed to publish {new_status} status"}), 500

        return 'Order decision processed', 200

    return 'No data in Pub/Sub message', 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
```

**`Figgy/restaurant_service/Dockerfile`**
```Dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Copy common utilities
COPY common /app/common

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
```

### Delivery Orchestrator (Cloud Function)
Invoked via HTTP (e.g., from a Pub/Sub subscriber to `orders.accepted`), assigns delivery, updates Firestore, and creates a Cloud Task.

**`Figgy/delivery_orchestrator/requirements.txt`**
```
google-cloud-firestore==2.3.4
google-cloud-tasks==2.7.2
functions-framework==3.*
```

**`Figgy/delivery_orchestrator/main.py`**
```python
import os
import json
from google.cloud import firestore, tasks_v2
from google.protobuf import timestamp_pb2
import datetime
from common.firestore_client import get_firestore_client # Using common client

PROJECT_ID = os.environ.get("GCP_PROJECT")
LOCATION_ID = os.environ.get("FUNCTION_REGION") # e.g. us-central1
QUEUE_ID = "delivery-simulation-queue"

# This URL will be for the 'delivery_completion_service' Cloud Function
DELIVERY_COMPLETION_URL = os.environ.get("DELIVERY_COMPLETION_URL") 

db = get_firestore_client()
tasks_client = tasks_v2.CloudTasksClient()

def orchestrate_delivery(request):
    """
    HTTP-triggered Cloud Function.
    Expects JSON payload with 'order_id'.
    Simulates assigning delivery and creates a Cloud Task.
    """
    request_json = request.get_json(silent=True)
    if not request_json or not request_json.get("order_id"):
        return jsonify({"error": "Missing order_id in request payload"}), 400

    order_id = request_json["order_id"]
    print(f"Orchestrating delivery for order: {order_id}")

    order_ref = db.collection("orders").document(order_id)
    order = order_ref.get()

    if not order.exists:
        print(f"Order {order_id} not found in Firestore. Cannot orchestrate delivery.")
        return jsonify({"error": "Order not found"}), 404

    current_status = order.to_dict().get("status")
    if current_status != "accepted":
        print(f"Order {order_id} is in status '{current_status}'. Expected 'accepted'. Skipping delivery orchestration.")
        return jsonify({"message": f"Order {order_id} not accepted, skipping delivery orchestration."}), 200


    # 1. Update status to 'out_for_delivery' and assign a simulated driver
    order_ref.update({
        "status": "out_for_delivery",
        "delivery_agent_id": f"agent_{str(abs(hash(order_id))) % 1000}",
        "updated_at": firestore.SERVER_TIMESTAMP,
    })
    print(f"Order {order_id} status updated to 'out_for_delivery'.")

    # 2. Create a Cloud Task to run after a delay (e.g., 1 minute)
    if not DELIVERY_COMPLETION_URL:
        print("DELIVERY_COMPLETION_URL environment variable not set. Cannot create Cloud Task.")
        return jsonify({"error": "DELIVERY_COMPLETION_URL not configured"}), 500

    task_parent = tasks_client.queue_path(PROJECT_ID, LOCATION_ID, QUEUE_ID)

    # Construct the task body
    payload = {"order_id": order_id}
    
    # Set the execution time for 1 minute from now
    in_one_minute = datetime.datetime.utcnow() + datetime.timedelta(minutes=1)
    timestamp = timestamp_pb2.Timestamp()
    timestamp.FromDatetime(in_one_minute)

    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": DELIVERY_COMPLETION_URL,
            "headers": {"Content-type": "application/json"},
            "body": json.dumps(payload).encode(),
            # The task must be authenticated to invoke the function
            "oidc_token": {
                "service_account_email": os.environ.get("SERVICE_ACCOUNT_EMAIL", f"figgy-service-account@{PROJECT_ID}.iam.gserviceaccount.com")
            },
        },
        "schedule_time": timestamp,
    }

    try:
        response = tasks_client.create_task(parent=task_parent, task=task)
        print(f"Created Cloud Task {response.name} for order {order_id} to trigger completion.")
    except Exception as e:
        print(f"Error creating Cloud Task for order {order_id}: {e}")
        return jsonify({"error": f"Failed to create Cloud Task: {e}"}), 500

    return jsonify({"message": "Delivery orchestration successful", "order_id": order_id}), 200
```

### Delivery Completion Service (Cloud Function)
Triggered by Cloud Task, updates order status to `delivered`.

**`Figgy/delivery_completion_service/requirements.txt`**
```
google-cloud-firestore==2.3.4
functions-framework==3.*
```

**`Figgy/delivery_completion_service/main.py`**
```python
import os
from common.firestore_client import get_firestore_client # Using common client
from google.cloud import firestore

db = get_firestore_client()

def complete_delivery(request):
    """
    HTTP-triggered function invoked by a Cloud Task.
    Updates the order status to 'delivered'.
    """
    data = request.get_json(silent=True)
    if not data or not data.get("order_id"):
        print("No order_id in request payload.")
        return "Bad Request: Missing order_id", 400

    order_id = data["order_id"]
    print(f"Received request to complete delivery for order: {order_id}")

    order_ref = db.collection("orders").document(order_id)
    order = order_ref.get()

    if not order.exists:
        print(f"Order {order_id} not found. Cannot complete delivery.")
        return "Order not found", 404
    
    current_status = order.to_dict().get("status")
    if current_status == "delivered":
        print(f"Order {order_id} already delivered. Skipping update.")
        return "Order already delivered", 200

    try:
        order_ref.update({"status": "delivered", "updated_at": firestore.SERVER_TIMESTAMP})
        print(f"Order {order_id} status updated to 'delivered'.")
        return "OK", 200
    except Exception as e:
        print(f"Error updating order {order_id}: {e}")
        return "Internal Server Error", 500
```

### Note on Running Services and Common Utilities

It's important to understand how different parts of this application are "run":
*   **Common Utilities (`Figgy/common/`):** These files contain reusable code (like Firestore or Pub/Sub client helpers). They are **not** standalone applications that you run directly. Instead, they are imported and used by the backend microservices and Cloud Functions.
*   **Backend Microservices (User Service, Order Processor, Restaurant Service, Delivery Orchestrator, Delivery Completion Service):** These are the core logic components of your application.
    *   **In Production:** These services are designed to be deployed to and managed by Google Cloud (Cloud Run for containerized services, Cloud Functions for serverless functions). Once deployed, Google Cloud automatically handles their execution, scaling, and lifecycle in response to HTTP requests, Pub/Sub messages, or Cloud Task triggers. You do **not** manually execute individual service files for the running application in the cloud.
    *   **For Local Development:** You can run these services on your local machine for testing and development purposes. For example, Flask applications can be run using `python main.py` (or `gunicorn`), and Cloud Functions can be emulated with the Functions Framework. Refer to each service's specific development setup if needed, though local deployment via Skaffold is generally preferred for Cloud Run services.

---

## 5. Automated Deployment (CI/CD)

This section details how to automate the build and deployment process using Google Cloud Build for continuous integration and continuous deployment, and how Skaffold can be used for local development.

### 5.1 Cloud Build for CI/CD

The `cloudbuild.yaml` file defines a comprehensive CI/CD pipeline. It automates the following for your microservices:
*   Building Docker images for Cloud Run services.
*   Pushing Docker images to Google Container Registry (GCR) or Artifact Registry.
*   Deploying Cloud Run services to the specified region.
*   Creating Pub/Sub push subscriptions for Cloud Run services.
*   Deploying Cloud Functions (Delivery Orchestrator and Delivery Completion Service).
*   Setting up environment variables for Cloud Functions, including the URL of the Delivery Completion Service.

To trigger an automated deployment using Cloud Build:

1.  **Ensure Cloud Build API is enabled:** This is handled by the `setup_gcp.sh` script.
2.  **Ensure necessary IAM roles are granted:** The Cloud Build service account (`service-[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`) needs appropriate permissions, including `Cloud Functions Developer` and `Service Account User` roles for deploying Cloud Functions. This is handled by the updated `setup_gcp.sh` script.
3.  **Submit the `cloudbuild.yaml`:**
    Navigate to the root of the `Figgy_App` directory and run the following command. Replace `[YOUR_REGION]` with your desired GCP region.

    ```bash
    gcloud builds submit --config cloudbuild.yaml . --substitutions=_REGION=[YOUR_REGION]
    ```
    This command will execute the entire pipeline defined in `cloudbuild.yaml`, building and deploying all Cloud Run services and Cloud Functions. You can monitor the build progress in the Cloud Build section of the GCP Console.

### 5.2 Skaffold for Local Development

`skaffold.yaml` is configured to facilitate local development workflows. Skaffold can watch for changes in your local code, automatically rebuild Docker images, and redeploy your Cloud Run services to a local or remote Kubernetes/Cloud Run environment. This provides a rapid feedback loop during development.

To use Skaffold:

1.  **Install Skaffold:** If you haven't already, install Skaffold by following the official documentation: [Skaffold Installation Guide](https://skaffold.dev/docs/install/)
2.  **Configure Skaffold:**
    Before running Skaffold, ensure `[YOUR_PROJECT_ID]` and `[YOUR_REGION]` are updated within the `skaffold.yaml` file.
3.  **Run Skaffold in development mode:**
    Navigate to the root of the `Figgy_App` directory and run:

    ```bash
    skaffold dev --port-forward
    ```
    This command will:
    *   Build Docker images for your Cloud Run services (`user-service`, `order-processor`, `restaurant-service`).
    *   Deploy them to Cloud Run (or a local Kubernetes cluster if configured).
    *   Forward ports, allowing you to access `user-service` locally on `localhost:8080`.
    *   Continuously watch your code for changes and redeploy automatically.

    *(Note: Skaffold does not directly support deploying Cloud Functions; these would still need to be deployed manually or via Cloud Build as described above.)*

---

## 6. Deployment Steps

This section outlines how to manually set up your GCP project and deploy the Figgy Food Delivery microservices.

### 6.1 Initial GCP Project Setup

Before deploying the application, you need to set up your Google Cloud Project.

1.  **Configure gcloud CLI:**
    Ensure your `gcloud` CLI is configured to the correct project and region. Replace `[YOUR_PROJECT_ID]` and `[YOUR_REGION]` with your actual project ID and desired GCP region (e.g., `us-central1`).

    ```bash
    gcloud config set project [YOUR_PROJECT_ID]
    gcloud config set run/region [YOUR_REGION]
    gcloud config set functions/region [YOUR_REGION]
    ```

2.  **Run the GCP Setup Script:**
    Navigate to the root of the `Figgy_App` directory and execute the `setup_gcp.sh` script. This script automates API enablement, service account creation, IAM role assignments, Firestore database creation, Pub/Sub topic setup, and Cloud Tasks queue creation.

    ```bash
    chmod +x setup_gcp.sh
    ./setup_gcp.sh
    ```
    **Important:** Before running, ensure you have reviewed and replaced `[YOUR_PROJECT_ID]` and `[YOUR_REGION]` within the `setup_gcp.sh` script itself, if you prefer to hardcode them. The script relies on these variables. Also, ensure the Cloud Build Service Account (`service-[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com`) has the `Cloud Functions Developer` role for Cloud Build to deploy Cloud Functions (this is handled by the updated `setup_gcp.sh`).

### 6.2 Manual Service Deployment

Follow these steps to manually deploy each service. Ensure you have activated your `gcloud` account and set the correct project and region as described in the "Initial GCP Project Setup" section.

#### 6.2.1 Deploy Cloud Run Services

Cloud Run services (User Service, Order Processor, Restaurant Service) are deployed as Docker containers.

1.  **Build and Push Docker Images (for each Cloud Run service):**
    For each of `user_service`, `order_processor`, and `restaurant_service`, navigate to its respective directory and build the Docker image. Then, push the image to Google Container Registry (GCR) or Artifact Registry. Replace `[YOUR_PROJECT_ID]` with your project ID and `[SERVICE_NAME]` (e.g., `user-service`, `order-processor`, `restaurant-service`).

    ```bash
    # Example for User Service
    cd user_service
    docker build -t gcr.io/[YOUR_PROJECT_ID]/user-service:latest .
    docker push gcr.io/[YOUR_PROJECT_ID]/user-service:latest
    cd .. # Go back to Figgy_App root

    # Repeat for order_processor and restaurant_service
    cd order_processor
    docker build -t gcr.io/[YOUR_PROJECT_ID]/order-processor:latest .
    docker push gcr.io/[YOUR_PROJECT_ID]/order-processor:latest
    cd ..

    cd restaurant_service
    docker build -t gcr.io/[YOUR_PROJECT_ID]/restaurant-service:latest .
    docker push gcr.io/[YOUR_PROJECT_ID]/restaurant-service:latest
    cd ..
    ```
    *(Note: For production, using Cloud Build to automate this process is recommended, as shown in Section 6.3 Automated Deployment.)*

2.  **Deploy Cloud Run Services:**
    Deploy each service to Cloud Run. Replace `[YOUR_PROJECT_ID]` and `[YOUR_REGION]` accordingly. The `--set-env-vars` option sets environment variables required by the services.

    *   **User Service:**
        ```bash
        gcloud run deploy user-service \
          --image gcr.io/[YOUR_PROJECT_ID]/user-service:latest \
          --platform managed \
          --region [YOUR_REGION] \
          --service-account="figgy-service-account@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
          --allow-unauthenticated \
          --set-env-vars="GCP_PROJECT=[YOUR_PROJECT_ID]"
        ```
        Take note of the `Service URL` output for the User Service; you will need it for the API Gateway setup.

    *   **Order Processor:**
        ```bash
        gcloud run deploy order-processor \
          --image gcr.io/[YOUR_PROJECT_ID]/order-processor:latest \
          --platform managed \
          --region [YOUR_REGION] \
          --service-account="figgy-service-account@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
          --no-allow-unauthenticated \
          --set-env-vars="GCP_PROJECT=[YOUR_PROJECT_ID]"
        ```
        After deploying the Order Processor, you need to create its Pub/Sub push subscription. Get the `Service URL` for the `order-processor` and use it below:

        ```bash
        SERVICE_URL=$(gcloud run services describe order-processor --platform managed --region [YOUR_REGION] --format 'value(status.url)')
        gcloud pubsub subscriptions create order-processor-sub \
          --topic orders.place \
          --push-endpoint "$SERVICE_URL" \
          --enable-wrapper-headers \
          --push-auth-service-account="figgy-service-account@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
          --ack-deadline=300 \
          --message-retention-duration=7d # Create or update
        ```

    *   **Restaurant Service:**
        ```bash
        gcloud run deploy restaurant-service \
          --image gcr.io/[YOUR_PROJECT_ID]/restaurant-service:latest \
          --platform managed \
          --region [YOUR_REGION] \
          --service-account="figgy-service-account@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
          --no-allow-unauthenticated \
          --set-env-vars="GCP_PROJECT=[YOUR_PROJECT_ID]"
        ```
        After deploying the Restaurant Service, create its Pub/Sub push subscription. Get the `Service URL` for the `restaurant-service` and use it below:

        ```bash
        SERVICE_URL=$(gcloud run services describe restaurant-service --platform managed --region [YOUR_REGION] --format 'value(status.url)')
        gcloud pubsub subscriptions create restaurant-service-sub \
          --topic orders.created \
          --push-endpoint "$SERVICE_URL" \
          --enable-wrapper-headers \
          --push-auth-service-account="figgy-service-account@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
          --ack-deadline=300 \
          --message-retention-duration=7d # Create or update
        ```

#### 6.2.2 Deploy Cloud Functions

Deploy the two Cloud Functions: `delivery-completion-service` and `delivery-orchestrator`.

1.  **Deploy Delivery Completion Service:**
    This function needs to be deployed first to obtain its URL, which is then used by the `delivery-orchestrator`.

    ```bash
    gcloud functions deploy delivery-completion-service \
      --runtime python39 \
      --trigger-http \
      --source ./delivery_completion_service \
      --entry-point complete_delivery \
      --region [YOUR_REGION] \
      --service-account="figgy-service-account@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
      --allow-unauthenticated # Cloud Tasks will handle auth via OIDC token
    ```
    Take note of the `https Trigger URL` from the output. We'll refer to this as `DELIVERY_COMPLETION_URL` for the next step.

2.  **Deploy Delivery Orchestrator:**
    Deploy the orchestrator, passing the `DELIVERY_COMPLETION_URL` as an environment variable.

    ```bash
    gcloud functions deploy delivery-orchestrator \
      --runtime python39 \
      --trigger-http \
      --source ./delivery_orchestrator \
      --entry-point orchestrate_delivery \
      --region "[YOUR_REGION]" \
      --service-account="figgy-service-account@[YOUR_PROJECT_ID].iam.gserviceaccount.com" \
      --no-allow-unauthenticated \
      --set-env-vars="DELIVERY_COMPLETION_URL=[PASTE_YOUR_DELIVERY_COMPLETION_URL_HERE],GCP_PROJECT=[YOUR_PROJECT_ID],FUNCTION_REGION=[YOUR_REGION],SERVICE_ACCOUNT_EMAIL=figgy-service-account@[YOUR_PROJECT_ID].iam.gserviceaccount.com"
    ```


### API Gateway Setup

**1. Create `Figgy/openapi.yaml`**
```yaml
swagger: '2.0'
info:
  title: Figgy Food Delivery API
  description: API for placing and tracking food orders.
  version: 1.0.0
schemes:
  - https
produces:
  - application/json
paths:
  /orders:
    post:
      summary: Place a new order
      operationId: placeOrder
      x-google-backend:
        address: [PASTE_YOUR_USER_SERVICE_URL_HERE]/orders
        # For authenticated calls from API Gateway to Cloud Run
        # audience: [PASTE_YOUR_USER_SERVICE_URL_HERE]
      responses:
        '202': # Accepted, as Order Processor handles creation asynchronously
          description: Order initiated
          schema:
            type: object
            properties:
              message:
                type: string
              order_id:
                type: string
  /orders/{order_id}:
    get:
      summary: Get order status
      operationId: getOrder
      parameters:
        - in: path
          name: order_id
          type: string
          required: true
      x-google-backend:
        address: [PASTE_YOUR_USER_SERVICE_URL_HERE]/orders/{order_id}
        # audience: [PASTE_YOUR_USER_SERVICE_URL_HERE]
      responses:
        '200':
          description: Order details
          schema:
            type: object
            properties:
              order_id: {type: string}
              user_id: {type: string}
              restaurant_id: {type: string}
              items: {type: array, items: {type: string}}
              status: {type: string}
              created_at: {type: string, format: date-time}
              updated_at: {type: string, format: date-time}
        '404':
          description: Order not found
```
**Replace `[PASTE_YOUR_USER_SERVICE_URL_HERE]` with the `Service URL` obtained after deploying the `user-service` Cloud Run.** The user-service was deployed with `--allow-unauthenticated`, so `audience` is not strictly required here, but good practice for internal services.

**2. Create API Config and Gateway**
```bash
# Create the API config
gcloud api-gateway api-configs create figgy-config 
  --api=figgy-api --openapi-spec=openapi.yaml 
  --project=[YOUR_PROJECT_ID] --region=[YOUR_REGION]

# Create the Gateway
gcloud api-gateway gateways create figgy-gateway 
  --api=figgy-api --api-config=figgy-config 
  --location=[YOUR_REGION] 
  --project=[YOUR_PROJECT_ID]
```
Take note of the `defaultHostname` from the output. This is your public API endpoint.

---

## 7. Testing the End-to-End Flow

Let `GATEWAY_URL` be the `defaultHostname` of your API Gateway.

**1. Place an Order**
```bash
curl -X POST "https://${GATEWAY_URL}/orders" 
-H "Content-Type: application/json" 
-d '{"user_id": "user123", "restaurant_id": "rest789", "items": ["pizza", "coke"]}'
```
This will return an `order_id` and a `202 Accepted` status. Copy the `order_id`.

**2. Check Order Status**
Check the status every 15-20 seconds. You should see it progress through the stages:
`pending` (after Order Processor) -> `accepted` or `rejected` (after Restaurant Service) -> `out_for_delivery` (after Delivery Orchestrator if accepted) -> `delivered` (after Delivery Completion Service).

```bash
# Example initial check (might be 404 until Order Processor creates it, then "pending")
curl "https://${GATEWAY_URL}/orders/[YOUR_ORDER_ID]"
```
```json
# Example response for "pending"
{
  "created_at": {
    "_seconds": 1678886400,
    "_nanoseconds": 0
  },
  "items": ["pizza", "coke"],
  "order_id": "YOUR_ORDER_ID",
  "restaurant_id": "rest789",
  "status": "pending",
  "updated_at": {
    "_seconds": 1678886400,
    "_nanoseconds": 0
  },
  "user_id": "user123"
}
```
Continue polling to observe status changes.

---

This completes the comprehensive guide for the Figgy Food Delivery application with the new architecture. You can now follow these steps to set up, deploy, and test the system.