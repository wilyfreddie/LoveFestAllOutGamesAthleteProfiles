from pathlib import Path

import numpy as np
import pandas as pd


INPUT_CSV = Path("competition_data.csv")
OUTPUT_CSV = Path("sandbagging_analysis.csv")
ATHLETE_OUTPUT_CSV = Path("sandbagging_analysis_by_athlete.csv")
OUTPUT_XLSX = Path("sandbagging_analysis.xlsx")


def load_data(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Input CSV not found: {path}")

    return pd.read_csv(path)


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    required_columns = {
        "team",
        "division",
        "affiliate",
        "overall_rank",
        "workout_rank",
    }
    missing_columns = required_columns - set(df.columns)
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise ValueError(f"Missing required columns: {missing}")

    cleaned = df.copy()

    if "athletes" not in cleaned.columns:
        cleaned["athletes"] = pd.NA

    cleaned["workout_rank"] = pd.to_numeric(
        cleaned["workout_rank"],
        errors="coerce",
    )
    cleaned["overall_rank"] = pd.to_numeric(
        cleaned["overall_rank"],
        errors="coerce",
    )

    return cleaned.dropna(subset=["workout_rank"])


def analyze_sandbagging(df: pd.DataFrame) -> pd.DataFrame:
    analyzed = df.copy()
    team_workout_columns = [
        column
        for column in ["competition", "division_id", "division", "team", "workout"]
        if column in analyzed.columns
    ]
    analyzed = analyzed.drop_duplicates(subset=team_workout_columns)

    field_size_columns = [
        column
        for column in ["competition", "division", "workout"]
        if column in analyzed.columns
    ]
    analyzed["field_size"] = analyzed.groupby(field_size_columns)["team"].transform(
        "nunique"
    )
    analyzed["rank_percentile"] = (
        analyzed["workout_rank"] / analyzed["field_size"]
    )

    group_columns = [
        column
        for column in [
            "competition",
            "team",
            "athletes",
            "division",
            "division_raw",
            "affiliate",
        ]
        if column in analyzed.columns
    ]
    result = (
        analyzed.groupby(group_columns, dropna=False)
        .agg(
            avg_rank=("workout_rank", "mean"),
            rank_std=("workout_rank", "std"),
            avg_percentile=("rank_percentile", "mean"),
            best_overall_rank=("overall_rank", "min"),
        )
        .reset_index()
    )

    result["rank_std"] = result["rank_std"].fillna(0)
    result["sandbagging_score"] = (
        (1 - result["avg_percentile"]) * 0.5
        + (1 / (result["rank_std"] + 1)) * 0.3
        + (result["best_overall_rank"].eq(1).astype(float)) * 0.2
    )

    result["risk_flag"] = np.select(
        [
            result["sandbagging_score"].ge(0.7),
            result["sandbagging_score"].ge(0.5),
        ],
        ["HIGH RISK", "MEDIUM RISK"],
        default="LOW RISK",
    )

    output_columns = [
        "competition",
        "team",
        "athletes",
        "division",
        "division_raw",
        "affiliate",
        "avg_rank",
        "rank_std",
        "avg_percentile",
        "best_overall_rank",
        "sandbagging_score",
        "risk_flag",
    ]

    existing_output_columns = [
        column for column in output_columns if column in result.columns
    ]

    return result[existing_output_columns].sort_values(
        by="sandbagging_score",
        ascending=False,
    )


def split_athletes(value: object) -> list[str]:
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


def create_athlete_lookup(analysis: pd.DataFrame) -> pd.DataFrame:
    lookup = analysis.copy()
    lookup["athlete"] = lookup["athletes"].apply(split_athletes)
    lookup = lookup.explode("athlete")
    lookup = lookup.dropna(subset=["athlete"])

    athlete_columns = [
        column
        for column in ["athlete", "division"]
        if column in lookup.columns
    ]
    aggregations = {
        "team": lambda values: ", ".join(sorted(set(map(str, values)))),
        "affiliate": lambda values: ", ".join(
            sorted({str(value) for value in values if pd.notna(value)})
        ),
        "avg_rank": "mean",
        "rank_std": "mean",
        "avg_percentile": "mean",
        "best_overall_rank": "min",
        "sandbagging_score": "max",
    }
    if "competition" in lookup.columns:
        aggregations["competition"] = lambda values: ", ".join(
            sorted(set(map(str, values)))
        )
    if "division_raw" in lookup.columns:
        aggregations["division_raw"] = lambda values: ", ".join(
            sorted(set(map(str, values)))
        )

    lookup = lookup.groupby(athlete_columns, dropna=False).agg(
        **{
            column: pd.NamedAgg(column=column, aggfunc=aggfunc)
            for column, aggfunc in aggregations.items()
            if column in lookup.columns
        }
    ).reset_index()

    lookup["risk_flag"] = np.select(
        [
            lookup["sandbagging_score"].ge(0.7),
            lookup["sandbagging_score"].ge(0.5),
        ],
        ["HIGH RISK", "MEDIUM RISK"],
        default="LOW RISK",
    )

    output_columns = [
        "athlete",
        "competition",
        "team",
        "division",
        "division_raw",
        "affiliate",
        "avg_rank",
        "rank_std",
        "avg_percentile",
        "best_overall_rank",
        "sandbagging_score",
        "risk_flag",
    ]

    existing_output_columns = [
        column for column in output_columns if column in lookup.columns
    ]

    return lookup[existing_output_columns].sort_values(
        by=["sandbagging_score", "athlete"],
        ascending=[False, True],
    )


def main() -> None:
    df = load_data(INPUT_CSV)
    cleaned = clean_data(df)
    analysis = analyze_sandbagging(cleaned)
    athlete_lookup = create_athlete_lookup(analysis)

    analysis.to_csv(OUTPUT_CSV, index=False)
    athlete_lookup.to_csv(ATHLETE_OUTPUT_CSV, index=False)
    with pd.ExcelWriter(OUTPUT_XLSX) as writer:
        analysis.to_excel(writer, sheet_name="team_analysis", index=False)
        athlete_lookup.to_excel(writer, sheet_name="athlete_lookup", index=False)

    print("Top 10 most suspicious teams:")
    print(analysis.head(10).to_string(index=False))
    print(f"\nSaved team analysis to {OUTPUT_CSV}")
    print(f"Saved athlete lookup to {ATHLETE_OUTPUT_CSV}")
    print(f"Saved workbook to {OUTPUT_XLSX}")


if __name__ == "__main__":
    main()
