import type { Metadata } from "next";
import Link from "next/link";
import { AddBook } from "@/components/AddBook";

export const metadata: Metadata = { title: "Add a book" };

export default function AddBookPage() {
  return (
    <>
      <Link href="/library" className="text-[0.9375rem] font-semibold text-cloth underline underline-offset-[3px]">
        Back to library
      </Link>
      <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight">Add a book</h1>
      <AddBook />
    </>
  );
}
