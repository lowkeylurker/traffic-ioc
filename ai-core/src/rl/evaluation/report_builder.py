"""Simple markdown report builder for notebook 06 outputs."""

from __future__ import annotations

from datetime import datetime


def build_evaluation_report_markdown(
    run_name: str,
    ops_metrics: dict,
    pr_metrics: dict,
    extra_sections: dict | None = None,
) -> str:
    """Build a lightweight markdown report payload."""
    extra_sections = extra_sections or {}

    lines: list[str] = []
    lines.append(f"# Evaluation Report: {run_name}")
    lines.append("")
    lines.append(f"Generated at: {datetime.utcnow().isoformat()}Z")
    lines.append("")

    lines.append("## Operational Metrics")
    lines.append("")
    for key, value in ops_metrics.items():
        lines.append(f"- {key}: {value}")

    lines.append("")
    lines.append("## Rare-Class PR Metrics")
    lines.append("")
    classes_payload = pr_metrics.get("classes", {}) if isinstance(pr_metrics, dict) else {}
    if classes_payload:
        for class_name, payload in classes_payload.items():
            lines.append(f"- {class_name}: AP={payload.get('average_precision')}, prevalence={payload.get('prevalence')}")
    else:
        lines.append("- No PR metrics available")

    if extra_sections:
        lines.append("")
        lines.append("## Additional Sections")
        lines.append("")
        for title, content in extra_sections.items():
            lines.append(f"### {title}")
            lines.append(str(content))
            lines.append("")

    return "\n".join(lines).strip() + "\n"
