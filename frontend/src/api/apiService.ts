const API_GATEWAY_URL = process.env.REACT_APP_API_GATEWAY_URL || 'http://localhost:8080';

export const placeOrder = async (orderData: { user_id: string; restaurant_id: string; items: string[] }) => {
  try {
    const response = await fetch(`${API_GATEWAY_URL}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to place order');
    }

    return await response.json();
  } catch (error) {
    console.error('Error placing order:', error);
    throw error;
  }
};

export const getOrderStatus = async (orderId: string) => {
  try {
    const response = await fetch(`${API_GATEWAY_URL}/orders/${orderId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch order status');
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching order ${orderId} status:`, error);
    throw error;
  }
};

export const getRestaurants = async () => {
  try {
    const response = await fetch(`${API_GATEWAY_URL}/restaurants`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch restaurants');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    throw error;
  }
};