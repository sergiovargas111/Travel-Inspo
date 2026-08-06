CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL DEFAULT 'demo-user',
    caption TEXT,
    location VARCHAR(120),
    post_date DATE NOT NULL,
    photo_url TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
