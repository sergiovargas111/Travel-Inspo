import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pool from './db.js';
import { createUploadUrl, publicPhotoUrl } from './aws/s3.js';
import { addLike, getLikeCount } from './aws/dynamo.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/posts/upload-url', async (req, res) => {
  const { filename, contentType } = req.body;
  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename and contentType are required' });
  }

  try {
    const { uploadUrl, photoKey } = await createUploadUrl(filename, contentType);
    res.json({ uploadUrl, photoKey });
  } catch (err) {
    console.error('Failed to create upload URL:', err);
    res.status(500).json({ error: 'Failed to create upload URL' });
  }
});

app.post('/posts', async (req, res) => {
  const { caption, location, post_date, photo_key } = req.body;
  if (!post_date || !photo_key) {
    return res.status(400).json({ error: 'post_date and photo_key are required' });
  }

  const photoUrl = publicPhotoUrl(photo_key);

  try {
    const result = await pool.query(
      `INSERT INTO posts (caption, location, post_date, photo_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, caption, location, post_date, photo_url, thumbnail_url, created_at`,
      [caption ?? null, location ?? null, post_date, photoUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Failed to create post:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

app.get('/posts', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, caption, location, post_date, photo_url, thumbnail_url, created_at
       FROM posts ORDER BY post_date DESC`
    );

    const posts = await Promise.all(
      result.rows.map(async (post) => {
        try {
          const like_count = await getLikeCount(post.id);
          return { ...post, like_count };
        } catch {
          return { ...post, like_count: null };
        }
      })
    );

    res.json(posts);
  } catch (err) {
    console.error('Failed to fetch posts:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

app.get('/posts/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, caption, location, post_date, photo_url, thumbnail_url, created_at
       FROM posts WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Failed to fetch post:', err);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

app.post('/posts/:id/like', async (req, res) => {
  const userId = req.body.user_id || 'demo-user';
  try {
    await addLike(req.params.id, userId);
    const like_count = await getLikeCount(req.params.id);
    res.json({ liked: true, like_count });
  } catch (err) {
    console.error('Failed to like post:', err);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Travel Inspo API listening on http://localhost:${port}`);
});
