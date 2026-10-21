import { db, listings, orm, pins } from "@mall/db";
import { loadPinterest } from "@mall/config";
import { assertMostlyWorked, markMediaFailed, mediaNotRecentlyFailed } from "../images/media-failures.ts";
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
  const pinFails = await embedAll(pinRows.map((p) => ({ id: p.id, urls: [p.url] })), async (id, embedding) => {
    await db().update(pins).set({ embedding, embeddingModel: EMBEDDING_MODEL }).where(orm.eq(pins.id, String(id)));
  });

  const listingRows = await db()
    .select({ id: listings.id, images: listings.images })
    .from(listings)
    .where(
      orm.and(
        orm.eq(listings.gate, "passed"),
        orm.eq(listings.status, "active"),
        orm.eq(listings.department, "clothing"),
        orm.sql`cardinality(${listings.images}) > 0`,
        orm.or(orm.isNull(listings.embeddingModel), orm.ne(listings.embeddingModel, EMBEDDING_MODEL)),
        mediaNotRecentlyFailed,
      ),
    );
  const listingFails = await embedAll(
    listingRows.map((r) => ({ id: r.id, urls: r.images.slice(0, 3) })),
    async (id, embedding) => {
      await db()
        .update(listings)
        .set({ embedding, embeddingModel: EMBEDDING_MODEL })
        .where(orm.eq(listings.id, Number(id)));
    },
    (id) => markMediaFailed(Number(id)),
  );

  assertMostlyWorked("embed", pinRows.length + listingRows.length, pinFails + listingFails);
  log.info(
    `embed: ${pinRows.length - pinFails} pins, ${listingRows.length - listingFails} listings` +
      (pinFails + listingFails ? ` (${pinFails + listingFails} image failures, retried next cycle)` : ""),
  );
}

async function embedAll(
  rows: { id: string | number; urls: string[] }[],
  save: (id: string | number, embedding: number[]) => Promise<void>,
  onFail?: (id: string | number) => Promise<void>,
): Promise<number> {
  let failures = 0;
  const queue = [...rows];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        let lastError: unknown;
        let done = false;
        // A dead first photo shouldn't leave a listing unscored when its other photos load.
        for (const url of row.urls) {
          try {
            await save(row.id, await embedImage(url));
            done = true;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (!done) {
          failures++;
          log.warn(`embed failed for ${row.id} on all ${row.urls.length} images`, lastError instanceof Error ? lastError.message : lastError);
          await onFail?.(row.id);
        }
      }
    }),
  );
  return failures;
}
