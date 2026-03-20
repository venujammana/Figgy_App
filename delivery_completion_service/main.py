import os
from flask import Flask, request
from common.firestore_client import get_firestore_client
from google.cloud import firestore

app = Flask(__name__)
# Initialize db as None globally, it will be lazily initialized
db = None

@app.route("/", methods=["POST"])
def complete_delivery_endpoint():
    """
    HTTP-triggered function invoked by a Cloud Task.
    Updates the order status to 'delivered'.
    """
    global db
    if db is None:
        db = get_firestore_client()

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

def cloud_function_entrypoint(request_obj):
    """
    Wrapper function to serve the Flask app as a Cloud Function.
    The functions-framework expects a callable function, not a Flask app object.
    """
    with app.test_request_context(
        path=request_obj.path,
        method=request_obj.method,
        headers=request_obj.headers,
        data=request_obj.data,
        query_string=request_obj.query_string
    ):
        return app.full_dispatch_request()
