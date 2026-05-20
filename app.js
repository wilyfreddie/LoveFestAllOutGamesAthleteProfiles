const DATA_URL = "competition_data.csv";
const ANALYSIS_URL = "sandbagging_analysis_by_athlete.csv";

const state = {
  rows: [],
  analysis: new Map(),
  athletes: [],
  selectedAthlete: "",
  historyCompetition: "",
};

const elements = {
  searchInput: document.querySelector("#searchInput"),
  competitionFilter: document.querySelector("#competitionFilter"),
  divisionFilter: document.querySelector("#divisionFilter"),
  clearFilters: document.querySelector("#clearFilters"),
  athleteCount: document.querySelector("#athleteCount"),
  athleteList: document.querySelector("#athleteList"),
  emptyState: document.querySelector("#emptyState"),
  profileView: document.querySelector("#profileView"),
  profileEyebrow: document.querySelector("#profileEyebrow"),
  athleteName: document.querySelector("#athleteName"),
  profileSubtitle: document.querySelector("#profileSubtitle"),
  riskBadge: document.querySelector("#riskBadge"),
  statCompetitions: document.querySelector("#statCompetitions"),
  statTeams: document.querySelector("#statTeams"),
  statBestOverall: document.querySelector("#statBestOverall"),
  statBestWorkout: document.querySelector("#statBestWorkout"),
  competitionCards: document.querySelector("#competitionCards"),
  historyCompetitionFilter: document.querySelector("#historyCompetitionFilter"),
  historyCount: document.querySelector("#historyCount"),
  historyBody: document.querySelector("#historyBody"),
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [
    header,
    cells[index] ?? "",
  ])));
}

function normalize(value) {
  return String(value || "").trim();
}

function numberValue(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values) {
  return [...new Set(values.map(normalize).filter(Boolean))];
}

function formatRank(value) {
  const number = numberValue(value);
  return number === null ? "-" : `#${number}`;
}

function plural(count, singular, pluralWord = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function athleteKey(name) {
  return normalize(name).toLocaleLowerCase();
}

function groupBy(rows, getKey) {
  return rows.reduce((groups, row) => {
    const key = getKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    return groups;
  }, new Map());
}

function populateSelect(select, values, firstLabel) {
  const current = select.value;
  select.replaceChildren(new Option(firstLabel, ""));
  values.forEach((value) => select.append(new Option(value, value)));
  select.value = values.includes(current) ? current : "";
}

function buildAthletes() {
  const groups = groupBy(state.rows, (row) => athleteKey(row.athlete));
  state.athletes = [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      name: normalize(rows[0].athlete),
      rows,
      competitions: unique(rows.map((row) => row.competition)),
      divisions: unique(rows.map((row) => row.division)),
      teams: unique(rows.map((row) => row.team)),
      affiliates: unique(rows.map((row) => row.affiliate)),
    }))
    .filter((athlete) => athlete.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getFilteredAthletes() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase();
  const competition = elements.competitionFilter.value;
  const division = elements.divisionFilter.value;

  return state.athletes.filter((athlete) => {
    const haystack = [
      athlete.name,
      ...athlete.teams,
      ...athlete.divisions,
      ...athlete.competitions,
      ...athlete.affiliates,
    ].join(" ").toLocaleLowerCase();

    return (!query || haystack.includes(query))
      && (!competition || athlete.competitions.includes(competition))
      && (!division || athlete.divisions.includes(division));
  });
}

function renderAthleteList() {
  const athletes = getFilteredAthletes();
  elements.athleteCount.textContent = plural(athletes.length, "athlete");
  elements.athleteList.replaceChildren();

  if (!athletes.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No athletes match those filters.";
    elements.athleteList.append(empty);
    return;
  }

  athletes.slice(0, 250).forEach((athlete) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "athlete-button";
    if (athlete.name === state.selectedAthlete) button.classList.add("active");
    button.innerHTML = `
      <strong>${escapeHtml(athlete.name)}</strong>
      <span>${escapeHtml(athlete.teams.slice(0, 2).join(", ") || "No team listed")}</span>
      <span>${escapeHtml(athlete.competitions.join(" / "))}</span>
    `;
    button.addEventListener("click", () => selectAthlete(athlete.name));
    elements.athleteList.append(button);
  });
}

function escapeHtml(value) {
  return normalize(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function selectAthlete(name) {
  state.selectedAthlete = name;
  state.historyCompetition = "";
  elements.historyCompetitionFilter.value = "";
  renderAthleteList();
  renderProfile();
}

function athleteRows() {
  return state.rows.filter((row) => normalize(row.athlete) === state.selectedAthlete);
}

function renderProfile() {
  const rows = athleteRows();
  if (!rows.length) {
    elements.emptyState.classList.remove("hidden");
    elements.profileView.classList.add("hidden");
    return;
  }

  elements.emptyState.classList.add("hidden");
  elements.profileView.classList.remove("hidden");

  const competitions = unique(rows.map((row) => row.competition));
  const teams = unique(rows.map((row) => row.team));
  const divisions = unique(rows.map((row) => row.division));
  const affiliates = unique(rows.map((row) => row.affiliate));
  const overallRanks = rows.map((row) => numberValue(row.overall_rank)).filter((value) => value !== null);
  const workoutRanks = rows.map((row) => numberValue(row.workout_rank)).filter((value) => value !== null);

  elements.profileEyebrow.textContent = divisions.slice(0, 3).join(" / ");
  elements.athleteName.textContent = state.selectedAthlete;
  elements.profileSubtitle.textContent = [
    teams.join(", "),
    affiliates.join(", "),
  ].filter(Boolean).join(" - ");

  elements.statCompetitions.textContent = competitions.length;
  elements.statTeams.textContent = teams.length;
  elements.statBestOverall.textContent = overallRanks.length ? `#${Math.min(...overallRanks)}` : "-";
  elements.statBestWorkout.textContent = workoutRanks.length ? `#${Math.min(...workoutRanks)}` : "-";

  renderRiskBadge();
  populateSelect(elements.historyCompetitionFilter, competitions, "All history");
  elements.historyCompetitionFilter.value = state.historyCompetition;
  renderCompetitionCards(rows);
  renderHistory(rows);
}

function renderRiskBadge() {
  const rows = state.analysis.get(athleteKey(state.selectedAthlete)) || [];
  const best = rows
    .map((row) => ({
      flag: normalize(row.risk_flag),
      score: numberValue(row.sandbagging_score) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)[0];

  elements.riskBadge.className = "risk-badge";
  if (!best) {
    elements.riskBadge.textContent = "No risk data";
    return;
  }

  const score = Math.round(best.score * 100);
  elements.riskBadge.textContent = `${best.flag} - ${score}`;
  if (best.flag.includes("HIGH")) elements.riskBadge.classList.add("high");
  else if (best.flag.includes("MEDIUM")) elements.riskBadge.classList.add("medium");
  else elements.riskBadge.classList.add("low");
}

function renderCompetitionCards(rows) {
  const grouped = groupBy(rows, (row) => `${row.competition}|${row.division}|${row.team}`);
  elements.competitionCards.replaceChildren();

  [...grouped.values()].forEach((groupRows) => {
    const first = groupRows[0];
    const workoutRanks = groupRows.map((row) => numberValue(row.workout_rank)).filter((value) => value !== null);
    const overallRanks = groupRows.map((row) => numberValue(row.overall_rank)).filter((value) => value !== null);
    const avgRank = workoutRanks.length
      ? workoutRanks.reduce((sum, value) => sum + value, 0) / workoutRanks.length
      : null;

    const card = document.createElement("article");
    card.className = "competition-card";
    card.innerHTML = `
      <div>
        <h4>${escapeHtml(first.competition)}</h4>
        <p class="muted">${escapeHtml(first.division)} - ${escapeHtml(first.team)}</p>
      </div>
      <div class="mini-stats">
        <span>Overall <strong>${overallRanks.length ? `#${Math.min(...overallRanks)}` : "-"}</strong></span>
        <span>Avg workout <strong>${avgRank ? avgRank.toFixed(1) : "-"}</strong></span>
        <span>Events <strong>${unique(groupRows.map((row) => row.workout)).length}</strong></span>
      </div>
      <div class="rank-bars">${renderRankBars(groupRows)}</div>
    `;
    elements.competitionCards.append(card);
  });
}

function renderRankBars(rows) {
  const ranked = rows
    .filter((row) => normalize(row.workout))
    .slice()
    .sort((a, b) => (numberValue(a.workout_rank) ?? 9999) - (numberValue(b.workout_rank) ?? 9999))
    .slice(0, 5);

  if (!ranked.length) return '<p class="muted">No workout ranks recorded.</p>';

  const maxRank = Math.max(...ranked.map((row) => numberValue(row.workout_rank) ?? 1), 1);
  return ranked.map((row) => {
    const rank = numberValue(row.workout_rank) ?? maxRank;
    const width = Math.max(8, 100 - ((rank - 1) / maxRank) * 75);
    return `
      <div class="rank-bar">
        <span>${escapeHtml(row.workout)}</span>
        <span class="bar-track"><span class="bar-fill" style="width: ${width}%"></span></span>
        <strong>${formatRank(row.workout_rank)}</strong>
      </div>
    `;
  }).join("");
}

function renderHistory(rows) {
  const competition = state.historyCompetition;
  const history = rows
    .filter((row) => !competition || row.competition === competition)
    .slice()
    .sort((a, b) => (
      a.competition.localeCompare(b.competition)
      || a.division.localeCompare(b.division)
      || (numberValue(a.workout_rank) ?? 9999) - (numberValue(b.workout_rank) ?? 9999)
      || a.workout.localeCompare(b.workout)
    ));

  elements.historyCount.textContent = plural(history.length, "row");
  elements.historyBody.replaceChildren();

  history.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(row.competition)}</td>
      <td>${escapeHtml(row.division)}</td>
      <td>${escapeHtml(row.team)}</td>
      <td>${escapeHtml(row.workout)}</td>
      <td>${formatRank(row.workout_rank)}</td>
      <td>${escapeHtml(row.workout_score)}</td>
      <td>${escapeHtml(row.workout_points)}</td>
    `;
    elements.historyBody.append(tr);
  });
}

function bindEvents() {
  elements.searchInput.addEventListener("input", renderAthleteList);
  elements.competitionFilter.addEventListener("change", renderAthleteList);
  elements.divisionFilter.addEventListener("change", renderAthleteList);
  elements.clearFilters.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.competitionFilter.value = "";
    elements.divisionFilter.value = "";
    renderAthleteList();
  });
  elements.historyCompetitionFilter.addEventListener("change", (event) => {
    state.historyCompetition = event.target.value;
    renderHistory(athleteRows());
  });
}

async function loadCsv(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return parseCsv(await response.text());
}

async function init() {
  bindEvents();
  try {
    const [rows, analysisRows] = await Promise.all([
      loadCsv(DATA_URL),
      loadCsv(ANALYSIS_URL).catch(() => []),
    ]);

    state.rows = rows.filter((row) => normalize(row.athlete));
    state.analysis = groupBy(analysisRows, (row) => athleteKey(row.athlete));
    buildAthletes();
    populateSelect(elements.competitionFilter, unique(state.rows.map((row) => row.competition)).sort(), "All competitions");
    populateSelect(elements.divisionFilter, unique(state.rows.map((row) => row.division)).sort(), "All divisions");
    renderAthleteList();

    if (state.athletes.length) selectAthlete(state.athletes[0].name);
  } catch (error) {
    elements.athleteCount.textContent = "Data failed to load";
    elements.athleteList.innerHTML = `
      <p class="muted">
        ${escapeHtml(error.message)}. Publish this folder with GitHub Pages or run the local helper server.
        Browsers usually block CSV loading when index.html is opened directly from your files.
      </p>
    `;
  }
}

init();
