import { findSaleAlerts, renderAlertEmail } from "@mall/alerts";
import { loadRules } from "@mall/config";
import Link from "next/link";
import { isOwner } from "@/lib/auth";

/** Owner-only: what a sale alert would say right now, rendered as it would be emailed. */
export default async function AlertsPage() {
  if (!(await isOwner())) {
    return (
      <p className="font-heading text-[22px] italic text-ink-muted">
        Alerts are for the owner. <Link href="/login?next=/alerts" className="text-accent underline">Log in</Link>
      </p>
    );
  }
  const minDrop = loadRules().alerts.min_drop_pct;
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "");
  const alerts = await findSaleAlerts(minDrop, siteUrl);
  const email = alerts.length ? renderAlertEmail(alerts, siteUrl) : null;
  return (
    <section className="flex flex-col gap-s3">
      <h1 className="m-0 font-heading text-[40px] font-normal leading-none">Sale alerts</h1>
      <p className="m-0 max-w-[62ch] text-[13px] text-ink-soft">
        The only email the mall sends. It goes out when something you saved drops {minDrop}% or more below its price when you
        saved it, or when a watch&apos;s best match is marked down that much. One email per drop, never a recap.
      </p>
      {email ? (
        <>
          <span className="text-[12px] text-ink-muted">Pending now · Subject: {email.subject}</span>
          <iframe title="Alert preview" srcDoc={email.html} className="h-[700px] w-full max-w-[600px] border border-divider bg-white" />
        </>
      ) : (
        <p className="font-heading text-[22px] italic text-ink-muted">Nothing has dropped enough to email about right now.</p>
      )}
    </section>
  );
}
