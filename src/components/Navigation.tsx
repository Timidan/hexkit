import React from 'react';
import { NavLink } from 'react-router-dom';
import { SearchIcon } from './icons/IconLibrary';

const Navigation: React.FC = () => {
  return (
    <nav className="tabs">
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
      <NavLink 
        to="/contract-search" 
        className={({ isActive }) => isActive ? "active" : ""}
      >
        <SearchIcon width={16} height={16} style={{ marginRight: '4px' }} />
        Contract Search
      </NavLink>
    </nav>
  );
};

export default Navigation;