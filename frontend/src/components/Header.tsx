import React from 'react';
import { Link } from 'react-router-dom';

const Header: React.FC = () => {
  return (
    <header className="App-header" style={{ padding: '20px', background: '#282c34', color: 'white', textAlign: 'center' }}>
      <h1>Figgy Food Delivery</h1>
      <nav>
        <Link to="/" style={{ color: 'white', margin: '0 10px' }}>Home</Link>
        <Link to="/orders" style={{ color: 'white', margin: '0 10px' }}>My Orders</Link>
        {/* Add more navigation links as needed */}
      </nav>
    </header>
  );
};

export default Header;