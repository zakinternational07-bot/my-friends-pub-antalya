# My Friends Pub — Antalya

*[Русская версия](README.ru.md)*

Website for a pub in Antalya, Turkey. Vanilla HTML/CSS/JS front end, Node.js +
Express back end with SQLite. Table bookings, a Telegram bot, guest surveys and
an admin panel all run inside a single process.

**Live:** https://my-friends-pub-antalya.onrender.com

Tickets for paid events are sold on an external ticketing platform — the site
has no payment gateway of its own, by design.

## Quick start

```bash
cd backend
npm install
cp .env.example .env
# set ADMIN_USERNAME / ADMIN_PASSWORD / SESSION_SECRET in .env
npm run dev
```

The server listens on `http://localhost:3000` and serves both the API and the
front end. Admin panel: `http://localhost:3000/html/admin/login.html`.

> **Node.js 18 required.** `better-sqlite3` ships a native binary built for a
> specific Node version; on Node 20+ it fails to load and the server won't
> start. After changing Node versions, rebuild it: `npm rebuild better-sqlite3`.

On first run `backend/data/mfp.sqlite` is created and seeded with an admin
account, the hall layout, a three-language menu and sample events.

## Stack

**Back end** — Node.js + Express 4 and seven dependencies, nothing else:
`better-sqlite3` (database), `express-session` + `bcryptjs` (admin auth),
`multer` (poster uploads), `ws` (live seat availability), `dotenv`.

**Front end** — vanilla JavaScript. No build step and not a single external
script: no React/Vue, no webpack/vite, no CDN. Three languages as separate
pages (`index.html` / `-en` / `-tr`).

**Telegram bot** — not a separate program, but part of the same server. No
library such as telegraf: plain HTTPS calls to `api.telegram.org` via the
built-in `fetch` ([telegram.js](backend/src/services/telegram.js)), driven by a
webhook at `POST /api/telegram/webhook`. Buttons are ordinary URLs pointing at
site routes rather than `callback_data`, so every guest action is a GET request
that can be logged, replayed and opened in a browser. No separate hosting for
the bot is needed.

**Schedulers** — plain `setInterval` inside the same process, not cron jobs.
Duplicate sends are prevented by markers in a `kv_store` table rather than
in-memory state, so a restart never causes double messages.

## How tickets are sold

There is no built-in payment gateway and none is planned:

1. In the admin panel, an event priced above zero has a **ticket link** field
   (`payment_url`) holding the event's page on the external ticketing platform.
2. When the link is set, the call to action becomes **"Buy tickets"** and opens
   that platform in a new tab ([event-detail.js](frontend/js/event-detail.js)).
3. No seats are held on our side: **staff seat guests on arrival** based on the
   tickets they bought. The site never learns that a payment happened — the
   platform exposes neither an API nor webhooks.

If the link is missing, the booking page says ticket sales aren't open yet
instead of showing a form that could not lead anywhere.

## Bookings

### Free events

No hall map — staff assign the table. The guest fills in a form: arrival time,
party size, name, phone (Telegram/WhatsApp) and any requests. No email is asked
for. A held booking is created without seats (10 minutes to confirm,
`SEAT_HOLD_MINUTES`) and the guest is sent to `t.me/<bot>?start=<token>`.

The guest presses Start, the bot resolves the booking by its token, marks it
`paid` and replies with the details. At the same time the whole booking — name,
phone, @username, party size, arrival time, requests — is posted to the staff
chat tagged `#бронь`.

### Paid events

Handled entirely by the external platform, see above. There is no booking flow
for them on the site.

### Hall layout

16 tables plus 5 individual seats at the bar, 59 seats in total. Tables seat 2,
4 or 6 and the arrangement mirrors the real floor plan. It lives in code
([seed.js](backend/src/db/seed.js)) rather than the database and is rebuilt on
every server start, keyed by table label and seat number. Seats that already
have bookings are left untouched.

Guests no longer pick seats anywhere, so the map is only reachable through the
admin panel — see [What's still in the code](#whats-still-in-the-code).

## Reminders and arrival checks

Every 10 minutes [reminderScheduler.js](backend/src/services/reminderScheduler.js)
sweeps the bookings. **All of this applies to free events only** (`e.price = 0`);
guests who bought a ticket are assumed to turn up.

Unconfirmed bookings go through three stages:

- **≤ `REMINDER_HOURS_BEFORE`** (12 h) — a reminder with two link buttons,
  "confirm" and "can't make it" (`/rsvp/<ref>/confirm` and `/decline`).
- **≤ `REMINDER_SECOND_HOURS_BEFORE`** (6 h) — the same again if there was no
  answer.
- **≤ `REMINDER_CANCEL_HOURS_BEFORE`** (3 h) — still no answer, so the booking
  is cancelled automatically, the seat is released, the guest gets a short
  rhymed apology and staff are notified.

Following the link *is* the action — no extra click on the site. A stale link
honestly reports that the booking is no longer active.

Separately, **at the exact moment the event starts**, confirmed bookings are
asked "are you here?" with two buttons
([arrival.js](backend/src/routes/arrival.js)). With no reply within
`ARRIVAL_CHECK_GRACE_MINUTES` (30) the booking is released and the table goes
to the waiting list.

## Post-visit survey

`SURVEY_HOURS_AFTER_EVENT` (18) hours after the event starts, guests with a
`paid` booking receive a link to a form: four 1–5 ratings (service, food,
drinks, overall) plus an optional comment.

The link goes out over Telegram — every confirmed booking has a
`telegram_chat_id`, because confirmation only happens through the bot.

Answers are forwarded to the staff chat immediately as `#Опрос` (ratings drawn
as bars in a monospace block, date as DD.MM.YYYY) and `#отзыв` (the comment).
Every Monday between 09:00 and 12:00 Antalya time, a weekly average is posted to
the same chat.

If any rating is 3 or lower, a separate **"low rating"** message carries the
guest's contact: a clickable Telegram @username, otherwise their email,
otherwise an explicit note that there is no contact. The same is visible in the
admin panel under Reviews, where those rows are highlighted.

## Waiting list

When no table fits the requested party size, the booking page offers to join the
waiting list instead. When a seat frees up, **everyone waiting is notified at
once** — no queue, first to book gets the table. Repeat notifications for the
same event are rate-limited to once per 10 minutes and each one carries an
unsubscribe link.

## Email

**The project needs no mail service and none is planned.** Ticket emails are
sent by the ticketing platform, and everything else reaches the guest through
the Telegram bot: booking confirmation, reminders, the arrival check and the
survey link.

`EMAIL_PROVIDER=console` means
[ConsoleEmailService.js](backend/src/services/email/ConsoleEmailService.js) only
writes messages to `backend/data/emails/*.html` and sends nothing.

One place where this is still visible: the **waiting list** form asks for an
email, so a guest who never linked Telegram will not hear that a table opened
up. See [Known rough edges](#known-rough-edges).

## Media

Images and video are compressed ahead of time, never on the server.

**Working folder `media/`** — `source/` and `converted/`, both gitignored. The
converter is [tools/convert-media.js](tools/convert-media.js) on top of ffmpeg:
images to `.webp` (q82), video to `.webm` (VP9 + libopus). Flags: `--force`,
`--max-width`, `--crf`, `--mute`, `--keep-names`. It warns when the output ends
up larger than the source. Details in [media/README.md](media/README.md).

**Homepage background** — a looping, muted, full-screen video with a separate
lightweight cut for phones ([hero-video.js](frontend/js/hero-video.js)).

**Menu pages** ship in two formats: `.webp` (about half the weight) and `.jpg`
as a fallback for iOS below 14.
[menu-gallery.js](frontend/js/menu-gallery.js) detects webp support with a 1×1
inline image, without a round trip to the server.

## Admin panel

Events (title, description, date/time, price, ticket link, one upload zone for
either a photo or a video), the three-language menu, the hall layout, bookings
and survey results.

**Events are managed here**, on the live site — no deploy required. The one
exception is a handful of early events hardcoded in
[seed.js](backend/src/db/seed.js) (dated August–September 2026):
`seedPersistentEvents()` restores them by `slug` on every server start, so they
have to be edited in code. Events created through the admin panel are never
touched. Once those records stop being useful, the function can simply be
deleted.

## Hosting

**Render**, Starter plan (~$7/mo) plus a 1 GB persistent disk (~$0.25/mo).
Configured in [render.yaml](render.yaml); deploys on `git push`.

Create it with New → Blueprint and pick this repository. Render reads
`render.yaml` and only asks for `ADMIN_PASSWORD`. If the service already exists
and the disk is added later, Render may want it confirmed through the UI:
Settings → Disks → Add Disk, mount path `/var/data`, 1 GB.

**Why a paid plan.** On the free tier the disk is ephemeral: `mfp.sqlite`, with
every booking and survey in it, is recreated from scratch on each deploy, and
the service sleeps after ~15 minutes of inactivity, which would delay
reminders. Starter does not sleep, and a disk mounted at `/var/data` (the
`DATA_DIR` variable) survives deploys and restarts.

That disk holds uploads too: [upload.js](backend/src/middleware/upload.js)
writes them under `DATA_DIR/uploads/...` rather than `frontend/assets/`, which
is recreated from git on every deploy. They are served from a separate
`/uploads/...` route.

### Environment variables

```
TELEGRAM_BOT_TOKEN=...           # from @BotFather, secret
TELEGRAM_BOT_USERNAME=...        # without @
TELEGRAM_STAFF_CHAT_ID=          # staff chat for bookings, surveys, cancellations
REMINDER_HOURS_BEFORE=12
REMINDER_SECOND_HOURS_BEFORE=6
REMINDER_CANCEL_HOURS_BEFORE=3
REMINDER_RECHECK_HOURS_BEFORE=4
ARRIVAL_CHECK_GRACE_MINUTES=30   # how long to wait for an "are you here?" reply
SURVEY_HOURS_AFTER_EVENT=18
SEAT_HOLD_MINUTES=10
PUBLIC_BASE_URL=...              # not needed on Render — taken from RENDER_EXTERNAL_URL
```

The server registers the Telegram webhook itself on start when a token and a
public address are present; `setWebhook` never has to be called by hand.

Without `TELEGRAM_STAFF_CHAT_ID`, staff forwarding and weekly summaries are
simply skipped — guests can still take the survey and answers are stored.

## Database

SQLite, a single file, 10 tables: `admins`, `events`, `menu_categories`,
`menu_items`, `hall_seats`, `bookings`, `booking_seats`, `surveys`, `kv_store`,
`waitlist`. Schema in [schema.sql](backend/src/db/schema.sql).

Migrations are idempotent: on start
[connection.js](backend/src/db/connection.js) reads `PRAGMA table_info` and
issues `ALTER TABLE` where needed, so deploying a new column never disturbs
existing data.

Time: Antalya is a fixed UTC+3, and event timestamps are built as
``new Date(`${date}T${time}:00+03:00`)``. SQLite's `datetime('now')` returns a
naive UTC string, so time comparisons are done **in SQL**
(`datetime('now','-N minutes')`) — parsed in JavaScript that string would be
read as local time.

## Layout

```
frontend/   html/ css/ js/ assets/ — the site itself
backend/    server.js + src/{db,routes,services,ws,middleware}
media/      media conversion workspace (contents gitignored)
tools/      convert-media.js
docs/       original project brief (Russian)
```

## What's still in the code

**The hall map.** Guests no longer choose seats: free events are booked through
a form and paid ones are sold externally. The layout code — 16 tables, 5 bar
seats, per-seat selection, a tap-to-open dialog on phones — is kept on purpose:
the admin panel manages it, and it is ready if seat sales ever move in-house.

## Known rough edges

- The booking page says a table is held "for another 15 minutes", while
  `ARRIVAL_CHECK_GRACE_MINUTES` is 30. The copy and the setting should agree.
- The waiting list form requires an email although no mail is sent (see
  [Email](#email)).
