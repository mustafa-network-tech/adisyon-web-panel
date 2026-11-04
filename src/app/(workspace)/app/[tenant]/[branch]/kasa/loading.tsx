export default function CheckoutLoading() {
  return <section className="animate-pulse p-4 sm:p-6 lg:p-8"><div className="h-10 w-64 rounded-xl bg-[#e2e7e4]" /><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-32 rounded-2xl bg-white" />)}</div><div className="mt-5 grid gap-5 xl:grid-cols-[1fr_430px]"><div className="h-[520px] rounded-[24px] bg-white" /><div className="h-[520px] rounded-[24px] bg-white" /></div></section>;
}
