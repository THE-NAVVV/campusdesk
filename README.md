# CampusDesk

A full-stack campus resource booking app — students discover halls, labs, and
equipment, book time slots without clashing with anyone else, and get
automated email reminders before their booking starts.

Built for the GDG LNMIIT Web Development Recruitment task.

## 🔗 Live

- **Frontend:** https://sunny-jelly-cb0b14.netlify.app/
- **Backend API:** https://campusdesk-production.up.railway.app/api

## ✨ Features

- Email OTP authentication (no passwords) → JWT sessions
- Role-based access: student / admin
- Resource discovery — paginated, debounced search, category filters
- Booking with a live availability timeline (click a free slot to book)
- No-overlap guarantee on bookings, with 30 min–4 h duration and open/close
  hours validation
- My Bookings — status filter tabs, optimistic cancel with rollback
- Admin panel — add/deactivate resources, view & filter all bookings
- **Waitlist** — join a waitlist for a taken slot, auto-promoted + emailed
  when it frees up
- **Recurring bookings** — weekly series created atomically (all-or-nothing)
- Automated cron reminders 1 hour before a booking starts + auto-marking
  past bookings as completed
- Dark/light theme with persisted preference

See [DESIGN.md](./DESIGN.md) for the concurrency/double-booking approach and
other design decisions.

## 🧱 Tech stack

| Layer    | Tech |
|----------|------|
| Backend  | Node.js, Express |
| Database | SQLite (`better-sqlite3`, WAL mode) |
| Auth     | Email OTP + JWT (`jsonwebtoken`) |
| Email    | Nodemailer (console fallback in dev) |
| Cron     | `node-cron` |
| Frontend | Vanilla HTML / CSS / JS |
| Hosting  | Railway (backend + DB), Netlify (frontend) |

## 📁 Project structure

```
backend/
  routes/        auth.js, resources.js, bookings.js, admin.js
  middleware/     auth.js (requireAuth/requireAdmin), rateLimiter.js
  utils/          mailer.js
  cron/           reminders.js
  db.js           schema + migrations
  seed.js         seeds 1 admin, 2 students, 40+ resources
  server.js

frontend/
  index.html, resources.html, resource.html, my-bookings.html, admin.html
  js/  api.js, auth.js, resources.js, bookings.js, my-bookings.js, admin.js, theme.js
  css/ style.css
```

## ⚙️ Local setup

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in JWT_SECRET, SMTP_* (optional — logs to console if omitted)
npm run seed            # seeds admin/students/resources
npm start                # runs on PORT (default 5000)
```

**.env.example**

```
PORT=5000
JWT_SECRET=change_me
JWT_EXPIRES_IN=24h
OTP_EXPIRY_MIN=5
OTP_MAX_REQUESTS=3
OTP_WINDOW_MIN=10
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

### Frontend

Just open `index.html` via a static server (or Live Server) — it talks to
`API_BASE` set in `js/api.js`. Update that constant to `http://localhost:5000/api`
for local backend testing, or leave it pointed at the Railway URL above.

## 🔑 Seeded accounts

| Role    | Email               |
|---------|---------------------|
| Admin   | admin@lnmiit.ac.in  |
| Student | nav@lnmiit.ac.in    |
| Student | priya@lnmiit.ac.in  |

OTPs print to the backend console when SMTP isn't configured.

## 📡 API overview

| Method | Endpoint                          | Auth        |
|--------|-----------------------------------|-------------|
| POST   | `/api/auth/send-otp`              | —           |
| POST   | `/api/auth/verify-otp`            | —           |
| GET    | `/api/resources`                  | student     |
| POST   | `/api/resources`                  | admin       |
| PATCH  | `/api/resources/:id`               | admin       |
| DELETE | `/api/resources/:id`               | admin       |
| GET    | `/api/resources/:id/bookings`      | student     |
| POST   | `/api/bookings`                    | student     |
| GET    | `/api/bookings/me`                 | student     |
| PATCH  | `/api/bookings/:id/cancel`         | owner/admin |
| POST   | `/api/bookings/recurring`          | student     |
| POST   | `/api/bookings/:resourceId/waitlist` | student   |
| GET    | `/api/bookings/waitlist/me`        | student     |
| DELETE | `/api/bookings/waitlist/:id`       | student     |
| GET    | `/api/admin/bookings`              | admin       |

All non-auth routes require `Authorization: Bearer <token>`. Errors follow a
consistent `{ error: { message, fields?, clash? } }` envelope with correct
status codes (400/401/403/404/409/429).

## 👤 Author

Nav Vardhan Singh (https://the-navvv.github.io/portfolio-website/) — GDG LNMIIT recruitment
assignment.
