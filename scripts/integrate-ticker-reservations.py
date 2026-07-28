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


def main() -> None:
    script = replace_archive_block(extract_v2_script())
    compile(script, "ticker-reservation-integration", "exec")
    exec(script, {})


if __name__ == "__main__":
    main()
