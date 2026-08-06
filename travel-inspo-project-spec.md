# Travel Inspo — MVP Project Spec

A simple travel-photo posting app used as a hands-on learning project for AWS: **S3, Lambda, RDS, DynamoDB, ECS (Fargate)**.

This doc is written to be handed to Claude Code as a build brief. Give Claude Code this file and say "build this, step by step, starting with local dev before touching AWS."

---

## 1. What we're building

**Core loop only:**
1. User uploads a travel photo (photo + caption + location + date)
2. User sees a feed/timeline of posted travel pics
3. User clicks a post to view it full-size
4. User can "like" a post

No auth system needed for v1 (use a hardcoded/mock `user_id`). No sharing, no comments, no notifications, no auto-tagging. Those are v2+.

---

## 2. Architecture overview

```
Client (simple web frontend)
        │
        ▼
  ECS Fargate (API container)
   Node/Express or Python/FastAPI
        │
        ├──► RDS Postgres      (posts table)
        ├──► DynamoDB          (likes table)
        └──► S3                (photo storage, via presigned URL)
                    │
                    ▼
             Lambda (S3 trigger)
                    │
                    ▼
           writes thumbnail back to S3
```

**Upload flow:**
1. Client asks API for a presigned S3 upload URL
2. Client uploads photo directly to S3 using that URL
3. Client tells API "photo uploaded, here's the caption/location/date" → API writes a row to RDS with the `photo_url`
4. S3 upload event triggers Lambda → Lambda creates a thumbnail → writes it to S3 (e.g. `thumbnails/` prefix) → updates the RDS row with `thumbnail_url` (or the API polls/updates it)

**Like flow:**
1. Client calls `POST /posts/:id/like`
2. API writes `{post_id, user_id}` to DynamoDB

---

## 3. AWS services and why each exists

| Service | Role | Why this service specifically |
|---|---|---|
| **S3** | Stores original photos + generated thumbnails | Object storage is the right tool for binary files; don't put images in a relational DB |
| **Lambda** | Triggered on S3 `ObjectCreated` event, resizes image into a thumbnail | Classic event-driven use case — reacts to a file landing in a bucket, no server needed |
| **RDS (Postgres)** | Stores structured post data (one table) | Relational fit for structured records with clear fields; easy to query/sort by date |
| **DynamoDB** | Stores likes (post_id + user_id pairs) | Simple key-based access pattern, high write potential — good non-relational use case, kept intentionally decoupled from RDS |
| **ECS (Fargate)** | Runs the API as a container | Practice with container deployment/orchestration instead of 100% serverless |

---

## 4. Data models

### RDS — Postgres table: `posts`

```sql
CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL DEFAULT 'demo-user',
    caption TEXT,
    location VARCHAR(120),
    post_date DATE NOT NULL,
    photo_url TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

*(`location` is a free-text field for v1 — e.g. "Lisbon, Portugal" or "Banff National Park." No geocoding/map pins until v2.)*

### DynamoDB — table: `likes`

- **Partition key:** `post_id` (String or Number, matching RDS `id`)
- **Sort key:** `user_id` (String)
- No other attributes needed for v1.

This makes "has user X liked post Y" a single fast lookup, and "get all likes for post Y" a single query — the natural DynamoDB access pattern.

### S3 — bucket layout

```
travel-inspo-photos-bucket/
  originals/{post_id or uuid}.jpg
  thumbnails/{post_id or uuid}.jpg
```

---

## 5. API endpoints (the only 5 you need)

### `POST /posts/upload-url`
Returns a presigned S3 URL so the client can upload directly to S3.
- **Request:** `{ "filename": "santorini.jpg", "contentType": "image/jpeg" }`
- **Response:** `{ "uploadUrl": "https://...", "photoKey": "originals/uuid.jpg" }`

### `POST /posts`
Creates a post record after the photo is uploaded to S3.
- **Request:** `{ "caption": "Sunset in Oia", "location": "Santorini, Greece", "post_date": "2023-07-04", "photo_key": "originals/uuid.jpg" }`
- **Response:** the created post row (id, caption, location, date, photo_url, thumbnail_url: null initially)

### `GET /posts`
Returns the feed, sorted by `post_date DESC`.
- **Response:** array of post objects, each optionally annotated with `like_count` (fetched from DynamoDB)

### `GET /posts/:id`
Returns a single post's full detail (used for the "click to view" screen).

### `POST /posts/:id/like`
Writes a like to DynamoDB.
- **Request:** `{ "user_id": "demo-user" }` (hardcoded for v1)
- **Response:** `{ "liked": true, "like_count": N }`

---

## 6. Lambda function: thumbnail generator

- **Trigger:** S3 `ObjectCreated` event on the `originals/` prefix
- **Runtime:** Node.js or Python (Sharp for Node, Pillow for Python)
- **Logic:**
  1. Read the uploaded image from S3
  2. Resize to a thumbnail (e.g. 300px wide)
  3. Write to `thumbnails/{same-filename}` in the same bucket
  4. (Optional v1.5) Update the RDS row's `thumbnail_url` — either by having Lambda call a small internal API endpoint, or by polling from the client until the thumbnail exists

Keep this Lambda dead simple at first — resize and save. Don't worry about updating RDS from Lambda until the core loop works; the frontend can just construct the expected thumbnail URL and fall back to the original if it 404s.

---

## 7. Suggested build order (local-first, AWS-last)

1. **Local API first** — build the Express/FastAPI app locally with the 5 endpoints above, using local Postgres (Docker) and stub the S3/DynamoDB calls or point at real AWS resources from day one (your choice — real AWS from the start gives more practice).
2. **RDS** — spin up a small Postgres instance (or `db.t3.micro` free-tier eligible), create the `posts` table, connect the local API to it.
3. **S3** — create the bucket, wire up presigned URL generation and upload flow end-to-end.
4. **Lambda** — add the thumbnail trigger once uploads work.
5. **DynamoDB** — add the likes table and the like endpoint.
6. **ECS Fargate** — containerize the API (Dockerfile), push to ECR, deploy as a Fargate service last, once everything works locally against real AWS resources.
7. **Frontend** — a minimal single page (plain HTML/JS or a small React app) with: upload form (photo + caption + location + date), feed list, detail view, like button.

---

## 8. Explicitly out of scope for v1

- User auth / accounts (use a hardcoded `user_id`)
- Sharing posts with other users
- Comments
- Notifications / EventBridge crons
- Auto-tagging via Rekognition
- Map view / geocoding of the `location` field
- CDN (CloudFront) in front of S3 — nice v2 addition
- Infrastructure as code (Terraform/CDK) — do it manually via console/CLI first, automate later once you understand the pieces

---

## 9. Stretch goals (v2, only after v1 works end-to-end)

- Add auth (Cognito) and real multi-user following/sharing
- CloudFront in front of S3 for faster image loads
- Map view — plot posts by location (geocode `location` into lat/lng)
- Destination/category tags (Beach, Mountain, City, Road Trip, etc.) — manual or auto-tagged via Rekognition
- EventBridge scheduled Lambda for "trip anniversary" digest
- Terraform/CDK to codify the infra you built manually

---

## Changelog from original "Memoria" spec

- Renamed app: **Memoria → Travel Inspo**
- Renamed table/routes: `memories` → `posts`, `GET /memories` → `GET /posts`, etc.
- Added a `location` field (free text) to the schema and to the create-post endpoint
- Reframed feed language from "timeline of memories" to "feed of travel posts"
- Moved category/destination tagging idea into stretch goals (v2) rather than v1
