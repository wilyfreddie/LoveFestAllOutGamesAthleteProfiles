import requests
import pandas as pd
import time
import re

BASE = "https://competitioncorner.net/api2/v1/leaderboard"
LOVE_FEST_COMPETITIONS = [
    {
        "name": "Love Fest 2025",
        "event_id": 15805,
    },
    {
        "name": "Love Fest 2026",
        "event_id": 20467,
    },
]
STRONGEST_BASE = "https://compete-strongest-com.global.ssl.fastly.net/api/p"
STRONGEST_COMPETITIONS = [
    {
        "name": "All Out Games 2024",
        "code": "all-out-games-2024-RNFYDB",
    },
    {
        "name": "All Out Games 2025",
        "code": "all-out-games-2025",
    },
]
OUTPUT_CSV = "competition_data.csv"
OUTPUT_XLSX = "competition_data.xlsx"

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}


def clean_score(value):
    if isinstance(value, str):
        return re.sub(r"<[^>]+>", "", value).strip()
    return value


def normalize_division_name(value):
    if pd.isna(value):
        return value

    normalized = str(value).upper()
    replacements = {
        "ALL OUT": "RX",
        "SWEAT OUT": "SCALED",
        "CHILL OUT": "BOOTCAMP",
    }

    for old, new in replacements.items():
        normalized = normalized.replace(old, new)

    normalized = normalized.replace("[", "").replace("]", "")
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def split_athletes(value):
    if pd.isna(value):
        return []

    athletes = []
    seen = set()
    for athlete in str(value).split(","):
        athlete = athlete.strip()
        normalized = athlete.casefold()
        if athlete and normalized not in seen:
            athletes.append(athlete)
            seen.add(normalized)

    return athletes


def expand_athlete_rows(df):
    if "athletes" not in df.columns:
        df["athletes"] = pd.NA

    expanded = df.copy()
    expanded["athlete"] = expanded["athletes"].apply(split_athletes)
    expanded = expanded.explode("athlete")

    missing_athlete = expanded["athlete"].isna()
    expanded.loc[missing_athlete, "athlete"] = expanded.loc[missing_athlete, "team"]

    ordered_columns = [
        "athlete",
        "team",
        "athletes",
        "competition",
        "source",
        "division",
        "division_raw",
        "division_id",
        "affiliate",
        "overall_rank",
        "points",
        "workout",
        "workout_rank",
        "workout_score",
        "workout_points",
    ]

    existing_columns = [
        column for column in ordered_columns if column in expanded.columns
    ]
    remaining_columns = [
        column for column in expanded.columns if column not in existing_columns
    ]

    return expanded[existing_columns + remaining_columns]


# 🔹 Get divisions
def get_divisions(event_id):
    url = f"{BASE}/{event_id}/"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()

    divisions = []
    for key, val in data.items():
        division_name = val.get("captionLong") or val.get("caption") or val.get("name")
        divisions.append({
            "id": key,
            "name": normalize_division_name(division_name),
            "raw_name": division_name,
        })

    return divisions


# 🔹 Get athletes per division
def get_athletes(event_id, division_id):
    url = f"{BASE}/{event_id}/tab/{division_id}?start=0&end=1000&athletesOnly=false"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    data = r.json()

    athletes = data.get("athletes", [])
    workouts = data.get("workouts", [])

    print(f"{division_id}: Found {len(athletes)} athletes")

    return athletes, workouts


# 🔹 Get participant details (fallback if needed)
def get_participant_data(division_id, roster_id):
    url = f"{BASE}/{division_id}/participantdata?preview=false&rosterId={roster_id}"
    r = requests.get(url, headers=HEADERS, timeout=30)

    if r.status_code != 200:
        return None

    return r.json()


# 🔹 Extract everything safely
def extract_data(competition_name, division_id, division_name, division_raw_name, athletes, workouts):
    records = []
    participant_cache = {}
    workout_names = {
        w.get("key"): w.get("name")
        for w in workouts
        if isinstance(w, dict) and w.get("key")
    }

    for a in athletes:
        team = a.get("teamName") or a.get("name")
        affiliate = a.get("affiliateName") or a.get("affiliate")
        overall_rank = a.get("rank") or a.get("place")
        points = a.get("points") or a.get("totalPoints")
        roster_id = a.get("rosterId") or a.get("rosterID")
        athlete_names = None

        if roster_id:
            if roster_id not in participant_cache:
                participant_cache[roster_id] = get_participant_data(
                    division_id,
                    roster_id
                )

            p_json = participant_cache[roster_id]
            teammates = (p_json or {}).get("teammates", [])
            names = [
                t.get("fullName")
                for t in teammates
                if isinstance(t, dict) and t.get("fullName")
            ]
            athlete_names = (
                unique_join(names)
                or (p_json or {}).get("data", {}).get("fullName")
                or None
            )

        # 🔍 Try multiple possible score locations
        scores = (
            a.get("scores")
            or a.get("workoutScores")
            or a.get("results")
            or []
        )

        # ✅ Case 1: scores exist → normal extraction
        if scores:
            if isinstance(scores, dict):
                score_items = scores.items()
            else:
                score_items = enumerate(scores)

            for i, s in score_items:
                if isinstance(i, str):
                    workout_name = workout_names.get(i, i)
                else:
                    workout_name = (
                        workouts[i].get("name")
                        if i < len(workouts) and isinstance(workouts[i], dict)
                        else f"W{i+1}"
                    )

                if isinstance(s, dict):
                    workout_rank = (
                        s.get("rank")
                        or s.get("position")
                        or s.get("rankInnerValue")
                    )
                    workout_score = (
                        s.get("scoreDisplay")
                        or s.get("score")
                        or s.get("res")
                        or s.get("result")
                    )
                    workout_points = s.get("points")
                else:
                    workout_rank = None
                    workout_score = s
                    workout_points = None

                records.append({
                    "team": team,
                    "athletes": athlete_names,
                    "competition": competition_name,
                    "source": "competition_corner",
                    "division": division_name,
                    "division_raw": division_raw_name,
                    "division_id": division_id,
                    "affiliate": affiliate,
                    "overall_rank": overall_rank,
                    "points": points,
                    "workout": workout_name,
                    "workout_rank": workout_rank,
                    "workout_score": clean_score(workout_score),
                    "workout_points": workout_points,
                })

        # ⚠️ Case 2: no scores → fallback to participant API
        else:
            if roster_id:
                p_json = participant_cache.get(roster_id)

                if p_json and p_json.get("historicRanks"):
                    for w in p_json["historicRanks"].values():
                        records.append({
                            "team": team,
                            "athletes": athlete_names,
                            "competition": competition_name,
                            "source": "competition_corner",
                            "division": division_name,
                            "division_raw": division_raw_name,
                            "division_id": division_id,
                            "affiliate": affiliate,
                            "overall_rank": w.get("overallRankNumeric"),
                            "points": w.get("overallPointsNumeric"),
                            "workout": w.get("workoutName"),
                            "workout_rank": w.get("rankNumeric"),
                            "workout_score": None,
                            "workout_points": w.get("pointsNumeric"),
                        })

            # still ensure at least 1 row
            else:
                records.append({
                    "team": team,
                    "athletes": athlete_names,
                    "competition": competition_name,
                    "source": "competition_corner",
                    "division": division_name,
                    "division_raw": division_raw_name,
                    "division_id": division_id,
                    "affiliate": affiliate,
                    "overall_rank": overall_rank,
                    "points": points,
                    "workout": None,
                    "workout_rank": None,
                    "workout_score": None,
                    "workout_points": None,
                })

    return records


def get_strongest_divisions(competition_code):
    url = f"{STRONGEST_BASE}/competitions/{competition_code}/divisions/"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()

    divisions = []
    for item in r.json().get("data", []):
        title = item.get("title")
        divisions.append({
            "id": item.get("id"),
            "name": normalize_division_name(title),
            "raw_name": title,
        })

    return [division for division in divisions if division["id"]]


def get_strongest_leaderboard(division_id):
    url = f"{STRONGEST_BASE}/divisions/{division_id}/leaderboard"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json().get("data", {})


def unique_join(values):
    cleaned = []
    seen = set()
    for value in values:
        if not value:
            continue
        normalized = str(value).strip()
        key = normalized.casefold()
        if normalized and key not in seen:
            cleaned.append(normalized)
            seen.add(key)

    return ", ".join(cleaned) or None


def extract_strongest_data(competition_name, division, leaderboard):
    records = []

    for row in leaderboard.get("body_rows", []):
        if not row or not isinstance(row[0], dict):
            continue

        competitor = row[0]
        profiles = competitor.get("teamProfiles") or []
        team_names = competitor.get("team") or []
        if isinstance(team_names, str):
            team_names = [team_names]

        profile_names = [
            profile.get("displayName") or profile.get("name")
            for profile in profiles
            if isinstance(profile, dict)
        ]
        affiliates = [
            profile.get("affiliate")
            for profile in profiles
            if isinstance(profile, dict)
        ]

        team = (
            competitor.get("registrationName")
            or competitor.get("competitor_name")
            or unique_join(team_names)
        )
        athletes = unique_join(profile_names) or unique_join(team_names) or team
        affiliate = unique_join(affiliates)

        events = [event for event in row[1:] if isinstance(event, dict)]
        if not events:
            records.append({
                "team": team,
                "athletes": athletes,
                "competition": competition_name,
                "source": "strongest",
                "division": division["name"],
                "division_raw": division["raw_name"],
                "division_id": division["id"],
                "affiliate": affiliate,
                "overall_rank": competitor.get("overall"),
                "points": competitor.get("cum_workout_rank"),
                "workout": None,
                "workout_rank": None,
                "workout_score": None,
                "workout_points": None,
            })
            continue

        for event in events:
            records.append({
                "team": team,
                "athletes": athletes,
                "competition": competition_name,
                "source": "strongest",
                "division": division["name"],
                "division_raw": division["raw_name"],
                "division_id": division["id"],
                "affiliate": affiliate,
                "overall_rank": competitor.get("overall"),
                "points": competitor.get("cum_workout_rank"),
                "workout": event.get("workout_name"),
                "workout_rank": event.get("workout_rank"),
                "workout_score": clean_score(event.get("workout_score_label")),
                "workout_points": event.get("workout_score_points"),
            })

    return records


def collect_love_fest_data(competition):
    all_data = []

    divisions = get_divisions(competition["event_id"])
    print(f"{competition['name']}: Found {len(divisions)} divisions")

    for d in divisions:
        print(f"\nProcessing division: {d['name']}")

        athletes, workouts = get_athletes(competition["event_id"], d["id"])
        records = extract_data(
            competition["name"],
            d["id"],
            d["name"],
            d["raw_name"],
            athletes,
            workouts,
        )
        all_data.extend(records)
        # time.sleep(0.5)

    return all_data


def collect_strongest_data(competition):
    all_data = []
    divisions = get_strongest_divisions(competition["code"])
    print(f"{competition['name']}: Found {len(divisions)} divisions")

    for division in divisions:
        print(f"\nProcessing division: {division['name']}")
        leaderboard = get_strongest_leaderboard(division["id"])
        records = extract_strongest_data(
            competition["name"],
            division,
            leaderboard,
        )
        print(f"{division['id']}: Found {leaderboard.get('results', 0)} athletes")
        all_data.extend(records)
        time.sleep(0.2)

    return all_data


# 🔹 MAIN
def main():
    all_data = []
    for competition in LOVE_FEST_COMPETITIONS:
        all_data.extend(collect_love_fest_data(competition))

    for competition in STRONGEST_COMPETITIONS:
        all_data.extend(collect_strongest_data(competition))

    df = expand_athlete_rows(pd.DataFrame(all_data))

    # 🔥 Save file
    df.to_csv(OUTPUT_CSV, index=False)
    df.to_excel(OUTPUT_XLSX, index=False)

    print(f"\nDone. Saved to {OUTPUT_CSV} and {OUTPUT_XLSX}")
    print("Shape:", df.shape)
    print(df.head())


if __name__ == "__main__":
    main()
