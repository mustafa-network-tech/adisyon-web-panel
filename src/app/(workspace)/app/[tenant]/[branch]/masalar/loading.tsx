export default function TablesLoading() {
  return <div className="animate-pulse p-4 sm:p-6 lg:p-8"><div className="h-10 w-64 rounded-xl bg-[#e5e9e7]" /><div className="mt-7 flex gap-2"><div className="h-11 w-24 rounded-xl bg-white" /><div className="h-11 w-24 rounded-xl bg-white" /></div><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-40 rounded-[22px] bg-white" />)}</div></div>;
}
