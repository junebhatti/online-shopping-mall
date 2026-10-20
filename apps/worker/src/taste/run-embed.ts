import { db, listings, orm, pins } from "@mall/db";
import { loadPinterest } from "../config.ts";
import { log } from "../log.ts";
import { EMBEDDING_MODEL, embedImage } from "./embed.ts";

const CONCURRENCY = 4;

/** Embed clothing-board pins and every passed clothing listing that has no current-model embedding. */
export async function runEmbed(): Promise<void> {
  const boards = Object.entries(loadPinterest().boards)
    .filter(([, use]) => use === "clothing")
    .map(([slug]) => slug);

  const pinRows = await db()
    .select({ id: pins.id, url: pins.imageUrl })
    .from(pins)
    .where(
      orm.and(
        orm.inArray(pins.boardSlug, boards),
        orm.or(orm.isNull(pins.embeddingModel), orm.ne(pins.embeddingModel, EMBEDDING_MODEL)),
      ),
    );
  const pinFails = await embedAll(pinRows, async (id, embedding) => {
    await db().update(pins).set({ embedding, embeddingModel: EMBEDDING_MODEL }).where(orm.eq(pins.id, String(id)));
  });

  const listingRows = await db()
    .select({ id: listings.id, url: orm.sql<string>`${listings.images}[1]` })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.gate, "passed"),
        orm.eq(listings.status, "active"),
        orm.eq(listings.department, "clothing"),
        orm.sql`cardinality(${listings.images}) > 0`,
        orm.or(orm.isNull(listings.embeddingModel), orm.ne(listings.embeddingModel, EMBEDDING_MODEL)),
      ),
    );
  const listingFails = await embedAll(listingRows, async (id, embedding) => {
    await db()
      .update(listings)
      .set({ embedding, embeddingModel: EMBEDDING_MODEL })
      .where(orm.eq(listings.id, Number(id)));
  });

  log.info(
    `embed: ${pinRows.length - pinFails} pins, ${listingRows.length - listingFails} listings` +
      (pinFails + listingFails ? ` (${pinFails + listingFails} image failures, retried next cycle)` : ""),
  );
}

async function embedAll(
  rows: { id: string | number; url: string | null }[],
  save: (id: string | number, embedding: number[]) => Promise<void>,
): Promise<number> {
  let failures = 0;
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        if (!row.url) continue;
        try {
          await save(row.id, await embedImage(row.url));
        } catch (err) {
          failures++;
          log.warn(`embed failed for ${row.id} (${row.url})`, err instanceof Error ? err.message : err);
        }
      }
    }),
  );
  return failures;
}
