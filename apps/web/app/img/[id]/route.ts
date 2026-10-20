import { cutouts, db, listings, orm } from "@mall/db";
import { sizedImageUrl } from "@mall/sources";

/** Background-removed cutout when the worker has made one, otherwise a sized source photo. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Bad id", { status: 400 });

  const [cutout] = await db().select({ webp: cutouts.webp }).from(cutouts).where(orm.eq(cutouts.listingId, id));
  if (cutout) {
    return new Response(new Uint8Array(cutout.webp), {
      headers: { "content-type": "image/webp", "cache-control": "public, max-age=604800, immutable" },
    });
  }

  const [listing] = await db().select({ images: listings.images }).from(listings).where(orm.eq(listings.id, id));
  const src = listing?.images[0];
  if (!src) return new Response("Not found", { status: 404 });
  return new Response(null, {
    status: 302,
    // Short cache: the worker may cut this one out soon, and then the route should serve that instead.
    headers: { location: sizedImageUrl(src, 600), "cache-control": "public, max-age=300" },
  });
}
