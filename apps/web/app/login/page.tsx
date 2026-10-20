import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next ?? "/";
  return (
    <section className="flex max-w-sm flex-col gap-s4">
      <h1 className="m-0 font-heading text-[40px] font-normal leading-none">Owner</h1>
      <p className="m-0 text-[13px] text-ink-soft">Anyone can browse. Log in to rate, save and change settings.</p>
      <LoginForm next={next} />
    </section>
  );
}
