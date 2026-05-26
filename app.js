const DATA_URL = "competition_data.csv";
const ANALYSIS_URL = "sandbagging_analysis_by_athlete.csv";
const THEME_KEY = "lovefest-theme";

const state = {
  rows: [],
  analysis: new Map(),
  athletes: [],
  movements: [],
  selectedAthlete: "",
  historyCompetition: "",
  activeView: "leaderboards",
};

const elements = {
  searchInput: document.querySelector("#searchInput"),
  themeToggle: document.querySelector("#themeToggle"),
  themeIcon: document.querySelector("#themeIcon"),
  themeText: document.querySelector("#themeText"),
  profilesTab: document.querySelector("#profilesTab"),
  leaderboardsTab: document.querySelector("#leaderboardsTab"),
  competitionFilter: document.querySelector("#competitionFilter"),
  divisionFilter: document.querySelector("#divisionFilter"),
  riskFilter: document.querySelector("#riskFilter"),
  clearFilters: document.querySelector("#clearFilters"),
  athleteCount: document.querySelector("#athleteCount"),
  includedCompetitions: document.querySelector("#includedCompetitions"),
  athleteList: document.querySelector("#athleteList"),
  insightsView: document.querySelector("#insightsView"),
  datasetMeta: document.querySelector("#datasetMeta"),
  coverageSummary: document.querySelector("#coverageSummary"),
  boxLeaderboardMeta: document.querySelector("#boxLeaderboardMeta"),
  boxLeaderboard: document.querySelector("#boxLeaderboard"),
  riskLeaderboardMeta: document.querySelector("#riskLeaderboardMeta"),
  riskLeaderboard: document.querySelector("#riskLeaderboard"),
  movementMeta: document.querySelector("#movementMeta"),
  movementList: document.querySelector("#movementList"),
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
  riskScoreMeta: document.querySelector("#riskScoreMeta"),
  riskCalculation: document.querySelector("#riskCalculation"),
  divisionTimelineMeta: document.querySelector("#divisionTimelineMeta"),
  divisionTimeline: document.querySelector("#divisionTimeline"),
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

function hasTeamMembers(row) {
  const athlete = athleteKey(row.athlete);
  const athletes = athleteKey(row.athletes);
  return athletes && athletes !== athlete;
}

function isTeamOnlyRow(row) {
  return row.athlete && row.team && row.athletes
    && row.athlete === row.team
    && row.team === row.athletes;
}

function athleteTeams(rows) {
  return unique(rows
    .filter((row) => hasTeamMembers(row))
    .map((row) => row.team));
}

function formatRank(value) {
  const number = numberValue(value);
  return number === null ? "-" : `#${number}`;
}

function plural(count, singular, pluralWord = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en").format(value);
}

function percent(value) {
  const number = numberValue(value);
  return number === null ? "-" : `${Math.round(number * 100)}%`;
}

function competitionYear(value) {
  return numberValue(normalize(value).match(/\b(20\d{2})\b/)?.[1]) ?? 0;
}

function compareCompetitions(a, b) {
  return competitionYear(a) - competitionYear(b) || a.localeCompare(b);
}

function divisionLevel(value) {
  const division = normalize(value).toLocaleUpperCase();
  if (!division) return null;
  if (division.includes("BOOTCAMP") || division.includes("CHILL OUT")) return 1;
  if (division.includes("SCALED") || division.includes("SWEAT OUT")) return 2;
  if (division.includes("RX") || division.includes("ALL OUT")) return 3;
  return null;
}

function divisionLevelLabel(level) {
  return {
    1: "Bootcamp",
    2: "Scaled",
    3: "RX",
  }[level] || "Mixed";
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

function preferredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  elements.themeIcon.textContent = isDark ? "☀" : "☾";
  elements.themeText.textContent = isDark ? "Light mode" : "Dark mode";
  elements.themeToggle.setAttribute(
    "aria-label",
    isDark ? "Switch to light mode" : "Switch to dark mode",
  );
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function setActiveView(view) {
  state.activeView = view;
  const showingLeaderboards = view === "leaderboards";
  const hasProfile = Boolean(state.selectedAthlete)
    && state.rows.some((row) => normalize(row.athlete) === state.selectedAthlete);

  elements.insightsView.classList.toggle("hidden", !showingLeaderboards);
  elements.profileView.classList.toggle("hidden", showingLeaderboards || !hasProfile);
  elements.emptyState.classList.toggle("hidden", showingLeaderboards || hasProfile);
  elements.profilesTab.classList.toggle("active", !showingLeaderboards);
  elements.leaderboardsTab.classList.toggle("active", showingLeaderboards);
}

function renderIncludedCompetitions() {
  const competitions = unique(state.rows.map((row) => row.competition)).sort(compareCompetitions);
  elements.includedCompetitions.replaceChildren();

  competitions.forEach((competition) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "competition-pill";
    pill.textContent = competition
      .replace("Love Fest ", "LF ")
      .replace("All Out Games ", "AO ");
    pill.title = competition;
    pill.addEventListener("click", () => {
      elements.competitionFilter.value = competition;
      renderAthleteList();
    });
    elements.includedCompetitions.append(pill);
  });
}

function competitionSummaries() {
  return [...groupBy(state.rows, (row) => row.competition).entries()]
    .map(([competition, rows]) => ({
      competition,
      rows,
      athletes: unique(rows.map((row) => row.athlete)).length,
      teams: unique(rows.map((row) => `${row.competition}|${row.division}|${row.team}`)).length,
      divisions: unique(rows.map((row) => row.division)).length,
      workouts: unique(rows.map((row) => `${row.competition}|${row.division}|${row.workout}`)).length,
    }))
    .sort((a, b) => compareCompetitions(a.competition, b.competition));
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
      teams: athleteTeams(rows),
      affiliates: unique(rows.map((row) => row.affiliate)),
      risk: getBestRiskForKey(key),
    }))
    .filter((athlete) => athlete.name && !athlete.rows.every(isTeamOnlyRow))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildMovements() {
  state.movements = state.athletes
    .map((athlete) => {
      const entries = [...groupBy(athlete.rows, (row) => row.competition).entries()]
        .map(([competition, rows]) => {
          const divisions = unique(rows.map((row) => row.division));
          const levels = divisions.map(divisionLevel).filter((value) => value !== null);
          const level = levels.length ? Math.max(...levels) : null;
          const overallRanks = rows.map((row) => numberValue(row.overall_rank)).filter((value) => value !== null);
          return {
            competition,
            divisions,
            level,
            bestOverall: overallRanks.length ? Math.min(...overallRanks) : null,
          };
        })
        .filter((entry) => entry.level !== null)
        .sort((a, b) => compareCompetitions(a.competition, b.competition));

      const levels = entries.map((entry) => entry.level);
      const first = levels[0] ?? null;
      const last = levels[levels.length - 1] ?? null;
      const changed = new Set(levels).size > 1;
      const direction = first !== null && last !== null
        ? Math.sign(last - first)
        : 0;

      return {
        athlete,
        entries,
        changed,
        direction,
        swing: levels.length ? Math.max(...levels) - Math.min(...levels) : 0,
      };
    })
    .filter((movement) => movement.entries.length > 1 && movement.changed)
    .sort((a, b) => (
      b.swing - a.swing
      || Math.abs(b.direction) - Math.abs(a.direction)
      || a.athlete.name.localeCompare(b.athlete.name)
    ));
}

function boxSummaries() {
  const groups = groupBy(
    state.rows.filter((row) => normalize(row.affiliate)),
    (row) => normalize(row.affiliate).toLocaleUpperCase(),
  );

  return [...groups.values()]
    .map((rows) => {
      const affiliate = normalize(rows[0].affiliate);
      const athleteNames = unique(rows.map((row) => row.athlete));
      const athleteRisks = athleteNames
        .map((name) => getBestRiskForKey(athleteKey(name)))
        .filter(Boolean);
      const highRiskCount = athleteRisks.filter((risk) => risk.level === "HIGH").length;
      const podiumTeams = unique(rows
        .filter((row) => {
          const rank = numberValue(row.overall_rank);
          return rank !== null && rank <= 3;
        })
        .map((row) => `${row.competition}|${row.division}|${row.team}`));

      return {
        affiliate,
        athletes: athleteNames.length,
        teams: unique(rows.map((row) => `${row.competition}|${row.division}|${row.team}`)).length,
        competitions: unique(rows.map((row) => row.competition)).length,
        podiums: podiumTeams.length,
        highRiskCount,
      };
    })
    .sort((a, b) => (
      b.athletes - a.athletes
      || b.podiums - a.podiums
      || b.competitions - a.competitions
      || a.affiliate.localeCompare(b.affiliate)
    ));
}

function renderInsights() {
  elements.insightsView.classList.remove("hidden");
  renderCoverageSummary();
  renderBoxLeaderboard();
  renderRiskLeaderboard();
  renderMovementList();
}

function renderCoverageSummary() {
  const summaries = competitionSummaries();
  elements.datasetMeta.textContent = `${plural(state.athletes.length, "athlete")} - ${plural(summaries.length, "competition")}`;
  elements.coverageSummary.replaceChildren();

  summaries.forEach((summary) => {
    const card = document.createElement("article");
    card.className = "coverage-card";
    card.innerHTML = `
      <h3>${escapeHtml(summary.competition)}</h3>
      <div class="coverage-stats">
        <span>Athletes <strong>${formatNumber(summary.athletes)}</strong></span>
        <span>Teams <strong>${formatNumber(summary.teams)}</strong></span>
        <span>Divisions <strong>${formatNumber(summary.divisions)}</strong></span>
        <span>Rows <strong>${formatNumber(summary.rows.length)}</strong></span>
      </div>
    `;
    elements.coverageSummary.append(card);
  });
}

function renderRiskLeaderboard() {
  const ranked = state.athletes
    .filter((athlete) => athlete.risk)
    .slice()
    .sort((a, b) => b.risk.score - a.risk.score || a.name.localeCompare(b.name))
    .slice(0, 10);

  elements.riskLeaderboardMeta.textContent = ranked.length ? "Top 10" : "";
  elements.riskLeaderboard.replaceChildren();

  if (!ranked.length) {
    elements.riskLeaderboard.innerHTML = '<p class="muted">No risk analysis rows are available yet.</p>';
    return;
  }

  ranked.forEach((athlete, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "insight-item";
    item.innerHTML = `
      <span class="item-rank">${index + 1}</span>
      <span>
        <strong>${escapeHtml(athlete.name)}</strong>
        <small>${escapeHtml(athlete.risk.row.division || "Division not listed")} - ${escapeHtml(athlete.risk.row.competition || "Competition not listed")}</small>
      </span>
      <small class="risk-dot ${athlete.risk.level.toLocaleLowerCase()}">🚩 ${Math.round(athlete.risk.score * 100)}</small>
    `;
    item.addEventListener("click", () => selectAthlete(athlete.name));
    elements.riskLeaderboard.append(item);
  });
}

function renderBoxLeaderboard() {
  const boxes = boxSummaries().slice(0, 10);
  elements.boxLeaderboardMeta.textContent = boxes.length ? "Top 10 by athletes" : "";
  elements.boxLeaderboard.replaceChildren();

  if (!boxes.length) {
    elements.boxLeaderboard.innerHTML = '<p class="muted">No affiliate or box data is available yet.</p>';
    return;
  }

  boxes.forEach((box, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "insight-item box-item";
    item.innerHTML = `
      <span class="item-rank">${index + 1}</span>
      <span>
        <strong>${escapeHtml(box.affiliate)}</strong>
        <small>${plural(box.athletes, "athlete")} - ${plural(box.competitions, "competition")}</small>
      </span>
      <span class="box-score">
        <small>🥇 ${box.podiums}</small>
        <small>🚩 ${box.highRiskCount}</small>
      </span>
    `;
    item.addEventListener("click", () => {
      elements.searchInput.value = box.affiliate;
      setActiveView("profiles");
      renderAthleteList();
    });
    elements.boxLeaderboard.append(item);
  });
}

function renderMovementList() {
  const movements = state.movements.slice(0, 10);
  elements.movementMeta.textContent = state.movements.length
    ? plural(state.movements.length, "athlete")
    : "";
  elements.movementList.replaceChildren();

  if (!movements.length) {
    elements.movementList.innerHTML = '<p class="muted">No multi-division movement detected yet.</p>';
    return;
  }

  movements.forEach((movement) => {
    const first = movement.entries[0];
    const last = movement.entries[movement.entries.length - 1];
    const direction = movement.direction > 0 ? "⬆ Moved up" : movement.direction < 0 ? "⬇ Moved down" : "↔ Changed";
    const item = document.createElement("button");
    item.type = "button";
    item.className = "insight-item";
    item.innerHTML = `
      <span class="movement-badge ${movement.direction < 0 ? "down" : "up"}">${escapeHtml(direction)}</span>
      <span>
        <strong>${escapeHtml(movement.athlete.name)}</strong>
        <small>${escapeHtml(divisionLevelLabel(first.level))} to ${escapeHtml(divisionLevelLabel(last.level))}</small>
      </span>
      <small>${escapeHtml(`${first.competition} - ${last.competition}`)}</small>
    `;
    item.addEventListener("click", () => selectAthlete(movement.athlete.name));
    elements.movementList.append(item);
  });
}

function getFilteredAthletes() {
  const query = elements.searchInput.value.trim().toLocaleLowerCase();
  const competition = elements.competitionFilter.value;
  const division = elements.divisionFilter.value;
  const risk = elements.riskFilter.value;

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
      && (!division || athlete.divisions.includes(division))
      && matchesRiskFilter(athlete.risk, risk);
  });
}

function matchesRiskFilter(risk, filter) {
  if (!filter) return true;
  if (filter === "NONE") return !risk;
  return risk?.level === filter;
}

function renderAthleteList() {
  const athletes = getFilteredAthletes();
  elements.athleteCount.textContent = plural(athletes.length, "athlete");

  const hasFilters = elements.searchInput.value
    || elements.competitionFilter.value
    || elements.divisionFilter.value
    || elements.riskFilter.value;
  elements.athleteCount.classList.toggle("filtered", hasFilters);

  document.querySelectorAll(".competition-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.textContent === elements.competitionFilter.value.replace("Love Fest ", "LF ").replace("All Out Games ", "AO "));
  });

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
    const riskText = athlete.risk
      ? `${riskEmoji(athlete.risk.level)} ${athlete.risk.flag} - ${Math.round(athlete.risk.score * 100)}`
      : "No risk data";
    button.innerHTML = `
      <span class="athlete-button-top">
        <strong>${escapeHtml(athlete.name)}</strong>
        <small class="risk-dot ${athlete.risk?.level?.toLocaleLowerCase() || "none"}">${escapeHtml(riskText)}</small>
      </span>
      <span>${escapeHtml(athlete.teams.slice(0, 2).join(", ") || "No team listed")}</span>
      <span>${escapeHtml(athlete.competitions.join(" / "))}</span>
    `;
    button.addEventListener("click", () => selectAthlete(athlete.name));
    elements.athleteList.append(button);
  });
}

function riskEmoji(level) {
  if (level === "HIGH") return "🚩";
  if (level === "MEDIUM") return "⚠️";
  if (level === "LOW") return "✅";
  return "•";
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

function selectAthlete(name, shouldScroll = true) {
  state.selectedAthlete = name;
  state.historyCompetition = "";
  elements.historyCompetitionFilter.value = "";
  setActiveView("profiles");
  renderAthleteList();
  renderProfile();
  if (shouldScroll) {
    elements.profileView.scrollIntoView({ block: "start", behavior: "smooth" });
  }
}

function athleteRows() {
  return state.rows.filter((row) => athleteKey(row.athlete) === athleteKey(state.selectedAthlete));
}

function renderProfile() {
  const rows = athleteRows();
  if (!rows.length) {
    setActiveView("leaderboards");
    return;
  }

  setActiveView("profiles");

  const competitions = unique(rows.map((row) => row.competition));
  const teams = athleteTeams(rows);
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
  renderRiskCalculation();
  renderDivisionTimeline(rows);
  populateSelect(elements.historyCompetitionFilter, competitions, "All history");
  elements.historyCompetitionFilter.value = state.historyCompetition;
  renderCompetitionCards(rows);
  renderHistory(rows);
}

function renderDivisionTimeline(rows) {
  const entries = [...groupBy(rows, (row) => row.competition).entries()]
    .map(([competition, groupRows]) => {
      const divisions = unique(groupRows.map((row) => row.division));
      const levels = divisions.map(divisionLevel).filter((value) => value !== null);
      const level = levels.length ? Math.max(...levels) : null;
      const overallRanks = groupRows.map((row) => numberValue(row.overall_rank)).filter((value) => value !== null);
      return {
        competition,
        divisions,
        level,
        bestOverall: overallRanks.length ? Math.min(...overallRanks) : null,
      };
    })
    .sort((a, b) => compareCompetitions(a.competition, b.competition));

  elements.divisionTimelineMeta.textContent = entries.length > 1
    ? `${entries.length} stops`
    : "";
  elements.divisionTimeline.replaceChildren();

  if (!entries.length) {
    elements.divisionTimeline.innerHTML = '<p class="muted">No division history is available.</p>';
    return;
  }

  entries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "timeline-item";
    item.innerHTML = `
      <span class="timeline-dot"></span>
      <div>
        <strong>${escapeHtml(entry.competition)}</strong>
        <small>${escapeHtml(entry.divisions.join(" / ") || "Division not listed")}</small>
      </div>
      <span>${entry.bestOverall === null ? "-" : `#${entry.bestOverall}`}</span>
    `;
    elements.divisionTimeline.append(item);
  });
}

function getBestRiskForKey(key) {
  const rows = state.analysis.get(key) || [];
  return rows
    .map((row) => {
      const flag = normalize(row.risk_flag);
      return {
        row,
        flag,
        level: flag.split(" ")[0] || "",
        score: numberValue(row.sandbagging_score) ?? 0,
        avgPercentile: numberValue(row.avg_percentile),
        rankStd: numberValue(row.rank_std),
      };
    })
    .sort((a, b) => b.score - a.score)[0] || null;
}

function getSelectedRisk() {
  return getBestRiskForKey(athleteKey(state.selectedAthlete));
}

function renderRiskBadge() {
  const best = getSelectedRisk();

  elements.riskBadge.className = "risk-badge";
  if (!best) {
    elements.riskBadge.textContent = "No risk data";
    return;
  }

  const score = Math.round(best.score * 100);
  elements.riskBadge.textContent = `${riskEmoji(best.level)} ${best.flag} - ${score}`;
  if (best.level === "HIGH") elements.riskBadge.classList.add("high");
  else if (best.level === "MEDIUM") elements.riskBadge.classList.add("medium");
  else elements.riskBadge.classList.add("low");
}

function renderRiskCalculation() {
  const best = getSelectedRisk();
  elements.riskCalculation.replaceChildren();

  if (!best) {
    elements.riskScoreMeta.textContent = "";
    elements.riskCalculation.innerHTML = `
      <p class="muted">No sandbagging analysis row is available for this athlete yet.</p>
    `;
    return;
  }

  const consistency = best.rankStd === null ? null : 1 / (best.rankStd + 1);
  const dominance = best.avgPercentile === null ? null : 1 - best.avgPercentile;
  const bestOverallRank = numberValue(best.row.best_overall_rank);
  const wonOverall = bestOverallRank === 1
    || (bestOverallRank === null && athleteRows().some((row) => numberValue(row.overall_rank) === 1));
  const score = Math.round(best.score * 100);
  elements.riskScoreMeta.textContent = `${best.flag} score ${score}`;

  elements.riskCalculation.innerHTML = `
    <p class="risk-formula">
      Score = 50% performance dominance + 30% rank consistency + 20% overall winner bonus.
      High risk starts at 70, medium risk starts at 50.
    </p>
    <div class="risk-metrics">
      <div>
        <span>Avg percentile</span>
        <strong>${percent(best.avgPercentile)}</strong>
        <small>Lower percentile means stronger finishes.</small>
      </div>
      <div>
        <span>Dominance input</span>
        <strong>${percent(dominance)}</strong>
        <small>Calculated as 1 - avg percentile.</small>
      </div>
      <div>
        <span>Rank consistency</span>
        <strong>${percent(consistency)}</strong>
        <small>Based on 1 / (rank standard deviation + 1).</small>
      </div>
      <div>
        <span>Overall winner bonus</span>
        <strong>${wonOverall ? "Yes" : "No"}</strong>
        <small>Winning the division overall adds the final 20% input.</small>
      </div>
      <div>
        <span>Risk source</span>
        <strong>${escapeHtml(best.row.division || "-")}</strong>
        <small>${escapeHtml(best.row.competition || "Competition not listed")}</small>
      </div>
    </div>
  `;
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

  return ranked.map((row) => {
    const rank = numberValue(row.workout_rank);
    const fieldSize = workoutFieldSize(row);
    const marker = rank === null || fieldSize <= 1
      ? 50
      : Math.max(0, Math.min(100, ((rank - 1) / (fieldSize - 1)) * 100));
    const fieldLabel = fieldSize ? `of ${fieldSize}` : "";

    return `
      <div class="rank-bar">
        <span>${escapeHtml(row.workout)}</span>
        <span class="placement-track" title="${escapeHtml(`Placed ${formatRank(row.workout_rank)} ${fieldLabel}`)}">
          <span class="placement-marker" style="left: ${marker}%"></span>
        </span>
        <strong>${formatRank(row.workout_rank)} <small>${escapeHtml(fieldLabel)}</small></strong>
      </div>
    `;
  }).join("");
}

function workoutSortIndex(workout) {
  const match = normalize(workout).match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function workoutFieldSize(row) {
  const matchingRows = state.rows.filter((candidate) => (
    candidate.competition === row.competition
    && candidate.division === row.division
    && candidate.workout === row.workout
  ));
  return unique(matchingRows.map((candidate) => candidate.team)).length;
}

function renderHistory(rows) {
  const competition = state.historyCompetition;
  const history = rows
    .filter((row) => !competition || row.competition === competition)
    .slice()
    .sort((a, b) => (
      compareCompetitions(a.competition, b.competition)
      || a.division.localeCompare(b.division)
      || workoutSortIndex(a.workout) - workoutSortIndex(b.workout)
      || a.workout.localeCompare(b.workout)
      || (numberValue(a.workout_rank) ?? 9999) - (numberValue(b.workout_rank) ?? 9999)
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
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.profilesTab.addEventListener("click", () => setActiveView("profiles"));
  elements.leaderboardsTab.addEventListener("click", () => setActiveView("leaderboards"));
  elements.searchInput.addEventListener("input", renderAthleteList);
  elements.competitionFilter.addEventListener("change", renderAthleteList);
  elements.divisionFilter.addEventListener("change", renderAthleteList);
  elements.riskFilter.addEventListener("change", renderAthleteList);
  elements.clearFilters.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.competitionFilter.value = "";
    elements.divisionFilter.value = "";
    elements.riskFilter.value = "";
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
  applyTheme(preferredTheme());
  bindEvents();
  try {
    const [rows, analysisRows] = await Promise.all([
      loadCsv(DATA_URL),
      loadCsv(ANALYSIS_URL).catch(() => []),
    ]);

    state.rows = rows.filter((row) => normalize(row.athlete));
    state.analysis = groupBy(analysisRows, (row) => athleteKey(row.athlete));
    buildAthletes();
    buildMovements();
    populateSelect(elements.competitionFilter, unique(state.rows.map((row) => row.competition)).sort(compareCompetitions), "All competitions");
    populateSelect(elements.divisionFilter, unique(state.rows.map((row) => row.division)).sort(), "All divisions");
    renderIncludedCompetitions();
    renderInsights();
    renderAthleteList();

    if (state.athletes.length) selectAthlete(state.athletes[0].name, false);
    setActiveView("profiles");
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
