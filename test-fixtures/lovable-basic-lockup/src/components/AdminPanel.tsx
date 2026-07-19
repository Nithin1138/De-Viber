import React from 'react';
import { useAuth } from '../hooks/useAuth';

export function AdminPanel() {
  const { user } = useAuth();

  // Client-side-only admin check — no server enforcement!
  if (user.role === 'admin') {
    return (
      <div>
        <h1>Admin Dashboard</h1>
        <p>Secret admin content here</p>
      </div>
    );
  }

  return <p>Access denied</p>;
}
