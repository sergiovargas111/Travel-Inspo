const API_BASE = 'http://localhost:3000';
const USER_ID = 'demo-user';

const app = document.getElementById('app');

function thumbUrl(post) {
  return post.photo_url.replace('/originals/', '/thumbnails/');
}

function withThumbFallback(imgEl, post) {
  imgEl.src = thumbUrl(post);
  imgEl.onerror = () => {
    imgEl.onerror = null;
    imgEl.src = post.photo_url;
  };
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed`);
  return res.json();
}

function renderError(message) {
  app.innerHTML = `<div class="error-banner">${message}</div>`;
}

async function renderFeed() {
  app.innerHTML = '<p>Loading feed…</p>';
  try {
    const posts = await apiGet('/posts');
    if (posts.length === 0) {
      app.innerHTML = `
        <div class="empty-state">
          <p>No posts yet. Be the first to share a trip!</p>
          <a href="#upload" class="btn-primary">+ New Post</a>
        </div>`;
      return;
    }

    app.innerHTML = '<div class="feed"></div>';
    const feed = app.querySelector('.feed');

    for (const post of posts) {
      const card = document.createElement('a');
      card.href = `#post/${post.id}`;
      card.className = 'card';

      const img = document.createElement('img');
      withThumbFallback(img, post);

      card.innerHTML = `
        <div class="card-body">
          <p class="card-caption">${post.caption ?? ''}</p>
          <p class="card-meta">${post.location ?? ''} · ${formatDate(post.post_date)}</p>
          <p class="card-likes">♥ ${post.like_count ?? 0}</p>
        </div>`;
      card.prepend(img);
      feed.appendChild(card);
    }
  } catch (err) {
    console.error(err);
    renderError('Could not load the feed. Is the API running?');
  }
}

async function renderDetail(id) {
  app.innerHTML = '<p>Loading post…</p>';
  try {
    const post = await apiGet(`/posts/${id}`);

    app.innerHTML = `
      <a href="#" class="back-link">&larr; Back to feed</a>
      <div class="detail">
        <img />
        <div class="detail-body">
          <h2>${post.caption ?? ''}</h2>
          <p class="detail-meta">${post.location ?? ''} · ${formatDate(post.post_date)}</p>
          <button class="like-btn">♥ Like (<span class="like-count">0</span>)</button>
        </div>
      </div>`;

    withThumbFallback(app.querySelector('.detail img'), post);

    const likeBtn = app.querySelector('.like-btn');
    const likeCountEl = app.querySelector('.like-count');

    const counts = await apiGet('/posts').then(
      (posts) => posts.find((p) => p.id === post.id)?.like_count ?? 0
    );
    likeCountEl.textContent = counts;

    likeBtn.addEventListener('click', async () => {
      likeBtn.disabled = true;
      try {
        const result = await apiPost(`/posts/${id}/like`, { user_id: USER_ID });
        likeCountEl.textContent = result.like_count;
        likeBtn.classList.add('liked');
      } catch (err) {
        console.error(err);
        alert('Could not like this post.');
      } finally {
        likeBtn.disabled = false;
      }
    });
  } catch (err) {
    console.error(err);
    renderError('Could not load this post.');
  }
}

function renderUpload() {
  app.innerHTML = `
    <a href="#" class="back-link">&larr; Back to feed</a>
    <form class="form">
      <h2>New Post</h2>
      <label for="photo">Photo</label>
      <input type="file" id="photo" accept="image/*" required />

      <label for="caption">Caption</label>
      <input type="text" id="caption" placeholder="Sunset in Oia" />

      <label for="location">Location</label>
      <input type="text" id="location" placeholder="Santorini, Greece" />

      <label for="post_date">Date</label>
      <input type="date" id="post_date" required />

      <button type="submit">Post</button>
    </form>`;

  const form = app.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('photo');
    const file = fileInput.files[0];
    if (!file) return;

    const submitBtn = form.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading…';

    try {
      const { uploadUrl, photoKey } = await apiPost('/posts/upload-url', {
        filename: file.name,
        contentType: file.type,
      });

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error('S3 upload failed');

      const post = await apiPost('/posts', {
        caption: document.getElementById('caption').value,
        location: document.getElementById('location').value,
        post_date: document.getElementById('post_date').value,
        photo_key: photoKey,
      });

      window.location.hash = `#post/${post.id}`;
    } catch (err) {
      console.error(err);
      alert('Upload failed. Check the console for details.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post';
    }
  });
}

function router() {
  const hash = window.location.hash;
  const detailMatch = hash.match(/^#post\/(\d+)$/);

  if (hash === '#upload') {
    renderUpload();
  } else if (detailMatch) {
    renderDetail(detailMatch[1]);
  } else {
    renderFeed();
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
