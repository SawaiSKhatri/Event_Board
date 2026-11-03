const websiteTitle = "IIIT Vadodara Event Board";
const totalEvents = 4;
const isOnlinePortal = true;

let availableSeats = 15;

availableSeats = 12;

console.log("Website:", websiteTitle);
console.log("Total Events:", totalEvents);
console.log("Online Portal:", isOnlinePortal);
console.log("Available Seats:", availableSeats);

let events = [];

function getEventStatus(ev) {
  if (ev.seats === 0) {
    return "Full";
  } else if (ev.seats < 5) {
    return "Few left";
  } else {
    return "Open";
  }
}

function formatEvent(ev) {
  return `${ev.title} | Date: ${ev.date} | Seats: ${ev.seats}`;
}

const getAvailableEvents = () => events.filter((ev) => ev.seats > 0);

function demonstrateScope() {
  const message = "This variable is inside the function.";

  console.log(message);
}

demonstrateScope();

const eventGrid = document.querySelector("#event-grid");

const loadingMessage = document.getElementById("loading-message");

const navigationLinks = document.querySelectorAll(".nav-links a");

console.log("Event Grid:", eventGrid);
console.log("Navigation Links:", navigationLinks);

function renderEvents(eventList) {
  eventGrid.textContent = "";

  // Show message when no events match the search
  if (eventList.length === 0) {
    const message = document.createElement("p");

    message.textContent = "No matching events found.";

    eventGrid.appendChild(message);

    return;
  }

  for (const ev of eventList) {
    const card = document.createElement("article");

    card.classList.add("event-card");

    const title = document.createElement("h3");
    title.textContent = ev.title;

    const description = document.createElement("p");
    description.textContent = ev.description;

    const date = document.createElement("time");
    date.textContent = new Date(ev.date + "T00:00:00").toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "long",
        year: "numeric",
      },
    );

    date.setAttribute("datetime", ev.date);

    const seats = document.createElement("p");
    seats.textContent = "Available Seats: " + ev.seats;

    const status = document.createElement("span");
    status.textContent = getEventStatus(ev);

    status.classList.add("tag");

    if (ev.seats === 0) {
      card.classList.add("full");

      status.classList.add("full-tag");

      status.style.color = "#ef4444";
    } else if (ev.seats < 5) {
      status.classList.add("few-left-tag");

      status.style.color = "#f97316";
    } else {
      status.classList.add("active-tag");
    }

    card.setAttribute("aria-label", ev.title + " - " + getEventStatus(ev));

    // B5: CREATE RSVP BUTTON

    const rsvpButton = document.createElement("button");

    rsvpButton.textContent = ev.seats === 0 ? "Fully Booked" : "RSVP Now";

    rsvpButton.classList.add("btn-primary", "rsvp-button");

    rsvpButton.setAttribute("data-event-id", ev.id);

    // Disable button when no seats are available
    rsvpButton.disabled = ev.seats === 0;

    // Add all elements to the card
    card.appendChild(title);
    card.appendChild(description);
    card.appendChild(date);
    card.appendChild(seats);
    card.appendChild(status);
    card.appendChild(rsvpButton);

    eventGrid.appendChild(card);

    console.log(formatEvent(ev));
  }

  console.log("Events rendered successfully!");
}

// ==========================================
// B5: EVENT BUBBLING + event.target

if (eventGrid) {
  eventGrid.addEventListener("click", function (event) {
    // Identify the exact clicked element
    const clickedButton = event.target.closest(".rsvp-button");

    // Ignore clicks outside RSVP buttons
    if (!clickedButton) {
      return;
    }

    // Get event ID from the clicked button
    const eventId = Number(clickedButton.getAttribute("data-event-id"));

    // Find the matching event
    const selectedEvent = events.find((ev) => ev.id === eventId);

    if (selectedEvent && selectedEvent.seats > 0) {
      // Reduce available seats
      selectedEvent.seats--;

      console.log("RSVP successful:", selectedEvent.title);

      console.log("Remaining seats:", selectedEvent.seats);

      // Refresh the event cards
      filterAndRenderEvents();
    }
  });
}
async function loadEvents() {
  try {
    eventGrid.textContent = "Loading events...";

    const response = await fetch("./scripts/events.json");

    if (!response.ok) {
      throw new Error("Unable to load event data.");
    }

    events = await response.json();

    console.log("Fetched Events:", events);

    // B2: Accessing JSON data using array index and dot notation
    console.log("First Event Title:", events[0].title);

    console.log(
      "Last Event Seats:",
      events[events.length - 1].seats
    );

    renderEvents(events);

  } catch (error) {
    console.error("Fetch Error:", error);

    eventGrid.textContent =
      "Sorry! We couldn't load the events. Please try again later.";
  }

  // B3: JSON Round-trip (Object -> Text -> Object)

// Convert JavaScript array into JSON string
const jsonString = JSON.stringify(events, null, 2);

console.log("JSON String:");
console.log(jsonString);

// Convert JSON string back into JavaScript array
const convertedEvents = JSON.parse(jsonString);

console.log("Converted Array:", convertedEvents);

// Check whether both arrays contain the same data
console.log(
    "Round-trip successful:",
    JSON.stringify(events) === JSON.stringify(convertedEvents)
);

}

if (eventGrid) {
  loadEvents();
}

//B4 For hamburger menu
const navToggleButton = document.querySelector("#nav-toggle");

const navMenu = document.querySelector("#nav-links");

if (navToggleButton && navMenu) {
  navToggleButton.addEventListener("click", function () {
    // Toggle navigation visibility
    navMenu.classList.toggle("is-hidden");

    // Update accessibility state
    const isExpanded = !navMenu.classList.contains("is-hidden");

    navToggleButton.setAttribute("aria-expanded", isExpanded);

    console.log("Navigation toggled:", isExpanded);
  });
}

// B6: SEARCH EVENTS
// input event + keydown event

// Select search input
const eventSearchInput = document.querySelector("#event-search");

// Function to filter and display events
function filterAndRenderEvents() {
  const searchTerm = eventSearchInput
    ? eventSearchInput.value.trim().toLowerCase()
    : "";

  // Arrow function + filter method
  const filteredEvents = events.filter(
    (ev) =>
      ev.title.toLowerCase().includes(searchTerm) ||
      ev.description.toLowerCase().includes(searchTerm),
  );

  // Display filtered events
  renderEvents(filteredEvents);

  console.log("Search Results:", filteredEvents);
}

// B6: INPUT EVENT

if (eventSearchInput) {
  eventSearchInput.addEventListener("input", function () {
    filterAndRenderEvents();
  });

  // ======================================
  // B6: KEYDOWN EVENT (Escape key)
  // ======================================

  eventSearchInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      // Clear search field
      eventSearchInput.value = "";

      // Display all events again
      filterAndRenderEvents();

      console.log("Search cleared using Escape key");
    }
  });
}

async function loadXMLData() {

    const xmlTitleElement = document.querySelector("#xml-first-title");

    if (!xmlTitleElement) {
        return;
    }

    try {

        // Fetch XML file from the root folder
        const response = await fetch("../events.xml");

        if (!response.ok) {
            throw new Error("XML file could not be loaded");
        }

        // Read XML as text
        const xmlText = await response.text();

        // Convert XML text into an XML document
        const parser = new DOMParser();

        const xmlDocument = parser.parseFromString(
            xmlText,
            "application/xml"
        );

        // Check for XML parsing errors
        if (xmlDocument.querySelector("parsererror")) {
            throw new Error("Invalid XML format");
        }

        // Read all title elements
        const titles = xmlDocument.getElementsByTagName("title");

        // Display first event title
        if (titles.length > 0) {

            xmlTitleElement.textContent = titles[0].textContent.trim();

            console.log(
                "First XML Event Title:",
                titles[0].textContent.trim()
            );

        }

    } catch (error) {

        xmlTitleElement.textContent = "Unable to load XML data.";

        console.error("XML Error:", error);

    }

}

// Execute XML loading
loadXMLData();


// B5: COMPARE JSON AND XML FILE SIZES

async function compareFileSizes() {

    try {

        // Fetch both files
        const jsonResponse = await fetch("../events.json");
        const xmlResponse = await fetch("../events.xml");

        if (!jsonResponse.ok || !xmlResponse.ok) {
            throw new Error("Unable to read both files");
        }

        // Read both files as text
        const jsonText = await jsonResponse.text();
        const xmlText = await xmlResponse.text();

        // Calculate actual UTF-8 byte sizes
        const jsonSize = new Blob([jsonText]).size;
        const xmlSize = new Blob([xmlText]).size;

        console.log("JSON File Size:", jsonSize, "bytes");
        console.log("XML File Size:", xmlSize, "bytes");

        if (jsonSize > xmlSize) {

            console.log("JSON is larger than XML.");

        } else if (xmlSize > jsonSize) {

            console.log("XML is larger than JSON.");

        } else {

            console.log("Both files have equal sizes.");

        }

    } catch (error) {

        console.error("File Size Error:", error);

    }

}

// Execute file size comparison
compareFileSizes();