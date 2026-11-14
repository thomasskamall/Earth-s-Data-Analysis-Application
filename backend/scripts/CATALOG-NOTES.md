# NASA parameter catalog notes (2026-11-14)

- NASA POWER Parameter Dictionary page: https://power.larc.nasa.gov/parameters/ shows "368 matching parameters".
- Its data endpoint: https://power.larc.nasa.gov/api/website/metadata/parameters?advanced=false (368 items; fields id, name, keywords, tags, availability, range, sources). `advanced=true` returns 1784.
- AG monthly manager (https://power.larc.nasa.gov/api/system/manager/parameters?community=AG&temporal=monthly) has 1388 codes; daily 152; hourly 105; climatology 1634. HY community returns 422.
- Of the 368: 52 "Hour-Based Parameter Set" (*_HR) fail on NASA monthly (HTTP 500) and climatology returns empty; WSC needs wind-elevation/wind-surface; 69 are hourly- or climatology-only; 21 return only fill values (e.g. PRMC, RZMC, SFMC, LWLAND, SWLAND, IMERG_PRECTOT, CLOUD_BT*, CLOUD_TT*), tested at Cairo, Oslo and Manaus.
- Final app catalog: 225 parameters (218 monthly + 7 built from daily: SZA, ORIGINAL_*), each verified through /api/analysis with trend available. Built by backend/scripts/build_catalog.py --verify into backend/app/catalog.json.
