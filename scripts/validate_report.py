#!/usr/bin/env python3
"""Validation gate for data/report.json — run BEFORE every push.
Exits non-zero with a clear message if anything is wrong. No silent failures.
Usage: python3 scripts/validate_report.py [path-to-report.json]
"""
import json, sys, re

p = sys.argv[1] if len(sys.argv) > 1 else "data/report.json"
errs, warns = [], []

try:
    d = json.load(open(p))
except Exception as e:
    print(f"FATAL: report.json unreadable: {e}"); sys.exit(1)

# top level
for key in ["generated", "total_contacts_now", "funnel_snapshot", "funnel_states", "months"]:
    if key not in d: errs.append(f"missing top-level key: {key}")

months = d.get("months", [])
if not months: errs.append("months array is empty")
keys = [m.get("key", "") for m in months]
if keys != sorted(keys): errs.append(f"months not in chronological order: {keys}")
if len(set(keys)) != len(keys): errs.append(f"duplicate month keys: {keys}")

CHAN_FIELDS = ["followers", "follower_change", "impressions", "engagement",
               "likes", "comments", "shares", "profile_views", "saves", "messages"]

for m in months:
    mk = m.get("key", "?")
    if not re.match(r"^\d{4}-\d{2}$", mk): errs.append(f"bad month key: {mk}")
    for brand in ["wl", "ob"]:
        b = m.get(brand)
        if not b: errs.append(f"{mk}: missing {brand}"); continue
        tot = b.get("totals", {})
        ch = b.get("channels", {})
        if not ch: errs.append(f"{mk} {brand}: no channels")
        # totals must equal sum of channels for additive metrics
        for f in ["impressions", "engagement", "likes"]:
            s = sum((c.get(f) or 0) for c in ch.values())
            if abs(s - (tot.get(f) or 0)) > 0.5:
                errs.append(f"{mk} {brand}: totals.{f}={tot.get(f)} != channel sum {s}")
        # negatives are impossible
        for f in CHAN_FIELDS:
            if f == "follower_change": continue
            if (tot.get(f) or 0) < 0: errs.append(f"{mk} {brand}: negative totals.{f}")
        # engagement rate recompute
        if tot.get("impressions"):
            er = round(tot.get("engagement", 0) / tot["impressions"] * 100, 2)
            if abs(er - (tot.get("engagement_rate") or 0)) > 0.05:
                errs.append(f"{mk} {brand}: engagement_rate {tot.get('engagement_rate')} != recomputed {er}")
        # daily series aligned
        dl = b.get("daily", {})
        if len(dl.get("dates", [])) != len(dl.get("impressions", [])):
            errs.append(f"{mk} {brand}: daily dates/impressions length mismatch")
        # daily impressions should sum ~= monthly impressions
        ds = sum(dl.get("impressions", []))
        if tot.get("impressions") and abs(ds - tot["impressions"]) > tot["impressions"] * 0.02:
            errs.append(f"{mk} {brand}: daily impressions sum {ds} != monthly total {tot['impressions']}")
    ac = m.get("ac", {})
    for f in ["new_contacts", "deals_created"]:
        if ac.get(f) is None: warns.append(f"{mk}: ac.{f} is null")
    if not m.get("partial"):
        # full months must have every goal metric present for wl (saves/messages may be 0 but not None from Jun 2026 on)
        if mk >= "2026-06":
            for f in ["saves", "messages", "profile_views"]:
                if m["wl"]["totals"].get(f) in (None,):
                    errs.append(f"{mk}: wl totals.{f} missing (goal metric)")
            # IG saves sanity: WL IG should rarely be zero for a full month
            ig = m["wl"]["channels"].get("instagram", {})
            if (ig.get("saves") or 0) == 0:
                warns.append(f"{mk}: WL Instagram saves = 0 for a full month — re-pull with post-level data before trusting")

# funnel snapshot shape
for f in d.get("funnel_snapshot", []):
    if sum(f.get("by_state", {}).values()) != f.get("total"):
        errs.append(f"funnel snapshot row '{f.get('stage')}': by_state sum != total")

print(f"validate_report: {len(errs)} error(s), {len(warns)} warning(s)")
for e in errs: print("  ERROR:", e)
for w in warns: print("  warn :", w)
sys.exit(1 if errs else 0)
