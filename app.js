// app.js — JavaScript-Logik für „Luftcheck“ (mobile-optimierte Chart-Darstellung)
// ------------------------------------------------------------
// 1. Hilfsfunktion: absolute Feuchte berechnen (g/m³)
function absFeuchte(tempC, rhPercent) {
  const svp = 6.112 * Math.exp((17.62 * tempC) / (243.12 + tempC));
  return (216.7 * (rhPercent / 100) * svp) / (tempC + 273.15);
}

// ------------------------------------------------------------
// 2. Globale Zustände
let latitude = null;
let longitude = null;
let forecastChart = null;
let lastHourly = null; // Cache für stündliche Weather-API-Daten

// ------------------------------------------------------------
// 3. Utility: Mobile-Erkennung & Debounce
const MOBILE_BP = 480; // Breakpoint in px
const isMobile = () => window.innerWidth <= MOBILE_BP;

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ------------------------------------------------------------
// 4. API – Open-Meteo (stündlich Temperatur & rel. Feuchte)
async function fetchHourly() {
  if (latitude === null || longitude === null)
    throw new Error("location-missing");

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,relative_humidity_2m&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather-fetch-failed");

  lastHourly = await res.json();
  return lastHourly;
}

// ------------------------------------------------------------
// 5. UI-Updater "Aktuell draußen" + nächster Lüftungszeitpunkt
async function updateWeatherNow() {
  const weatherNow = document.getElementById("weather-now");
  try {
    const data = lastHourly ?? (await fetchHourly());

    const now = new Date();
    const hours = data.hourly.time.map((t) => new Date(t));
    const idx = hours.findIndex(
      (h) =>
        h.getHours() === now.getHours() &&
        h.getDate() === now.getDate() &&
        h.getMonth() === now.getMonth() &&
        h.getFullYear() === now.getFullYear()
    );

    const tempOut = data.hourly.temperature_2m[idx];
    const rhOut = data.hourly.relative_humidity_2m[idx];
    const ahOut = absFeuchte(tempOut, rhOut).toFixed(1);

    weatherNow.textContent = `Aktuell draußen: ${tempOut} °C, ${rhOut}% rF → ${ahOut} g/m³`;

    // Innenwerte (falls vorhanden)
    const tempInVal = parseFloat(document.getElementById("temp_in").value);
    const rhInVal = parseFloat(document.getElementById("rh_in").value);
    if (!isNaN(tempInVal) && !isNaN(rhInVal)) {
      const ahIn = absFeuchte(tempInVal, rhInVal);
      const goodIdx = data.hourly.temperature_2m.findIndex((_, i) => {
        const ah = absFeuchte(
          data.hourly.temperature_2m[i],
          data.hourly.relative_humidity_2m[i]
        );
        return ah < ahIn - 1;
      });
      if (goodIdx !== -1) {
        const t = new Date(data.hourly.time[goodIdx]);
        const ts = `${t.toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
        })} ${t.toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;
        weatherNow.textContent += `\nNächste gute Lüftungszeit: ${ts}`;
      } else {
        weatherNow.textContent += `\nHeute voraussichtlich kein optimaler Lüftungszeitpunkt.`;
      }
    }
  } catch (e) {
    weatherNow.textContent =
      e.message === "location-missing"
        ? "Bitte Standort angeben."
        : "Fehler beim Abrufen der Wetterdaten.";
  }
}

// ------------------------------------------------------------
// 6. Chart zeichnen — Mobile-optimierte Optionen
async function drawChart() {
  if (forecastChart) forecastChart.destroy();
  const ctx = document.getElementById("forecastChart").getContext("2d");

  const data = lastHourly ?? (await fetchHourly());
  const now = new Date();
  const hours = data.hourly.time.map((t) => new Date(t));
  const idx = hours.findIndex(
    (h) => h.getHours() === now.getHours() && h.getDate() === now.getDate()
  );

  const labels = hours
    .slice(idx)
    .map(
      (h) =>
        `${h.toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
        })} ${h.toLocaleTimeString("de-DE", {
          hour: "2-digit",
          minute: "2-digit",
        })}`
    );
  const temps = data.hourly.temperature_2m.slice(idx);
  const hums = data.hourly.relative_humidity_2m.slice(idx);
  const abs = temps.map((t, i) => absFeuchte(t, hums[i]));

  const mobile = isMobile();
  const maxXTicks = mobile ? 3 : 12;
  const maxYTicks = mobile ? 4 : 10;
  const fontSize = mobile ? 10 : 12;

  forecastChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Temperatur (°C)",
          data: temps,
          borderColor: "orange",
          hidden: mobile,
          yAxisID: "y",
          tension: 0.3,
        },
        {
          label: "rel. Feuchte (%)",
          data: hums,
          borderColor: "blue",
          hidden: mobile,
          yAxisID: "y1",
          tension: 0.3,
        },
        {
          label: "Abs. Feuchte (g/m³)",
          data: abs,
          borderColor: "green",
          yAxisID: "y2",
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: mobile ? 5 : 15 },
      plugins: {
        legend: { display: !mobile, position: mobile ? "bottom" : "top" },
        title: { display: !mobile, text: "Außenprognose (stündlich)" },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: maxXTicks,
            font: { size: fontSize },
          },
        },
        y: {
          type: "linear",
          position: "left",
          title: mobile ? {} : { display: true, text: "Temperatur (°C)" },
          ticks: { maxTicksLimit: maxYTicks, font: { size: fontSize } },
        },
        y1: {
          type: "linear",
          position: "right",
          title: mobile ? {} : { display: true, text: "rel. Feuchte (%)" },
          grid: { drawOnChartArea: false },
          ticks: { maxTicksLimit: maxYTicks, font: { size: fontSize } },
        },
        y2: {
          type: "linear",
          position: "right",
          title: mobile ? {} : { display: true, text: "Abs. Feuchte (g/m³)" },
          grid: { drawOnChartArea: false },
          ticks: {
            color: "green",
            maxTicksLimit: maxYTicks,
            font: { size: fontSize },
          },
          offset: true,
        },
      },
    },
  });
}

// Re-render Chart on viewport resize (debounced)
window.addEventListener(
  "resize",
  debounce(() => {
    if (forecastChart) drawChart();
  }, 300)
);

// ------------------------------------------------------------
// 7. User-Aktionen
async function checkLueften() {
  const tempIn = parseFloat(document.getElementById("temp_in").value);
  const rhIn = parseFloat(document.getElementById("rh_in").value);
  const output = document.getElementById("output");

  if (isNaN(tempIn) || isNaN(rhIn)) {
    output.textContent = "Bitte beide Werte korrekt eingeben.";
    return;
  }

  try {
    const data = lastHourly ?? (await fetchHourly());
    const now = new Date();
    const hours = data.hourly.time.map((t) => new Date(t));
    const idx = hours.findIndex(
      (h) => h.getHours() === now.getHours() && h.getDate() === now.getDate()
    );

    const tempOut = data.hourly.temperature_2m[idx];
    const rhOut = data.hourly.relative_humidity_2m[idx];

    const ahIn = absFeuchte(tempIn, rhIn);
    const ahOut = absFeuchte(tempOut, rhOut);

    let msg = `Innen: ${ahIn.toFixed(1)} g/m³\nAußen: ${ahOut.toFixed(1)} g/m³`;
    msg +=
      ahOut < ahIn - 1
        ? "\n\n✅ Jetzt ist ein guter Zeitpunkt zum Lüften!"
        : "\n\n❌ Lieber Fenster geschlossen lassen.";
    output.textContent = msg;

    updateWeatherNow();
    drawChart();
  } catch {
    output.textContent = "Fehler beim Abrufen der Wetterdaten.";
  }
}

function useLocation() {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
      lastHourly = null;
      updateWeatherNow();
      drawChart();
    },
    () => {
      document.getElementById("weather-now").textContent =
        "GPS-Zugriff abgelehnt oder fehlgeschlagen.";
    }
  );
}

async function resolveLocation() {
  const query = document.getElementById("location_input").value.trim();
  if (!query) return;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&format=json&limit=1`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.length === 0) throw new Error("not-found");

    latitude = parseFloat(json[0].lat);
    longitude = parseFloat(json[0].lon);
    lastHourly = null;
    updateWeatherNow();
    drawChart();
  } catch {
    document.getElementById("weather-now").textContent = "Ort nicht gefunden.";
  }
}
