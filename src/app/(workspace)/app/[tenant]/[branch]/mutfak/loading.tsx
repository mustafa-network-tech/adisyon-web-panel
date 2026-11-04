export default function KitchenLoading() {
  return (
    <section className="animate-pulse p-4 sm:p-6 lg:p-8">
      <div className="h-10 w-64 rounded-xl bg-[#e2e7e4]" />
      <div className="mt-8 grid gap-5 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-[520px] rounded-[24px] bg-[#e7ebe9]" />
        ))}
      </div>
    </section>
  );
}
