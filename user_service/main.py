import os
import uuid
import json
from flask import Flask, request, jsonify
from common.pubsub_client import get_pubsub_publisher_client, get_topic_path
from google.cloud import firestore

PROJECT_ID = os.environ.get("GCP_PROJECT")
ORDERS_PLACE_TOPIC_ID = "orders.place"

publisher = get_pubsub_publisher_client()
orders_place_topic_path = get_topic_path(PROJECT_ID, ORDERS_PLACE_TOPIC_ID)

app = Flask(__name__)

# Mock restaurant data for demonstration
RESTAURANT_DATA = {
    "rest789": {
        "name": "Burger Joint",
        "description": "Best burgers in town!",
        "menu": [
            {"id": "item1", "name": "Classic Burger", "price": 10.99},
            {"id": "item2", "name": "Cheese Burger", "price": 12.99},
            {"id": "item3", "name": "Fries", "price": 3.49},
            {"id": "item4", "name": "Coke", "price": 2.50},
        ],
        "address": "123 Burger St",
        "cuisine": "American"
    },
    "rest101": {
        "name": "Pizza Palace",
        "description": "Authentic Italian pizzas.",
        "menu": [
            {"id": "item5", "name": "Margherita Pizza", "price": 15.00},
            {"id": "item6", "name": "Pepperoni Pizza", "price": 16.50},
            {"id": "item7", "name": "Garlic Bread", "price": 4.00},
        ],
        "address": "456 Pizza Ave",
        "cuisine": "Italian"
    }
}

@app.route("/restaurants", methods=["GET"])
def list_restaurants():
    """Returns a list of all available restaurants."""
    restaurants_list = [
        {"id": r_id, "name": data["name"], "description": data["description"], "cuisine": data["cuisine"]}
        for r_id, data in RESTAURANT_DATA.items()
    ]
    return jsonify(restaurants_list), 200

@app.route("/restaurants/<string:restaurant_id>", methods=["GET"])
def get_restaurant_details(restaurant_id):
    """Returns details and menu for a specific restaurant."""
    restaurant = RESTAURANT_DATA.get(restaurant_id)
    if not restaurant:
        return jsonify({"error": "Restaurant not found"}), 404
    return jsonify(restaurant), 200


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