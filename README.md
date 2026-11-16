
# IIIT Vadodara Event Board

A campus event management platform developed using HTML,
CSS, JavaScript, Node.js and Express.

## Features

- Browse campus events
- Search events
- Filter by category and date
- Sort events
- Register for events
- Track available seats
- Save bookmarks
- Submit event proposals
- Persistent JSON storage

## Technologies

- HTML5
- CSS3
- JavaScript
- Node.js
- Express.js
- JSON

## Project Structure

```text
Event_Board-main/
├── assets/
├── css/
├── js/
│   ├── script.js
│   └── server.js
├── scripts/
│   ├── events.json
│   └── events.xml
├── data/
│   └── db.json
├── index.html
├── events.html
├── submit.html
├── faq.html
└── package.json
```

## Installation

Install Node.js first.

Open the project root in the terminal.

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

Development mode:

```bash
npm run dev
```

Open:

http://localhost:3000

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/health | Server health |
| GET | /api/events | Get events |
| GET | /api/events/:id | Get one event |
| POST | /api/registrations | Register |
| GET | /api/bookmarks | Get bookmarks |
| POST | /api/bookmarks | Add bookmark |
| DELETE | /api/bookmarks/:eventId | Remove bookmark |
| POST | /api/proposals | Submit proposal |

## Database

Application data is stored in:

data/db.json

The database contains:

- Events
- Registrations
- Bookmarks
- Event proposals

## Important

This project currently uses local JSON storage
for development and educational purposes.

It is not yet configured for public production
deployment or authenticated administration.

## Developer

Sawai Khatri

IIIT Vadodara
