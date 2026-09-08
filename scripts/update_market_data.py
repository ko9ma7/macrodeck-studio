#!/usr/bin/env python3
"""MacroDeck data collector for GitHub Pages.

Modes
-----
snapshot : lightweight market polling. Saves one compact point per cadence bucket.
daily    : refreshes recent daily history and all FRED series, then merges with the store.
backfill : fetches the maximum available daily history and repairs/extends the store.
all      : backfill + snapshot.

The browser never calls market APIs directly. GitHub Actions collects and commits static JSON.
Existing data is retained when a provider fails.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import math
import os
import pathlib
import time
import urllib.parse
import urllib.request
from typing import Any

UA = "Mozilla/5.0 (compatible; MacroDeckDataBot/3.0; +https://github.com/)"
SCHEMA_VERSION = 3
DEFAULT_SNAPSHOT_MINUTES = 30

YAHOO_SERIES: dict[str, dict[str, str]] = {
    "treasury-10y": {"symbol": "^TNX", "legacy": "_5eTNX", "name": "US 10Y Treasury"},
    "usdkrw": {"symbol": "KRW=X", "legacy": "KRW_3dX", "name": "USD/KRW"},
    "dxy": {"symbol": "DX-Y.NYB", "legacy": "DX-Y.NYB", "name": "US Dollar Index"},
    "ndx": {"symbol": "^NDX", "legacy": "_5eNDX", "name": "Nasdaq 100"},
    "spx": {"symbol": "^GSPC", "legacy": "_5eGSPC", "name": "S&P 500"},
    "kospi": {"symbol": "^KS11", "legacy": "_5eKS11", "name": "KOSPI"},
    "sox": {"symbol": "^SOX", "legacy": "_5eSOX", "name": "Philadelphia Semiconductor"},
    "gold": {"symbol": "GC=F", "legacy": "GC_3dF", "name": "Gold Futures"},
    "oil": {"symbol": "CL=F", "legacy": "CL_3dF", "name": "WTI Futures"},
    "orcl": {"symbol": "ORCL", "legacy": "ORCL", "name": "Oracle"},
    "vix": {"symbol": "^VIX", "legacy": "_5eVIX", "name": "VIX"},
}

FRED_SERIES: dict[str, dict[str, str]] = {
    "treasury-2y": {"series": "DGS2", "legacy": "UST2Y", "name": "US 2Y Treasury", "frequency": "daily"},
    "real-10y": {"series": "DFII10", "legacy": "REAL10Y", "name": "US 10Y Real Yield", "frequency": "daily"},
    "bei": {"series": "T10YIE", "legacy": "BEI", "name": "10Y Breakeven Inflation", "frequency": "daily"},
    "curve-10y2y": {"series": "T10Y2Y", "legacy": "T10Y2Y", "name": "10Y-2Y Spread", "frequency": "daily"},
    "hy-oas": {"series": "BAMLH0A0HYM2", "legacy": "HYOAS", "name": "High Yield OAS", "frequency": "daily"},
    "fed-target": {"series": "DFF", "legacy": "FEDTARGET", "name": "Effective Federal Funds Rate", "frequency": "daily"},
    "core-cpi-index": {"series": "CPILFESL", "legacy": "", "name": "Core CPI Index", "frequency": "monthly"},
    "unemployment": {"series": "UNRATE", "legacy": "UNEMP", "name": "US Unemployment Rate", "frequency": "monthly"},
    "wage-index": {"series": "CES0500000003", "legacy": "", "name": "Average Hourly Earnings Index", "frequency": "monthly"},
}

SECTOR_ETFS = {
    "XLK": "기술", "XLV": "헬스케어", "XLF": "금융", "XLE": "에너지", "XLY": "자유소비재",
    "XLP": "필수소비재", "XLI": "산업재", "XLB": "소재", "XLC": "커뮤니케이션", "XLRE": "부동산", "XLU": "유틸리티",
}

SNAPSHOT_IDS = ["treasury-10y", "usdkrw", "dxy", "ndx", "spx", "kospi", "sox", "gold", "oil", "orcl", "vix"]


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_now() -> str:
    return now_utc().isoformat(timespec="seconds").replace("+00:00", "Z")


def dump(path: pathlib.Path, payload: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    else:
        text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    path.write_text(text, encoding="utf-8")


def load_json(path: pathlib.Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def get(url: str, attempts: int = 3, timeout: int = 30) -> bytes:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/csv,*/*"})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except Exception as exc:  # network/provider errors are non-destructive
            last = exc
            if attempt + 1 < attempts:
                time.sleep(1.2 * (attempt + 1))
    assert last is not None
    raise last


def yahoo_chart(symbol: str, *, interval: str = "1d", range_value: str = "2y", include_prepost: bool = False) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    encoded = urllib.parse.quote(symbol, safe="")
    query = urllib.parse.urlencode({
        "range": range_value,
        "interval": interval,
        "events": "div,splits",
        "includeAdjustedClose": "true",
        "includePrePost": "true" if include_prepost else "false",
    })
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?{query}"
    payload = json.loads(get(url))
    chart = payload.get("chart", {})
    if chart.get("error"):
        raise RuntimeError(f"Yahoo {symbol}: {chart['error']}")
    result = (chart.get("result") or [None])[0]
    if not result:
        raise RuntimeError(f"Yahoo {symbol}: empty result")
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    quote = (indicators.get("quote") or [{}])[0]
    adjusted = (indicators.get("adjclose") or [{}])[0].get("adjclose") or []
    rows: list[dict[str, Any]] = []
    intraday = interval.endswith("m") or interval.endswith("h")
    for i, stamp in enumerate(timestamps):
        closes = quote.get("close") or []
        value = adjusted[i] if i < len(adjusted) and adjusted[i] is not None else (closes[i] if i < len(closes) else None)
        if value is None:
            continue
        when = dt.datetime.fromtimestamp(stamp, dt.timezone.utc)
        row: dict[str, Any] = {
            "date": when.isoformat(timespec="minutes").replace("+00:00", "Z") if intraday else when.date().isoformat(),
            "value": float(value),
        }
        for key in ("open", "high", "low", "close", "volume"):
            values = quote.get(key) or []
            if i < len(values) and values[i] is not None:
                row[key] = float(values[i]) if key != "volume" else int(values[i])
        rows.append(row)
    if not rows:
        raise RuntimeError(f"Yahoo {symbol}: no usable rows")
    return result.get("meta") or {}, rows


def fred_series(series_id: str) -> list[dict[str, Any]]:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={urllib.parse.quote(series_id)}"
    text = get(url).decode("utf-8-sig", errors="replace")
    rows: list[dict[str, Any]] = []
    for row in csv.DictReader(io.StringIO(text)):
        date = row.get("DATE") or row.get("observation_date") or next(iter(row.values()), "")
        raw = row.get(series_id)
        if raw in (None, "", "."):
            continue
        try:
            value = float(raw)
        except ValueError:
            continue
        rows.append({"date": date, "value": value})
    if not rows:
        raise RuntimeError(f"FRED {series_id}: no usable rows")
    return rows


def normalize_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_date: dict[str, dict[str, Any]] = {}
    for row in rows:
        date = str(row.get("date") or "")
        value = row.get("value")
        try:
            value = float(value)
        except (TypeError, ValueError):
            continue
        if not date or not math.isfinite(value):
            continue
        clean = dict(row)
        clean["date"] = date
        clean["value"] = value
        by_date[date] = clean
    return [by_date[key] for key in sorted(by_date)]


def merge_history(data_dir: pathlib.Path, series_id: str, rows: list[dict[str, Any]], *, source: str, source_symbol: str, name: str, frequency: str) -> list[dict[str, Any]]:
    path = data_dir / "history" / f"{series_id}.json"
    existing = load_json(path, {})
    merged = normalize_rows((existing.get("series") or []) + rows)
    metadata_changed = (
        existing.get("schemaVersion") != SCHEMA_VERSION
        or existing.get("id") != series_id
        or existing.get("name") != name
        or existing.get("source") != source
        or existing.get("sourceSymbol") != source_symbol
        or existing.get("frequency") != frequency
    )
    series_changed = normalize_rows(existing.get("series") or []) != merged
    if series_changed or metadata_changed or not path.exists():
        payload = {
            "schemaVersion": SCHEMA_VERSION,
            "id": series_id,
            "name": name,
            "source": source,
            "sourceSymbol": source_symbol,
            "frequency": frequency,
            "updatedAt": iso_now(),
            "series": merged,
        }
        dump(path, payload, compact=True)
    return merged


def read_history(data_dir: pathlib.Path, series_id: str) -> list[dict[str, Any]]:
    return normalize_rows(load_json(data_dir / "history" / f"{series_id}.json", {}).get("series") or [])


def derived_yoy(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = normalize_rows(rows)
    by_month = {row["date"][:7]: row for row in rows}
    out: list[dict[str, Any]] = []
    for row in rows:
        try:
            date = dt.date.fromisoformat(row["date"][:10])
        except ValueError:
            continue
        prev_year_month = f"{date.year - 1:04d}-{date.month:02d}"
        prev = by_month.get(prev_year_month)
        if not prev or not prev["value"]:
            continue
        out.append({"date": row["date"][:10], "value": (row["value"] / prev["value"] - 1) * 100.0})
    return out


def slice_calendar_days(rows: list[dict[str, Any]], days: int) -> list[dict[str, Any]]:
    cutoff = now_utc().date() - dt.timedelta(days=days)
    out = []
    for row in rows:
        try:
            date = dt.date.fromisoformat(str(row["date"])[:10])
        except ValueError:
            continue
        if date >= cutoff:
            out.append(row)
    return out


def write_legacy_chart(data_dir: pathlib.Path, legacy: str, label: str, days: int, rows: list[dict[str, Any]]) -> None:
    payload = {"symbol": label, "series": rows}
    dump(data_dir / "macro" / f"chart__days={days}&symbol={legacy}.json", payload, compact=True)


def refresh_legacy_views(data_dir: pathlib.Path) -> None:
    # Keep old filenames for compatibility while full canonical history lives in data/history/.
    mapping = {
        "core-cpi": ("CPICORE", "CPICORE", [730]),
        "unemployment": ("UNEMP", "UNEMP", [730]),
        "wages": ("WAGE", "WAGE", [730]),
        "treasury-2y": ("UST2Y", "UST2Y", [252, 20000]),
        "treasury-10y": ("_5eTNX", "^TNX", [7, 30, 90, 180, 365, 20000]),
        "real-10y": ("REAL10Y", "REAL10Y", [7, 30, 90, 180, 365, 20000]),
        "usdkrw": ("KRW_3dX", "KRW=X", [7, 30, 90, 180, 365, 20000]),
        "dxy": ("DX-Y.NYB", "DX-Y.NYB", [7, 30, 90, 180, 365, 20000]),
        "ndx": ("_5eNDX", "^NDX", [7, 30, 90, 180, 365, 20000]),
        "spx": ("_5eGSPC", "^GSPC", [7, 30, 90, 180, 365, 20000]),
        "kospi": ("_5eKS11", "^KS11", [7, 30, 90, 180, 365, 20000]),
        "sox": ("_5eSOX", "^SOX", [7, 30, 90, 180, 365, 20000]),
        "gold": ("GC_3dF", "GC=F", [7, 30, 90, 180, 365, 20000]),
        "oil": ("CL_3dF", "CL=F", [7, 30, 90, 180, 365, 20000]),
        "orcl": ("ORCL", "ORCL", [7, 30, 90, 180, 365, 20000]),
        "vix": ("_5eVIX", "^VIX", [7, 30, 90, 180, 365, 20000]),
        "credit": ("CREDIT_5fRATIO", "CREDIT_RATIO", [252, 20000]),
        "bei": ("BEI", "BEI", [90, 20000]),
        "curve-10y2y": ("T10Y2Y", "T10Y2Y", [20000]),
        "hy-oas": ("HYOAS", "HYOAS", [20000]),
        "fed-target": ("FEDTARGET", "FEDTARGET", [252, 20000]),
    }
    for series_id, (legacy, label, day_sets) in mapping.items():
        rows = read_history(data_dir, series_id)
        if not rows:
            continue
        for days in day_sets:
            view = rows if days >= 20000 else slice_calendar_days(rows, days if days not in (252,) else 370)
            write_legacy_chart(data_dir, legacy, label, days, view)
    kospi = read_history(data_dir, "kospi")
    if kospi:
        dump(data_dir / "macro" / "history__from=2003-01-01&symbol=_5eKS11.json", {
            "symbol": "^KS11", "name": "KOSPI", "series": [{"date": row["date"][:10], "close": row["value"]} for row in kospi]
        }, compact=True)


def returns(rows: list[dict[str, Any]]) -> dict[str, float]:
    rows = normalize_rows(rows)
    values = [row["value"] for row in rows]
    if len(values) < 2:
        return {key: 0.0 for key in ("d1", "w1", "m1", "m3", "m6", "ytd", "y1")}
    last = values[-1]
    def ret(sessions: int) -> float:
        base = values[max(0, len(values) - 1 - sessions)]
        return 0.0 if not base else last / base - 1
    year = rows[-1]["date"][:4]
    ytd_index = next((i for i, row in enumerate(rows) if row["date"].startswith(year)), 0)
    base = values[ytd_index]
    return {"d1": ret(1), "w1": ret(5), "m1": ret(21), "m3": ret(63), "m6": ret(126), "ytd": 0.0 if not base else last / base - 1, "y1": ret(252)}


def collect_history(data_dir: pathlib.Path, *, deep: bool, status: dict[str, Any]) -> None:
    yahoo_range = "max" if deep else "2y"

    def record(name: str, fn) -> None:
        try:
            fn()
            status["ok"] += 1
            status["sources"].append({"name": name, "ok": True})
        except Exception as exc:
            status["failed"] += 1
            status["sources"].append({"name": name, "ok": False, "error": str(exc)[:300]})
            print(f"WARN {name}: {exc}")

    for series_id, spec in YAHOO_SERIES.items():
        def update_yahoo(sid=series_id, cfg=spec):
            _, rows = yahoo_chart(cfg["symbol"], interval="1d", range_value=yahoo_range)
            merge_history(data_dir, sid, rows, source="Yahoo Finance chart", source_symbol=cfg["symbol"], name=cfg["name"], frequency="daily")
            time.sleep(0.15)
        record(f"Yahoo history {spec['symbol']}", update_yahoo)

    for series_id, spec in FRED_SERIES.items():
        def update_fred(sid=series_id, cfg=spec):
            rows = fred_series(cfg["series"])
            merge_history(data_dir, sid, rows, source="FRED", source_symbol=cfg["series"], name=cfg["name"], frequency=cfg["frequency"])
            time.sleep(0.08)
        record(f"FRED {spec['series']}", update_fred)

    core_index = read_history(data_dir, "core-cpi-index")
    if core_index:
        merge_history(data_dir, "core-cpi", derived_yoy(core_index), source="FRED derived", source_symbol="CPILFESL YoY", name="Core CPI YoY", frequency="monthly")
    wage_index = read_history(data_dir, "wage-index")
    if wage_index:
        merge_history(data_dir, "wages", derived_yoy(wage_index), source="FRED derived", source_symbol="CES0500000003 YoY", name="Average Hourly Earnings YoY", frequency="monthly")

    def credit_ratio() -> None:
        _, hyg = yahoo_chart("HYG", interval="1d", range_value=yahoo_range)
        _, lqd = yahoo_chart("LQD", interval="1d", range_value=yahoo_range)
        a = {row["date"]: row["value"] for row in hyg}
        b = {row["date"]: row["value"] for row in lqd}
        rows = [{"date": date, "value": a[date] / b[date]} for date in sorted(set(a) & set(b)) if b[date]]
        merge_history(data_dir, "credit", rows, source="Yahoo Finance derived", source_symbol="HYG/LQD", name="HYG/LQD Credit Ratio", frequency="daily")
    record("Yahoo derived HYG/LQD", credit_ratio)

    def sectors() -> None:
        _, benchmark = yahoo_chart("^GSPC", interval="1d", range_value="2y")
        items = []
        for symbol, name in SECTOR_ETFS.items():
            _, rows = yahoo_chart(symbol, interval="1d", range_value="2y")
            items.append({"symbol": symbol, "name": name, "returns": returns(rows)})
            time.sleep(0.08)
        dump(data_dir / "sectors" / "perf.json", {
            "benchmark": {"symbol": "^GSPC", "returns": returns(benchmark)},
            "sectors": items,
            "source": "Yahoo Finance chart · MacroDeck collector",
            "updatedAt": iso_now(),
        }, compact=True)
    record("Sector ETFs", sectors)

    refresh_legacy_views(data_dir)


def snapshot_bucket(timestamp: dt.datetime, minutes: int) -> str:
    minute = (timestamp.minute // minutes) * minutes
    bucket = timestamp.replace(minute=minute, second=0, microsecond=0)
    return bucket.isoformat(timespec="minutes").replace("+00:00", "Z")


def collect_snapshot(data_dir: pathlib.Path, *, cadence_minutes: int, status: dict[str, Any]) -> dict[str, Any]:
    values: dict[str, Any] = {}
    provider_asof: dict[str, str] = {}
    changes: dict[str, float] = {}

    for series_id in SNAPSHOT_IDS:
        spec = YAHOO_SERIES[series_id]
        try:
            meta, rows = yahoo_chart(spec["symbol"], interval="5m", range_value="1d", include_prepost=True)
            last = rows[-1]
            values[series_id] = last["value"]
            provider_asof[series_id] = last["date"]
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            if prev:
                changes[series_id] = last["value"] / float(prev) - 1
            status["ok"] += 1
            status["sources"].append({"name": f"Yahoo snapshot {spec['symbol']}", "ok": True})
            time.sleep(0.10)
        except Exception as exc:
            status["failed"] += 1
            status["sources"].append({"name": f"Yahoo snapshot {spec['symbol']}", "ok": False, "error": str(exc)[:300]})
            print(f"WARN snapshot {spec['symbol']}: {exc}")

    run_at = now_utc()
    record = {
        "at": iso_now(),
        "bucket": snapshot_bucket(run_at, cadence_minutes),
        "values": values,
        "changePct": changes,
        "providerAsOf": provider_asof,
    }
    month = run_at.strftime("%Y-%m")
    path = data_dir / "archive" / "intraday" / f"{month}.json"
    payload = load_json(path, {"schemaVersion": SCHEMA_VERSION, "month": month, "cadenceMinutes": cadence_minutes, "items": []})
    items = payload.get("items") or []
    if items and items[-1].get("bucket") == record["bucket"]:
        items[-1] = record
    else:
        items.append(record)
    payload.update({"schemaVersion": SCHEMA_VERSION, "month": month, "cadenceMinutes": cadence_minutes, "updatedAt": record["at"], "items": items})
    dump(path, payload, compact=True)

    index_path = data_dir / "archive" / "intraday" / "index.json"
    index = load_json(index_path, {"schemaVersion": SCHEMA_VERSION, "months": []})
    months = sorted(set((index.get("months") or []) + [month]))
    dump(index_path, {"schemaVersion": SCHEMA_VERSION, "cadenceMinutes": cadence_minutes, "updatedAt": record["at"], "months": months}, compact=True)
    return record


def latest_value(data_dir: pathlib.Path, series_id: str) -> tuple[float | None, str | None]:
    rows = read_history(data_dir, series_id)
    if not rows:
        return None, None
    return rows[-1]["value"], rows[-1]["date"]


def last_change(rows: list[dict[str, Any]]) -> float:
    if len(rows) < 2 or not rows[-2]["value"]:
        return 0.0
    return rows[-1]["value"] / rows[-2]["value"] - 1


def update_summaries(data_dir: pathlib.Path, snapshot: dict[str, Any] | None) -> None:
    summary_path = data_dir / "macro" / "summary.json"
    summary = load_json(summary_path, {})
    snapshot_values = (snapshot or {}).get("values") or {}
    snapshot_changes = (snapshot or {}).get("changePct") or {}

    def current(series_id: str) -> float | None:
        if series_id in snapshot_values:
            return snapshot_values[series_id]
        return latest_value(data_dir, series_id)[0]

    for key in ("ndx", "spx", "kospi", "sox", "orcl", "dxy", "gold", "oil"):
        value = current(key)
        if value is None:
            continue
        rows = read_history(data_dir, key)
        change = snapshot_changes.get(key)
        if change is None:
            change = last_change(rows)
        summary[key] = {"value": value, "changePct": change}

    treasury_10y = current("treasury-10y")
    real_10y, _ = latest_value(data_dir, "real-10y")
    usdkrw = current("usdkrw")
    if treasury_10y is not None:
        summary["treasury_10y"] = treasury_10y
    if real_10y is not None:
        summary["real_10y"] = real_10y
    if usdkrw is not None:
        rows = read_history(data_dir, "usdkrw")[-20:]
        change_pct = 0.0 if len(rows) < 2 or not rows[0]["value"] else rows[-1]["value"] / rows[0]["value"] - 1
        summary["usdkrw"] = usdkrw
        summary["usdkrw_trend"] = {
            "window_sessions": len(rows), "change_pct": change_pct,
            "start_date": rows[0]["date"] if rows else None, "end_date": rows[-1]["date"] if rows else None,
        }
    summary["fetched_at"] = (snapshot or {}).get("at") or iso_now()
    dump(summary_path, summary, compact=True)

    fed_path = data_dir / "fed-monitor.json"
    fed = load_json(fed_path, {})
    mapping = {
        "treasury_2y": "treasury-2y",
        "core_cpi_yoy": "core-cpi",
        "unemployment": "unemployment",
        "wage_yoy": "wages",
        "credit_ratio": "credit",
    }
    for field, series_id in mapping.items():
        value, asof = latest_value(data_dir, series_id)
        if value is None:
            continue
        fed[field] = value
        if field == "treasury_2y": fed["treasury_asof"] = asof
        elif field == "core_cpi_yoy": fed["core_cpi_asof"] = asof[:7] if asof else asof
        elif field == "unemployment": fed["unemp_asof"] = asof[:7] if asof else asof
        elif field == "wage_yoy": fed["wage_asof"] = asof[:7] if asof else asof
        elif field == "credit_ratio":
            rows = read_history(data_dir, "credit")
            fed["credit_ratio_chg"] = last_change(rows) * 100
            fed["credit_ratio_asof"] = asof
    fed["treasury_10y_nominal"] = treasury_10y if treasury_10y is not None else fed.get("treasury_10y_nominal")
    fed["fetched_at"] = summary["fetched_at"]
    dump(fed_path, fed, compact=True)


def build_history_catalog(data_dir: pathlib.Path) -> dict[str, Any]:
    items = []
    for path in sorted((data_dir / "history").glob("*.json")):
        payload = load_json(path, {})
        rows = normalize_rows(payload.get("series") or [])
        if not rows:
            continue
        items.append({
            "id": payload.get("id") or path.stem,
            "name": payload.get("name") or path.stem,
            "source": payload.get("source"),
            "sourceSymbol": payload.get("sourceSymbol"),
            "frequency": payload.get("frequency"),
            "points": len(rows),
            "from": rows[0]["date"],
            "to": rows[-1]["date"],
            "bytes": path.stat().st_size,
        })
    path = data_dir / "history" / "catalog.json"
    previous = load_json(path, {})
    total = sum(item["points"] for item in items)
    changed = previous.get("items") != items or int(previous.get("totalPoints", -1)) != total or previous.get("schemaVersion") != SCHEMA_VERSION
    catalog = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": iso_now() if changed else previous.get("generatedAt", iso_now()),
        "items": items,
        "totalPoints": total,
    }
    if changed or not path.exists():
        dump(path, catalog, compact=True)
    return catalog


def write_collection_meta(data_dir: pathlib.Path, mode: str, cadence_minutes: int, status: dict[str, Any], catalog: dict[str, Any]) -> None:
    previous = load_json(data_dir / "collection-meta.json", {})
    history_runs = previous.get("lastRuns") or {}
    history_runs[mode] = status["generated_at"]
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "lastMode": mode,
        "lastRuns": history_runs,
        "snapshotCadenceMinutes": cadence_minutes,
        "dailyHistorySchedule": "07:17 Asia/Seoul",
        "deepBackfillSchedule": "Sunday 04:29 Asia/Seoul",
        "historySeries": len(catalog.get("items") or []),
        "historyPoints": catalog.get("totalPoints", 0),
        "providerModel": "GitHub Actions polling → static JSON; browser performs no live API calls",
        "updatedAt": status["generated_at"],
    }
    dump(data_dir / "collection-meta.json", payload, compact=True)


def rebuild_meta(data_dir: pathlib.Path, status: dict[str, Any]) -> None:
    files = [path for path in data_dir.rglob("*") if path.is_file() and path.name not in ("status.json", "manifest.json", "meta.json")]
    dump(data_dir / "meta.json", {"generated_at": status["generated_at"], "files": len(files) + 3}, compact=True)
    manifest = []
    for path in sorted(data_dir.rglob("*.json")):
        if path.name == "manifest.json":
            continue
        manifest.append({"path": str(path.relative_to(data_dir.parent)).replace(os.sep, "/"), "bytes": path.stat().st_size})
    dump(data_dir / "manifest.json", {"generated_at": status["generated_at"], "files": manifest}, compact=True)
    dump(data_dir / "status.json", status, compact=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", default="public/data")
    parser.add_argument("--mode", choices=("snapshot", "daily", "backfill", "all"), default="snapshot")
    parser.add_argument("--snapshot-minutes", type=int, default=DEFAULT_SNAPSHOT_MINUTES)
    args = parser.parse_args()
    if args.snapshot_minutes < 5 or 60 % args.snapshot_minutes != 0:
        raise SystemExit("--snapshot-minutes must be a divisor of 60 and at least 5")

    data_dir = pathlib.Path(args.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    status: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "generated_at": iso_now(),
        "mode": args.mode,
        "ok": 0,
        "failed": 0,
        "sources": [],
    }

    snapshot: dict[str, Any] | None = None
    if args.mode in ("daily", "backfill", "all"):
        collect_history(data_dir, deep=args.mode in ("backfill", "all"), status=status)
    if args.mode in ("snapshot", "all"):
        snapshot = collect_snapshot(data_dir, cadence_minutes=args.snapshot_minutes, status=status)

    update_summaries(data_dir, snapshot)
    catalog = build_history_catalog(data_dir)
    write_collection_meta(data_dir, args.mode, args.snapshot_minutes, status, catalog)
    rebuild_meta(data_dir, status)
    print(f"MacroDeck {args.mode}: {status['ok']} ok / {status['failed']} failed / {catalog['totalPoints']} history points")


if __name__ == "__main__":
    main()
