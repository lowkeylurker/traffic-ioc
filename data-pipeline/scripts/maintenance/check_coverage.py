"""Check record counts for all dim and bridge tables."""
from pathlib import Path
import sys

from sqlalchemy import text
from rich.console import Console
from rich.table import Table

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from src.core.database import get_engine

console = Console()
engine = get_engine()

tables = [
    "dim_date",
    "dim_time",
    "dim_weather_condition", 
    "dim_holiday",
    "dim_location",
    "dim_node",
    "dim_road",
    "dim_way",
    "dim_segment",
    "dim_corridor",
    "bridge_corridor_segment",
]

table = Table(title="📊 Data Pipeline Coverage", show_header=True, header_style="bold cyan")
table.add_column("Table", style="cyan", width=30)
table.add_column("Record Count", justify="right", style="green", width=15)
table.add_column("Status", justify="center", width=10)

with engine.connect() as conn:
    for tbl in tables:
        try:
            result = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}"))
            count = result.scalar()
            status = "✅" if count > 0 else "⚠️"
            table.add_row(tbl, f"{count:,}", status)
        except Exception as e:
            conn.rollback()  # Rollback failed transaction
            error_msg = str(e).split('\n')[0][:50]
            table.add_row(tbl, f"N/A", "➖")
            console.print(f"[dim]  {tbl}: {error_msg}[/dim]")

console.print("\n")
console.print(table)
console.print("\n")
