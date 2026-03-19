import React, { useState, useEffect } from 'react';
import { placeOrder, getRestaurants } from '../api/apiService';

interface Restaurant {
  id: string;
  name: string;
  description: string;
  cuisine: string;
}

const HomePage: React.FC = () => {
  const [userId, setUserId] = useState('user123'); // Default user for testing
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(''); // Selected restaurant for order
  const [items, setItems] = useState(''); // Comma-separated items
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const data = await getRestaurants();
        setRestaurants(data);
        if (data.length > 0) {
          setSelectedRestaurantId(data[0].id); // Select first restaurant by default
        }
      } catch (err: any) {
        setFetchError(err.message || 'Failed to fetch restaurants.');
      }
    };
    fetchRestaurants();
  }, []);

  const handlePlaceOrder = async () => {
    setMessage(null);
    setError(null);
    try {
      const itemsArray = items.split(',').map(item => item.trim()).filter(item => item.length > 0);
      if (!userId || !selectedRestaurantId || itemsArray.length === 0) {
        setError("Please fill in all fields.");
        return;
      }

      const orderData = { user_id: userId, restaurant_id: selectedRestaurantId, items: itemsArray };
      const response = await placeOrder(orderData);
      setMessage(`Order initiated successfully! Order ID: ${response.order_id}`);
    } catch (err: any) {
      setError(err.message || "Failed to place order.");
    }
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h2>Welcome to Figgy Food Delivery!</h2>
      <p>Browse restaurants and order your favorite food.</p>

      {/* Restaurant Listings */}
      <div style={{ marginTop: '30px', border: '1px solid #eee', padding: '20px', borderRadius: '8px', maxWidth: '800px', width: '100%', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3>Available Restaurants</h3>
        {fetchError && <p style={{ color: 'red' }}>{fetchError}</p>}
        {restaurants.length === 0 && !fetchError && <p>Loading restaurants...</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' }}>
          {restaurants.map(restaurant => (
            <div
              key={restaurant.id}
              style={{
                border: `2px solid ${selectedRestaurantId === restaurant.id ? '#007bff' : '#ddd'}`,
                borderRadius: '8px',
                padding: '15px',
                cursor: 'pointer',
                backgroundColor: selectedRestaurantId === restaurant.id ? '#e7f3ff' : '#fff',
                transition: 'all 0.3s ease',
              }}
              onClick={() => setSelectedRestaurantId(restaurant.id)}
            >
              <h4>{restaurant.name}</h4>
              <p style={{ fontSize: '0.9em', color: '#555' }}>{restaurant.cuisine} - {restaurant.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Order Placement Form */}
      <div style={{ marginTop: '50px', border: '1px solid #eee', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '100%', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3>Place a New Order</h3>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>User ID:</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ width: 'calc(100% - 20px)', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Selected Restaurant:</label>
          <select
            value={selectedRestaurantId}
            onChange={(e) => setSelectedRestaurantId(e.target.value)}
            style={{ width: 'calc(100% - 20px)', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            {restaurants.map(restaurant => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name} ({restaurant.cuisine})
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Items (comma-separated, e.g., item1,item2):</label>
          <input
            type="text"
            value={items}
            onChange={(e) => setItems(e.target.value)}
            style={{ width: 'calc(100% - 20px)', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          />
        </div>
        <button
          onClick={handlePlaceOrder}
          style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Place Order
        </button>

        {message && <p style={{ color: 'green', marginTop: '15px' }}>{message}</p>}
        {error && <p style={{ color: 'red', marginTop: '15px' }}>{error}</p>}
      </div>
    </div>
  );
};

export default HomePage;
