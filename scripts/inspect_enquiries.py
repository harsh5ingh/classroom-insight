"""Local operator verification. Outputs reference metadata, never contact details."""
import argparse
import json
import sqlite3
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--reference',help='Only inspect this server-generated reference.')
args=parser.parse_args()
path=Path(__file__).resolve().parents[1]/'data'/'classroom.sqlite3'
if not path.exists():
    raise SystemExit('No database yet. Start the backend first.')
with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True) as connection:
    connection.row_factory=sqlite3.Row
    query='SELECT reference,created_at,status,consent FROM institutional_enquiries'
    if args.reference:
        records=connection.execute(query+' WHERE reference=?',(args.reference,)).fetchall()
    else:
        records=connection.execute(query+' ORDER BY id DESC LIMIT 10').fetchall()
    print(json.dumps([dict(row) for row in records],indent=2))
