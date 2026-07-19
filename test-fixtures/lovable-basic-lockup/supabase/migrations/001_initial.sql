-- Create users table without RLS
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now()
);

-- Create posts table without RLS
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  user_id uuid REFERENCES users(id),
  created_at timestamp with time zone DEFAULT now()
);

-- No ALTER TABLE ... ENABLE ROW LEVEL SECURITY for either table!
