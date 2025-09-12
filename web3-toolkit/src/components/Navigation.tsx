import React from 'react';
import { NavLink } from 'react-router-dom';

const Navigation: React.FC = () => {
  return (
    <nav className="tabs">
      <NavLink 
        to="/generator" 
        className={({ isActive }) => isActive ? "active" : ""}
      >
        Calldata Generator
      </NavLink>
      <NavLink 
        to="/decoder" 
        className={({ isActive }) => isActive ? "active" : ""}
      >
        Smart Decoder
      </NavLink>
      <NavLink 
        to="/signatures" 
        className={({ isActive }) => isActive ? "active" : ""}
      >
        Signatures
      </NavLink>
      <NavLink 
        to="/builder" 
        className={({ isActive }) => isActive ? "active" : ""}
      >
        Transaction Builder
      </NavLink>
      <NavLink 
        to="/database" 
        className={({ isActive }) => isActive ? "active" : ""}
      >
        Signature Database
      </NavLink>
    </nav>
  );
};

export default Navigation;