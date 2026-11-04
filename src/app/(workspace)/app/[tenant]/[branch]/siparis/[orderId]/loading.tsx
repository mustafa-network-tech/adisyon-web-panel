export default function OrderLoading() {
  return (
    <section className="animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="h-11 w-36 rounded-xl bg-[#e8ecea]" />
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="h-44 rounded-[24px] bg-white" />
          <div className="h-96 rounded-[24px] bg-white" />
        </div>
        <div className="h-72 rounded-[24px] bg-white" />
      </div>
    </section>
  );
}
