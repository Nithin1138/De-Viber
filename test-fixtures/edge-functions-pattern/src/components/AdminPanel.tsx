import React from 'react';
import { useAuth } from '../hooks/useAuth';

export function AdminPanel() {
  const { user } = useAuth();

  // Client-side check for UI display only
  // Actual enforcement is in the edge function
  if (user.role === 'admin') {
    return (
      <div>
        <h1>Admin Dashboard</h1>
        <p>Content loaded from authenticated edge function</p>
      </div>
    );
  }

  return <p>Access denied</p>;
}
