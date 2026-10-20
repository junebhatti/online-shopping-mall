import { db, orm, pins } from "@mall/db";
import { fetchBoardPins, sleep } from "@mall/sources";
import { loadPinterest } from "@mall/config";
import { withRun } from "../runs.ts";

/** Pull every configured board. New pins are inserted; embeddings are filled in by the taste step. */
export async function ingestPinterest(): Promise<void> {
  const cfg = loadPinterest();
  for (const boardSlug of Object.keys(cfg.boards)) {
    await withRun("pinterest", boardSlug, async (counts) => {
      const fetched = await fetchBoardPins(cfg.username, boardSlug);
      counts.fetched = fetched.length;
      for (const p of fetched) {
        const res = await db()
          .insert(pins)
          .values({ ...p, fetchedAt: new Date() })
          .onConflictDoUpdate({
            target: pins.id,
            set: { boardSlug: p.boardSlug, boardName: p.boardName, description: p.description, fetchedAt: new Date() },
          })
          .returning({ inserted: orm.sql<boolean>`xmax = 0` });
        if (res[0]?.inserted) counts.created++;
        else counts.updated++;
      }
      await sleep(500);
    });
  }
}
