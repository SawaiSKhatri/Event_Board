
const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Project directories
const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

// Middleware
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));

// Enable CORS for frontend development (e.g., Live Server on port 5500)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Serve frontend files with optional .html extension
app.use(express.static(ROOT_DIR, { extensions: ["html"] }));

// Database helpers
async function readDatabase() {
  const content = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(content);
}

async function writeDatabase(database) {
  await fs.writeFile(
    DB_PATH,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

function generateId(items) {
  return items.length
    ? Math.max(...items.map(item => Number(item.id) || 0)) + 1
    : 1;
}

// Validate common input
function isValidText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

// API: Server health
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Event Board API is running."
  });
});

// API: Get approved events
app.get("/api/events", async (req, res, next) => {
  try {
    const database = await readDatabase();

    const events = database.events.filter(
      event => event.status === "approved"
    );

    res.json({
      success: true,
      count: events.length,
      events
    });
  } catch (error) {
    next(error);
  }
});

// API: Publish new event and save to db.json
app.post("/api/events", async (req, res, next) => {
  try {
    const {
      title,
      date,
      location,
      category,
      seats,
      online,
      free,
      description
    } = req.body;

    const validatedSeats =
      Number.isInteger(Number(seats)) && Number(seats) >= 0
        ? Number(seats)
        : 50;

    const validatedOnline =
      typeof online === "boolean"
        ? online
        : String(location || "").toLowerCase().includes("online");

    const validatedFree =
      typeof free === "boolean"
        ? free
        : true;

    if (
      !isValidText(title, 120) ||
      !isValidText(location, 150) ||
      !isValidText(category, 60) ||
      !isValidText(description, 2000) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date + "T00:00:00Z"))
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid event details."
      });
    }

    const database = await readDatabase();

    const newEvent = {
      id: generateId(database.events),
      title: title.trim(),
      date,
      seats: validatedSeats,
      free: validatedFree,
      online: validatedOnline,
      category: category.trim(),
      location: location.trim(),
      description: description.trim(),
      status: "approved"
    };

    database.events.push(newEvent);

    if (Array.isArray(database.proposals)) {
      database.proposals.push({
        ...newEvent,
        submittedAt: new Date().toISOString()
      });
    }

    await writeDatabase(database);

    res.status(201).json({
      success: true,
      message: "Event published and saved to db.json successfully!",
      event: newEvent
    });
  } catch (error) {
    next(error);
  }
});

// API: Get a single event
app.get("/api/events/:id", async (req, res, next) => {
  try {
    const database = await readDatabase();

    const event = database.events.find(
      item => item.id === Number(req.params.id)
        && item.status === "approved"
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found."
      });
    }

    res.json({ success: true, event });
  } catch (error) {
    next(error);
  }
});

// API: Register for an event
app.post("/api/registrations", async (req, res, next) => {
  try {
    const { eventId, name, email } = req.body;

    if (!Number.isInteger(Number(eventId)) ||
        !isValidText(name, 80) ||
        !isValidText(email, 120) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid registration details."
      });
    }

    const database = await readDatabase();

    const event = database.events.find(
      item => item.id === Number(eventId)
        && item.status === "approved"
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found."
      });
    }

    if (event.seats <= 0) {
      return res.status(409).json({
        success: false,
        message: "Sorry, this event is fully booked."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const duplicate = database.registrations.some(
      registration =>
        registration.eventId === event.id &&
        registration.email === normalizedEmail
    );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "You are already registered for this event."
      });
    }

    const registration = {
      id: generateId(database.registrations),
      eventId: event.id,
      eventTitle: event.title,
      name: name.trim(),
      email: normalizedEmail,
      registeredAt: new Date().toISOString()
    };

    database.registrations.push(registration);
    event.seats--;

    await writeDatabase(database);

    res.status(201).json({
      success: true,
      message: "Registration successful!",
      registration,
      remainingSeats: event.seats
    });
  } catch (error) {
    next(error);
  }
});

// API: Get bookmarks
app.get("/api/bookmarks", async (req, res, next) => {
  try {
    const database = await readDatabase();

    res.json({
      success: true,
      bookmarks: database.bookmarks
    });
  } catch (error) {
    next(error);
  }
});

// API: Add bookmark
app.post("/api/bookmarks", async (req, res, next) => {
  try {
    const { eventId, email } = req.body;

    if (!Number.isInteger(Number(eventId)) ||
        !isValidText(email, 120) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Valid event ID and email are required."
      });
    }

    const database = await readDatabase();

    const event = database.events.find(
      item => item.id === Number(eventId)
        && item.status === "approved"
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const exists = database.bookmarks.some(
      bookmark =>
        bookmark.eventId === event.id &&
        bookmark.email === normalizedEmail
    );

    if (!exists) {
      database.bookmarks.push({
        id: generateId(database.bookmarks),
        eventId: event.id,
        email: normalizedEmail,
        createdAt: new Date().toISOString()
      });

      await writeDatabase(database);
    }

    res.status(201).json({
      success: true,
      message: "Bookmark saved."
    });
  } catch (error) {
    next(error);
  }
});

// API: Remove bookmark
app.delete("/api/bookmarks/:eventId", async (req, res, next) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    const eventId = Number(req.params.eventId);

    if (!Number.isInteger(eventId) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Valid event ID and email are required."
      });
    }

    const database = await readDatabase();

    const originalLength = database.bookmarks.length;

    database.bookmarks = database.bookmarks.filter(
      bookmark =>
        !(bookmark.eventId === eventId &&
          bookmark.email === email)
    );

    if (database.bookmarks.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Bookmark not found."
      });
    }

    await writeDatabase(database);

    res.json({
      success: true,
      message: "Bookmark removed."
    });
  } catch (error) {
    next(error);
  }
});

// API: Submit an event proposal
app.post("/api/proposals", async (req, res, next) => {
  try {
    const {
      title,
      date,
      location,
      category,
      seats,
      online,
      free,
      description
    } = req.body;

    const validatedSeats =
      Number.isInteger(Number(seats)) && Number(seats) >= 0
        ? Number(seats)
        : 50;

    const validatedOnline =
      typeof online === "boolean"
        ? online
        : String(location || "").toLowerCase().includes("online");

    const validatedFree =
      typeof free === "boolean"
        ? free
        : true;

    if (
      !isValidText(title, 120) ||
      !isValidText(location, 150) ||
      !isValidText(category, 60) ||
      !isValidText(description, 2000) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date + "T00:00:00Z"))
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid event details."
      });
    }

    const database = await readDatabase();

    const proposal = {
      id: generateId(database.proposals),
      title: title.trim(),
      date,
      location: location.trim(),
      category: category.trim(),
      seats: validatedSeats,
      online: validatedOnline,
      free: validatedFree,
      description: description.trim(),
      status: "approved",
      submittedAt: new Date().toISOString()
    };

    database.proposals.push(proposal);

    database.events.push({
      id: generateId(database.events),
      title: proposal.title,
      date: proposal.date,
      seats: proposal.seats,
      free: proposal.free,
      online: proposal.online,
      category: proposal.category,
      location: proposal.location,
      description: proposal.description,
      status: "approved"
    });

    await writeDatabase(database);

    res.status(201).json({
      success: true,
      message: "Your event proposal has been submitted for review.",
      proposal
    });
  } catch (error) {
    next(error);
  }
});

// Handle unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found."
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error("Server error:", error);

  res.status(500).json({
    success: false,
    message: "An internal server error occurred."
  });
});

// Start server
async function startServer() {
  try {
    try {
      await fs.access(DB_PATH);
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const initialDb = {
        events: [],
        registrations: [],
        bookmarks: [],
        proposals: []
      };
      await fs.writeFile(DB_PATH, JSON.stringify(initialDb, null, 2), "utf8");
    }

    await readDatabase();

    app.listen(PORT, () => {
      console.log("--------------------------------");
      console.log("IIIT Vadodara Event Board");
      console.log("--------------------------------");
      console.log(`Server: http://localhost:${PORT}`);
      console.log(`API: http://localhost:${PORT}/api`);
      console.log("Status: Running");
      console.log("--------------------------------");
    });
  } catch (error) {
    console.error("Unable to start server:", error.message);
    process.exit(1);
  }
}

startServer();
