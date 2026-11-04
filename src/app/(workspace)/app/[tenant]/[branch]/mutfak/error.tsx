"use client";

export default function KitchenError({ reset }: { reset: () => void }) {
  return (
    <section className="p-6 lg:p-8">
      <div className="rounded-[24px] border border-[#f1d4ca] bg-white p-8 text-center">
        <h1 className="text-2xl font-black">Mutfak akışı yüklenemedi</h1>
        <p className="mt-2 text-sm text-[#7a8580]">
          Bağlantıyı kontrol edip tüm fişleri yeniden senkronize edin.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 min-h-11 rounded-xl bg-[#17211d] px-5 text-sm font-black text-white"
        >
          Yeniden dene
        </button>
      </div>
    </section>
  );
}
