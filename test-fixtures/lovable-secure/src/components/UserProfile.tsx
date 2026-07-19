import React from 'react';

// This component only shows UI — role check for display only
// Actual auth is enforced by RLS policies in the database
export function UserProfile({ user }: { user: { name: string } }) {
  return (
    <div>
      <h1>Welcome, {user.name}</h1>
    </div>
  );
}
