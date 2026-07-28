from pathlib import Path
from textwrap import dedent


def extract_v2_script() -> str:
    workflow = Path(".github/workflows/ticker-reservation-integration-v2.yml").read_text(
        encoding="utf-8"
    )
    start_marker = """      - name: Patch canonical reservation lifecycle
        shell: python
        run: |
"""
    end_marker = """
      - name: Verify integration source
"""
    start = workflow.index(start_marker) + len(start_marker)
    end = workflow.index(end_marker, start)
    return dedent(workflow[start:end])


def replace_archive_block(script: str) -> str:
    start_marker = (
        "archive_marker = 'Draft archived by creator; ticker returned to the chain "
        "availability pool.'"
    )
    end_marker = "\ndrafts_path.write_text(drafts, encoding='utf-8')"
    start = script.index(start_marker)
    end = script.index(end_marker, start)

    replacement_lines = [
        "archive_marker = 'Draft archived by creator; ticker returned to the chain availability pool.'",
        "if archive_marker not in drafts:",
        "    archive_start = drafts.index(",
        "        '  await pool.query(\"update campaign_drafts set status = \\\'archived\\\', archived_at = now(), updated_at = now() where id::text = $1\", [id]);'",
        "    )",
        "    archive_end_marker = (",
        "        '  const updated = await getDraftBundleById(id, \"\", { bypassVisibility: true });'",
        "    )",
        "    archive_end = drafts.index(archive_end_marker, archive_start) + len(",
        "        archive_end_marker",
        "    )",
        "    archive_replacement = dedent('''\\",
        "    try {",
        "      await withTickerReservationTransaction(pool, async (db) => {",
        "        await db.query(\"update campaign_drafts set status = 'archived', archived_at = now(), updated_at = now() where id::text = $1\", [id]);",
        "        await releaseTickerReservation(db, {",
        "          draftId: id,",
        "          creatorWallet: row.creator_wallet,",
        "          reason: \"Draft archived by creator; ticker returned to the chain availability pool.\",",
        "        });",
        "      });",
        "    } catch (error) {",
        "      if (error instanceof TickerReservationError || isTickerReservationConflict(error)) {",
        "        return json(res, error.httpStatus || 409, { error: error.message, code: error.code });",
        "      }",
        "      throw error;",
        "    }",
        "    const updated = await getDraftBundleById(id, \"\", { bypassVisibility: true });''')",
        "    archive_replacement = '\\n'.join(",
        "        '  ' + line if line else ''",
        "        for line in archive_replacement.splitlines()",
        "    )",
        "    drafts = drafts[:archive_start] + archive_replacement + drafts[archive_end:]",
        "",
    ]
    replacement = "\n".join(replacement_lines)
    return script[:start] + replacement + script[end:]


def replace_auth_end_marker(script: str) -> str:
    auth_start = script.index("auth_start = deploy.index(")
    marker_start = script.index("auth_end_marker = dedent('''\\", auth_start)
    marker_end_line = (
        "auth_end = deploy.index(auth_end_marker, auth_start) + len(auth_end_marker)"
    )
    marker_end = script.index(marker_end_line, marker_start) + len(marker_end_line)
    replacement = "\n".join(
        [
            "    auth_end_marker = '\\\\n'.join([",
            "        '  return json(res, 200, {',",
            "        '    scheduledRequest,',",
            "        '    authorization: { tradeRouteProfileId, finalizeRouteProfileId, validUntil, signature },',",
            "        '    preflight,',",
            "        '  });',",
            "    ])",
            f"    {marker_end_line}",
        ]
    )
    return script[:marker_start] + replacement + script[marker_end:]


def print_context(script: str, center: int = 263, radius: int = 16) -> None:
    lines = script.splitlines()
    start = max(1, center - radius)
    end = min(len(lines), center + radius)
    for number in range(start, end + 1):
        print(f"INTEGRATION_SCRIPT[{number:04d}] {lines[number - 1]}")


def main() -> None:
    script = extract_v2_script()
    script = replace_archive_block(script)
    script = replace_auth_end_marker(script)
    compile(script, "ticker-reservation-integration", "exec")
    try:
        exec(script, {})
    except Exception:
        print_context(script)
        raise


if __name__ == "__main__":
    main()
