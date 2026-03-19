import React, { useState } from 'react';
import { getOrderStatus } from '../api/apiService';

const OrdersPage: React.FC = () => {
  const [orderId, setOrderId] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGetOrderStatus = async () => {
    setOrder(null);
    setMessage(null);
    setError(null);
    if (!orderId) {
      setError("Please enter an Order ID.");
      return;
    }
    try {
      const fetchedOrder = await getOrderStatus(orderId);
      setOrder(fetchedOrder);
      setMessage(`Order status for ${orderId} fetched successfully.`);
    } catch (err: any) {
      setError(err.message || `Failed to fetch order status for ${orderId}.`);
    }
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h2>Track Your Orders</h2>

      {/* Order Tracking Form */}
      <div style={{ marginTop: '30px', border: '1px solid #eee', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '100%', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3>Enter Order ID to Track</h3>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Order ID:</label>
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ width: 'calc(100% - 20px)', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <button
          onClick={handleGetOrderStatus}
          style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Track Order
        </button>

        {message && <p style={{ color: 'green', marginTop: '15px' }}>{message}</p>}
        {error && <p style={{ color: 'red', marginTop: '15px' }}>{error}</p>}
      </div>

      {/* Order Details Display */}
      {order && (
        <div style={{ marginTop: '30px', border: '1px solid #ccc', padding: '20px', width: '100%', maxWidth: '500px', borderRadius: '8px', textAlign: 'left' }}>
          <h3>Order Details for {order.order_id}</h3>
          <p><strong>Status:</strong> {order.status}</p>
          <p><strong>User ID:</strong> {order.user_id}</p>
          <p><strong>Restaurant ID:</strong> {order.restaurant_id}</p>
          <p><strong>Items:</strong> {order.items ? order.items.join(', ') : 'N/A'}</p>
          <p><strong>Created At:</strong> {order.created_at ? new Date(order.created_at._seconds * 1000).toLocaleString() : 'N/A'}</p>
          <p><strong>Updated At:</strong> {order.updated_at ? new Date(order.updated_at._seconds * 1000).toLocaleString() : 'N/A'}</p>
          {order.delivery_agent_id && <p><strong>Delivery Agent:</strong> {order.delivery_agent_id}</p>}
        </div>
      )}
    </div>
  );
};

export default OrdersPage;
