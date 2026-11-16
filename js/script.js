"use strict";

// Determine API base dynamically to support both Express (port 3000) and Live Server (port 5500, etc.)
function getApiBase() {
  if (typeof window === "undefined") return "/api";
  const { protocol, hostname, port } = window.location;
  // If running via file protocol or a static dev server (not port 3000), target Express backend
  if (
    protocol === "file:" ||
    ((hostname === "localhost" || hostname === "127.0.0.1") && port && port !== "3000")
  ) {
    return "http://localhost:3000/api";
  }
  return "/api";
}

const API_BASE = getApiBase();

let events = [];
let bookmarks = [];
let currentEmail = localStorage.getItem("eventBoardEmail") || "";

// DOM Elements
const eventGrid = document.querySelector("#event-grid");
const eventSearchInput = document.querySelector("#event-search");
const categoryFilter = document.querySelector("#category-filter");
const dateFilter = document.querySelector("#date-filter");
const sortSelect = document.querySelector("#sort-events");
const bookmarksOnly = document.querySelector("#bookmarks-only");

// Modal / Dialog Elements (supports both #register-* and #rsvp-* IDs)
const rsvpDialog =
  document.querySelector("#register-dialog") ||
  document.querySelector("#rsvp-dialog");
const rsvpForm =
  document.querySelector("#register-form") ||
  document.querySelector("#rsvp-form");
const rsvpMessage =
  document.querySelector("#form-feedback") ||
  document.querySelector("#rsvp-message");
const rsvpEventId =
  document.querySelector("#reg-event-id") ||
  document.querySelector("#rsvp-event-id");
const rsvpEventTitle =
  document.querySelector("#modal-event-title") ||
  document.querySelector("#rsvp-event-title");
const attendeeNameInput =
  document.querySelector("#reg-name") ||
  document.querySelector("#attendee-name");
const attendeeEmailInput =
  document.querySelector("#reg-email") ||
  document.querySelector("#attendee-email");

// Submission Form Elements
const eventForm = document.querySelector("#event-form");
const submissionMessage =
  document.querySelector("#submit-feedback") ||
  document.querySelector("#submission-message");

// Helper to escape HTML to prevent XSS
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================
// SAFE API HELPER
// ============================================

async function apiRequest(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });
  } catch (netError) {
    throw new Error(
      `Unable to connect to backend server at ${API_BASE}. (${netError.message})`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  let result = null;

  if (contentType.includes("application/json")) {
    result = await response.json();
  } else {
    // If response is not JSON (e.g. 404 HTML from Live Server or static server)
    const statusInfo = `${response.status} ${response.statusText}`.trim();
    throw new Error(
      `Backend API endpoint returned non-JSON response (${statusInfo || "HTML error page"}).`
    );
  }

  if (!response.ok) {
    throw new Error(result?.message || `Request failed with status ${response.status}.`);
  }

  return result;
}

// ============================================
// EVENT STATUS HELPER
// ============================================

function getEventStatus(event) {
  const seats = Number(event.seats);
  if (Number.isInteger(seats) && seats <= 0) return "Full";
  if (Number.isInteger(seats) && seats < 5) return "Few left";
  return "Open";
}

// ============================================
// LOAD EVENTS (with graceful static fallback)
// ============================================

async function loadEvents() {
  if (!eventGrid) return;

  try {
    eventGrid.innerHTML = `
      <p id="loading-message" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">
        Loading events...
      </p>
    `;

    let loadedFromApi = false;

    try {
      const result = await apiRequest("/events");
      if (result && Array.isArray(result.events)) {
        events = result.events;
        loadedFromApi = true;
      }
    } catch (apiError) {
      console.warn("Backend API not reachable; loading fallback data:", apiError.message);

      // Attempt fallback to local static data
      const fallbackResponse =
        (await fetch("./data/db.json").catch(() => null)) ||
        (await fetch("./scripts/events.json").catch(() => null));

      if (fallbackResponse && fallbackResponse.ok) {
        const text = await fallbackResponse.text();
        const parsed = JSON.parse(text);
        events = Array.isArray(parsed) ? parsed : (parsed.events || []);
      } else {
        throw apiError;
      }
    }

    if (loadedFromApi) {
      await loadBookmarks();
    }

    populateCategories();
    filterAndRenderEvents();

    loadXMLData();
    compareFileSizes();

  } catch (error) {
    console.error("Event loading error:", error);
    eventGrid.innerHTML = `
      <div class="error-card" style="grid-column: 1 / -1; padding: 1.5rem; background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius-md); text-align: center;">
        <p style="color: var(--danger, #ef4444); font-weight: 700; margin-bottom: 0.5rem;">
          Unable to load events
        </p>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1rem;">
          ${escapeHtml(error.message)}
        </p>
        <p style="font-size: 0.85rem; color: var(--text-muted);">
          Make sure the backend server is running: <br>
          <code style="display: inline-block; margin-top: 0.4rem; padding: 0.25rem 0.6rem; background: var(--surface-subtle); border-radius: 4px; border: 1px solid var(--border);">npm start</code>
        </p>
      </div>
    `;
  }
}

// ============================================
// BOOKMARK MANAGEMENT
// ============================================

async function loadBookmarks() {
  if (!currentEmail) {
    bookmarks = [];
    return;
  }

  try {
    const result = await apiRequest("/bookmarks");
    if (result && Array.isArray(result.bookmarks)) {
      bookmarks = result.bookmarks.filter(
        bookmark => (bookmark.email || "").toLowerCase() === currentEmail.toLowerCase()
      );
    }
  } catch (error) {
    console.warn("Bookmark loading error:", error.message);
  }
}

function isBookmarked(eventId) {
  return bookmarks.some(
    bookmark => Number(bookmark.eventId) === Number(eventId)
  );
}

async function toggleBookmark(eventId) {
  if (!currentEmail) {
    const email = prompt("Enter your IIITV institute email to save bookmarks:");
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      alert("Please enter a valid email address.");
      return;
    }

    currentEmail = email.trim().toLowerCase();
    localStorage.setItem("eventBoardEmail", currentEmail);
    await loadBookmarks();
  }

  try {
    if (isBookmarked(eventId)) {
      await apiRequest(
        `/bookmarks/${eventId}?email=${encodeURIComponent(currentEmail)}`,
        { method: "DELETE" }
      );
    } else {
      await apiRequest("/bookmarks", {
        method: "POST",
        body: JSON.stringify({
          eventId,
          email: currentEmail
        })
      });
    }

    await loadBookmarks();
    filterAndRenderEvents();

  } catch (error) {
    console.warn("Bookmark API offline, updating locally in session:", error.message);
    const index = bookmarks.findIndex(
      b => Number(b.eventId) === Number(eventId) && (b.email || "").toLowerCase() === currentEmail
    );
    if (index > -1) {
      bookmarks.splice(index, 1);
    } else {
      bookmarks.push({ eventId, email: currentEmail });
    }
    filterAndRenderEvents();
  }
}

// ============================================
// CATEGORY FILTER
// ============================================

function populateCategories() {
  if (!categoryFilter) return;

  const currentVal = (categoryFilter.value || "all").toLowerCase();

  const categories = [
    ...new Set(events.map(event => event.category || "Technology"))
  ].filter(Boolean).sort();

  categoryFilter.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All Categories";
  categoryFilter.appendChild(allOption);

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });

  const matchingOption = categories.find(c => c.toLowerCase() === currentVal);
  categoryFilter.value = matchingOption || "all";
}

// ============================================
// RENDER EVENTS
// ============================================

function renderEvents(eventList) {
  if (!eventGrid) return;

  eventGrid.replaceChildren();

  const countElement = document.querySelector("#event-count");
  if (countElement) {
    countElement.textContent = `${eventList.length} Events`;
  }

  if (eventList.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.style.gridColumn = "1 / -1";
    message.style.textAlign = "center";
    message.style.padding = "2.5rem";
    message.style.color = "var(--text-muted)";
    message.textContent = "No matching events found.";
    eventGrid.appendChild(message);
    return;
  }

  eventList.forEach(event => {
    const card = document.createElement("article");
    card.className = "event-card";

    const seats = Number(event.seats ?? 0);
    const isFull = seats <= 0;
    if (isFull) {
      card.classList.add("full");
    }

    const eventStatus = getEventStatus(event);
    let tagClass = "active-tag";
    if (eventStatus === "Full") tagClass = "full-tag";
    else if (eventStatus === "Few left") tagClass = "few-left-tag";

    const formattedDate = event.date
      ? new Date(event.date + "T00:00:00").toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric"
        })
      : "Date TBA";

    const locationText = event.online
      ? "Online Session"
      : (event.location || "IIIT Vadodara Campus");

    card.innerHTML = `
      <div class="card-top">
        <time datetime="${escapeHtml(event.date || '')}">${formattedDate}</time>
        <span class="tag ${tagClass}">${eventStatus}</span>
      </div>

      <h3>${escapeHtml(event.title || "Untitled Event")}</h3>

      <p class="event-desc">${escapeHtml(event.description || "No description provided.")}</p>

      <div class="card-meta">
        <span><strong>Category:</strong> ${escapeHtml(event.category || "General")}</span>
        <span><strong>Location:</strong> ${escapeHtml(locationText)}</span>
        <span><strong>Available Seats:</strong> ${seats}</span>
      </div>

      <div class="card-actions" style="display: flex; gap: 0.5rem; margin-top: auto; padding-top: 0.5rem;">
        <button
          type="button"
          class="btn-secondary bookmark-button"
          data-event-id="${event.id}"
          style="flex: 1;"
        >
          ${isBookmarked(event.id) ? "★ Saved" : "☆ Bookmark"}
        </button>

        <button
          type="button"
          class="btn-primary rsvp-button"
          data-event-id="${event.id}"
          style="flex: 1;"
          ${isFull ? "disabled" : ""}
        >
          ${isFull ? "Fully Booked" : "RSVP Now"}
        </button>
      </div>
    `;

    eventGrid.appendChild(card);
  });
}

// ============================================
// SEARCH, FILTER AND SORT
// ============================================

function filterAndRenderEvents() {
  const searchTerm = eventSearchInput
    ? eventSearchInput.value.trim().toLowerCase()
    : "";

  const selectedCategory = categoryFilter
    ? categoryFilter.value.trim().toLowerCase()
    : "all";

  const selectedDate = dateFilter
    ? dateFilter.value
    : "all";

  const selectedSort = sortSelect
    ? sortSelect.value
    : "date-asc";

  let filteredEvents = events.filter(event => {
    const matchesSearch =
      (event.title || "").toLowerCase().includes(searchTerm) ||
      (event.description || "").toLowerCase().includes(searchTerm) ||
      (event.category || "").toLowerCase().includes(searchTerm) ||
      (event.location || "").toLowerCase().includes(searchTerm);

    const matchesCategory =
      selectedCategory === "all" ||
      (event.category || "").toLowerCase() === selectedCategory;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventDate = new Date((event.date || "") + "T00:00:00");

    const matchesDate =
      selectedDate === "all" ||
      (selectedDate === "upcoming" && eventDate >= today) ||
      (selectedDate === "past" && eventDate < today);

    const matchesBookmark =
      !bookmarksOnly?.checked ||
      isBookmarked(event.id);

    return (
      matchesSearch &&
      matchesCategory &&
      matchesDate &&
      matchesBookmark
    );
  });

  if (selectedSort === "date-asc") {
    filteredEvents.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  } else if (selectedSort === "date-desc") {
    filteredEvents.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  } else if (selectedSort === "title") {
    filteredEvents.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  } else if (selectedSort === "seats") {
    filteredEvents.sort((a, b) => (Number(b.seats) || 0) - (Number(a.seats) || 0));
  }

  renderEvents(filteredEvents);
}

// Filter listeners
eventSearchInput?.addEventListener("input", filterAndRenderEvents);
categoryFilter?.addEventListener("change", filterAndRenderEvents);
dateFilter?.addEventListener("change", filterAndRenderEvents);
sortSelect?.addEventListener("change", filterAndRenderEvents);
bookmarksOnly?.addEventListener("change", filterAndRenderEvents);

eventSearchInput?.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    eventSearchInput.value = "";
    filterAndRenderEvents();
  }
});

// ============================================
// EVENT GRID CLICK HANDLING (RSVP & Bookmark)
// ============================================

eventGrid?.addEventListener("click", async event => {
  const bookmarkButton = event.target.closest(".bookmark-button");
  const rsvpButton = event.target.closest(".rsvp-button");

  if (bookmarkButton) {
    await toggleBookmark(Number(bookmarkButton.dataset.eventId));
  }

  if (rsvpButton) {
    openRsvpDialog(Number(rsvpButton.dataset.eventId));
  }
});

// ============================================
// RSVP / REGISTRATION MODAL
// ============================================

function openRsvpDialog(eventId) {
  const selectedEvent = events.find(item => Number(item.id) === Number(eventId));
  if (!selectedEvent || Number(selectedEvent.seats) <= 0) {
    return;
  }

  if (rsvpEventId) rsvpEventId.value = String(eventId);
  if (rsvpEventTitle) rsvpEventTitle.textContent = selectedEvent.title || "Event Registration";

  if (rsvpMessage) {
    rsvpMessage.textContent = "";
    rsvpMessage.className = "feedback-msg";
  }

  if (attendeeNameInput) attendeeNameInput.value = "";
  if (attendeeEmailInput) attendeeEmailInput.value = currentEmail;

  if (rsvpDialog && typeof rsvpDialog.showModal === "function") {
    rsvpDialog.showModal();
  }
}

// Close buttons for modal
const closeButtons = document.querySelectorAll(
  "#close-modal, #cancel-modal, #close-rsvp"
);
closeButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    rsvpDialog?.close();
  });
});

rsvpForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const name = attendeeNameInput ? attendeeNameInput.value.trim() : "";
  const email = attendeeEmailInput ? attendeeEmailInput.value.trim() : "";
  const eventId = Number(rsvpEventId ? rsvpEventId.value : 0);
  const submitButton = rsvpForm.querySelector('button[type="submit"]');

  if (!eventId || !name || !email) {
    if (rsvpMessage) {
      rsvpMessage.textContent = "Please provide your name and valid email.";
      rsvpMessage.className = "feedback-msg error";
    }
    return;
  }

  try {
    if (submitButton) submitButton.disabled = true;
    if (rsvpMessage) {
      rsvpMessage.textContent = "Processing registration...";
      rsvpMessage.className = "feedback-msg";
    }

    let successMessage = "Registration successful!";

    try {
      const result = await apiRequest("/registrations", {
        method: "POST",
        body: JSON.stringify({
          eventId,
          name,
          email
        })
      });
      if (result && result.message) {
        successMessage = result.message;
      }
    } catch (apiError) {
      console.warn("Backend API offline; storing registration locally:", apiError.message);
      const localRegs = JSON.parse(localStorage.getItem("eventBoardRegistrations") || "[]");
      localRegs.push({ eventId, name, email, registeredAt: new Date().toISOString() });
      localStorage.setItem("eventBoardRegistrations", JSON.stringify(localRegs));

      const eventItem = events.find(e => Number(e.id) === Number(eventId));
      if (eventItem && Number(eventItem.seats) > 0) {
        eventItem.seats = Number(eventItem.seats) - 1;
      }
      filterAndRenderEvents();
      successMessage = "Registration successful!";
    }

    currentEmail = email.toLowerCase();
    localStorage.setItem("eventBoardEmail", currentEmail);

    if (rsvpMessage) {
      rsvpMessage.textContent = successMessage;
      rsvpMessage.className = "feedback-msg success";
    }

    await loadEvents().catch(() => {});

    setTimeout(() => {
      rsvpDialog?.close();
      if (rsvpMessage) {
        rsvpMessage.textContent = "";
        rsvpMessage.className = "feedback-msg";
      }
    }, 1400);

  } catch (error) {
    if (rsvpMessage) {
      rsvpMessage.textContent = error.message;
      rsvpMessage.className = "feedback-msg error";
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// ============================================
// EVENT PROPOSAL SUBMISSION
// ============================================

eventForm?.addEventListener("submit", async event => {
  event.preventDefault();

  const formData = new FormData(eventForm);

  const title = (formData.get("title") || formData.get("event-name") || "").toString().trim();
  const date = (formData.get("date") || formData.get("event-date") || "").toString().trim();
  const location = (formData.get("location") || formData.get("event-location") || "").toString().trim();
  const category = (formData.get("category") || formData.get("event-category") || "Technology").toString().trim();
  const description = (formData.get("description") || formData.get("event-description") || "").toString().trim();
  const seatsRaw = formData.get("seats") || formData.get("event-seats");
  const seats = seatsRaw ? Number(seatsRaw) : 50;
  const online =
    formData.has("online") ||
    formData.has("event-online") ||
    location.toLowerCase().includes("online");
  const free = formData.has("free") || formData.has("event-free") || true;

  if (!title || !date || !location || !description) {
    if (submissionMessage) {
      submissionMessage.textContent = "Please fill in all required fields.";
      submissionMessage.className = "feedback-msg error";
    }
    return;
  }

  const proposal = {
    id: Date.now(),
    title,
    date,
    location,
    category,
    seats,
    online,
    free,
    description,
    status: "pending",
    submittedAt: new Date().toISOString()
  };

  const submitButton = eventForm.querySelector('button[type="submit"]');

  try {
    if (submitButton) submitButton.disabled = true;
    if (submissionMessage) {
      submissionMessage.textContent = "Submitting proposal...";
      submissionMessage.className = "feedback-msg";
    }

    let successMessage = "Your event proposal has been submitted for review.";

    try {
      const result = await apiRequest("/proposals", {
        method: "POST",
        body: JSON.stringify(proposal)
      });
      if (result && result.message) {
        successMessage = result.message;
      }
    } catch (apiError) {
      console.warn("Backend API offline; storing proposal locally in browser storage:", apiError.message);
      const savedProposals = JSON.parse(localStorage.getItem("eventBoardProposals") || "[]");
      savedProposals.push(proposal);
      localStorage.setItem("eventBoardProposals", JSON.stringify(savedProposals));
      successMessage = "Your event proposal has been submitted for review! (Saved locally)";
    }

    if (submissionMessage) {
      submissionMessage.textContent = successMessage;
      submissionMessage.className = "feedback-msg success";
    }

    eventForm.reset();

  } catch (error) {
    if (submissionMessage) {
      submissionMessage.textContent = error.message;
      submissionMessage.className = "feedback-msg error";
    }
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

// ============================================
// XML DATA
// ============================================

async function loadXMLData() {
  const xmlTitleElement = document.querySelector("#xml-first-title");
  if (!xmlTitleElement) return;

  try {
    const response = await fetch("./scripts/events.xml");
    if (!response.ok) {
      throw new Error("XML file could not be loaded.");
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDocument = parser.parseFromString(xmlText, "application/xml");

    if (xmlDocument.querySelector("parsererror")) {
      throw new Error("Invalid XML format.");
    }

    const firstTitle = xmlDocument.querySelector("event title");
    xmlTitleElement.textContent = firstTitle
      ? firstTitle.textContent.trim()
      : "No events available";

  } catch (error) {
    xmlTitleElement.textContent = "Unable to load XML data.";
    console.error("XML Error:", error);
  }
}

// ============================================
// JSON AND XML FILE SIZE COMPARISON
// ============================================

async function compareFileSizes() {
  const messageElement = document.querySelector("#file-size-comparison");
  if (!messageElement) return;

  try {
    const [jsonResponse, xmlResponse] = await Promise.all([
      fetch("./scripts/events.json"),
      fetch("./scripts/events.xml")
    ]);

    if (!jsonResponse.ok || !xmlResponse.ok) {
      throw new Error("Unable to read source files.");
    }

    const jsonText = await jsonResponse.text();
    const xmlText = await xmlResponse.text();

    const jsonSize = new Blob([jsonText]).size;
    const xmlSize = new Blob([xmlText]).size;

    messageElement.textContent = `JSON: ${jsonSize} bytes | XML: ${xmlSize} bytes`;

  } catch (error) {
    messageElement.textContent = "Unable to compare JSON and XML file sizes.";
    console.error("File size error:", error);
  }
}

// ============================================
// HAMBURGER NAVIGATION
// ============================================

const navToggleButton = document.querySelector("#nav-toggle");
const navMenu = document.querySelector("#nav-links");

navToggleButton?.addEventListener("click", () => {
  navMenu?.classList.toggle("is-hidden");
  const isExpanded = !navMenu?.classList.contains("is-hidden");
  navToggleButton.setAttribute("aria-expanded", String(isExpanded));
});

// ============================================
// INITIALIZE APPLICATION
// ============================================

if (eventGrid) {
  loadEvents();
}

console.log("IIIT Vadodara Event Board initialized.");
