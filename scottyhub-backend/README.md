# ScottyHub Backend API

Node.js + Express + MongoDB backend for ScottyHub.

## Endpoints

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/auth/register | Register new user |
| POST | /api/auth/verify | Verify email with OTP |
| POST | /api/auth/login | Login |
| POST | /api/auth/send-otp | Send OTP (forgot password) |
| POST | /api/auth/reset-password | Reset password with OTP |

### Users
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/users/me | Get my profile |
| PUT | /api/users/me | Update my profile |
| GET | /api/users | Get all users (admin only) |
| DELETE | /api/users/:id | Delete user (admin only) |

### Posts
| Method | Route | Description |
|--------|-------|-------------|
| GET | /api/posts | Get feed (paginated) |
| POST | /api/posts | Create post |
| PUT | /api/posts/:id/like | Like/unlike post |
| POST | /api/posts/:id/comment | Comment on post |
| DELETE | /api/posts/:id | Delete post |

## Setup

### 1. MongoDB Atlas
1. Go to https://mongodb.com/atlas and create a free account
2. Create a free cluster (M0)
3. Create a database user (username + password)
4. Whitelist IP: 0.0.0.0/0 (allow all — needed for Render)
5. Click Connect → Drivers → copy the connection string
6. Replace <password> in the string with your DB user password

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in:
- MONGO_URI — your Atlas connection string
- JWT_SECRET — any long random string
- SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS — your email SMTP details
- FRONTEND_URL — your Vercel frontend URL

### 3. Deploy to Render
1. Push this folder to a GitHub repo
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Add all environment variables from .env in Render's dashboard
7. Deploy!

### 4. Connect Frontend
In your App.jsx replace the localStorage calls with fetch() calls to your Render URL:
- Register: POST https://your-api.onrender.com/api/auth/register
- Login: POST https://your-api.onrender.com/api/auth/login
- etc.
