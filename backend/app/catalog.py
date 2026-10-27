"""Versioned, repository-owned airport data. Requests cannot select a file or URL."""
import json
import os
from functools import lru_cache
from pathlib import Path
from fastapi import HTTPException

LEGACY_REVISION = 'vohy-legacy-v1'

@lru_cache
def airport_catalog():
    root = Path(os.getenv('AIRPORT_CATALOG_DIR') or Path(__file__).resolve().parents[2] / 'public/data/airports')
    manifest = json.loads((root / 'catalog.json').read_text())
    catalog = {}
    for item in manifest['airports']:
        filename = Path(item['path']).name
        if filename not in {'vohy.json','synthetic.json'} and (not filename.endswith('.json') or not all(c.isalnum() or c in '-.' for c in filename)):
            raise ValueError('Invalid catalog path')
        data = json.loads((root / filename).read_text())
        if data['airport']['icao'] != item['icao'] or data['revision'] != item['revision']:
            raise ValueError('Catalog revision mismatch')
        catalog[item['icao']] = data
    return catalog


def get_airport(icao, revision=None):
    package = airport_catalog().get(icao)
    if not package or revision is not None and package['revision'] != revision:
        raise HTTPException(422, 'Airport revision is not installed in this release')
    return package
