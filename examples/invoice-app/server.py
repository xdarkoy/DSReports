"""Invoice example: a SQLite-backed data + PDF API.

Connects to a real database (SQLite, file `invoices.db`, auto-seeded on first
run), serves report data, and renders the PDF by binding that data to
`template.json` via the reporting_backend renderer.

Run with the backend venv (it has fastapi/uvicorn and reporting_backend
installed):

    backend\\.venv\\Scripts\\python.exe examples\\invoice-app\\server.py
    -> http://127.0.0.1:8790
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from reporting_backend.renderer import render_report_to_pdf

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "invoices.db"
TEMPLATE = json.loads((HERE / "template.json").read_text(encoding="utf-8"))

WEB_ORIGINS = ["http://localhost:5174", "http://127.0.0.1:5174"]


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def seed() -> None:
    """Create the schema and some sample rows on first run."""
    con = _connect()
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY, name TEXT, email TEXT, city TEXT);
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY, number TEXT, date TEXT, customer_id INTEGER);
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY, invoice_id INTEGER, description TEXT, qty REAL, price REAL);
        """
    )
    if con.execute("SELECT COUNT(*) FROM invoices").fetchone()[0] == 0:
        con.executemany("INSERT INTO customers (id,name,email,city) VALUES (?,?,?,?)", [
            (1, "Acme GmbH", "billing@acme.de", "1010 Wien"),
            (2, "Globex AG", "ap@globex.ch", "8001 Zürich"),
        ])
        con.executemany("INSERT INTO invoices (id,number,date,customer_id) VALUES (?,?,?,?)", [
            (1, "INV-2024-001", "2024-10-14", 1),
            (2, "INV-2024-002", "2024-11-03", 2),
        ])
        con.executemany("INSERT INTO items (invoice_id,description,qty,price) VALUES (?,?,?,?)", [
            (1, "Beratung (Stunden)", 12, 120.0),
            (1, "Support-Pauschale", 1, 490.0),
            (1, "Lizenz Pro", 3, 199.0),
            (2, "Workshop", 2, 800.0),
            (2, "Reisekosten", 1, 240.5),
        ])
        con.commit()
    con.close()


def invoice_data(invoice_id: int) -> dict:
    con = _connect()
    inv = con.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
    if inv is None:
        con.close()
        raise HTTPException(status_code=404, detail="invoice not found")
    cust = con.execute("SELECT * FROM customers WHERE id=?", (inv["customer_id"],)).fetchone()
    items = con.execute("SELECT * FROM items WHERE invoice_id=? ORDER BY id", (invoice_id,)).fetchall()
    con.close()
    rows = [{"description": r["description"], "qty": r["qty"], "price": r["price"]} for r in items]
    return {
        "invoice": {
            "number": inv["number"],
            "date": inv["date"],
            "customer": {"name": cust["name"], "email": cust["email"], "city": cust["city"]},
            "items": rows,
            "total": sum(r["qty"] * r["price"] for r in rows),
        }
    }


app = FastAPI(title="Invoice example API")
app.add_middleware(CORSMiddleware, allow_origins=WEB_ORIGINS, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup() -> None:
    seed()


@app.get("/template")
def get_template() -> dict:
    return TEMPLATE


@app.get("/invoices")
def list_invoices() -> list[dict]:
    con = _connect()
    rows = con.execute(
        "SELECT i.id, i.number, c.name AS customer FROM invoices i JOIN customers c ON c.id=i.customer_id ORDER BY i.id"
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


@app.get("/invoices/{invoice_id}/data")
def get_invoice_data(invoice_id: int) -> dict:
    return invoice_data(invoice_id)


@app.post("/invoices/{invoice_id}/render")
def render_invoice(invoice_id: int) -> Response:
    pdf = render_report_to_pdf(TEMPLATE, invoice_data(invoice_id))
    return Response(content=pdf, media_type="application/pdf")


def main() -> None:
    uvicorn.run(app, host="127.0.0.1", port=8790)


if __name__ == "__main__":
    main()
