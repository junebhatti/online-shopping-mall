import { buildDigest } from "@mall/digest";
import Link from "next/link";
import { isOwner } from "@/lib/auth";

/** Owner-only preview of the daily email, rendered exactly as it will be sent. */
export default async function DigestPage() {
  if (!(await isOwner())) {
    return (
      <p className="font-heading text-[22px] italic text-ink-muted">
        The digest is for the owner. <Link href="/login?next=/digest" className="text-accent underline">Log in</Link>
      </p>
    );
  }
  const digest = await buildDigest(process.env.SITE_URL?.replace(/\/$/, ""));
  return (
    <section className="flex flex-col gap-s3">
      <div className="flex flex-wrap items-baseline gap-x-s4">
        <h1 className="m-0 font-heading text-[40px] font-normal leading-none">Digest</h1>
        <span className="text-[12px] text-ink-muted">Subject: {digest.subject}</span>
      </div>
      <p className="m-0 max-w-[62ch] text-[13px] text-ink-soft">
        This is the email the worker sends each morning. It goes out once RESEND_API_KEY and DIGEST_TO are set; until then each
        day&apos;s copy is saved in .data/digests.
      </p>
      <iframe title="Digest preview" srcDoc={digest.html} className="h-[900px] w-full max-w-[600px] border border-divider bg-white" />
    </section>
  );
}
