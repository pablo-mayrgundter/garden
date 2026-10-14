import Link from "next/link";
import { SpeciesForm } from "@/components/forms";
import { requireGardener } from "@/lib/auth";

export const metadata = { title: "Add a plant" };

export default async function NewPlantPage() {
  await requireGardener();
  return (
    <>
      <div className="page-head">
        <div>
          <p className="sub"><Link href="/plants">Seed library</Link> /</p>
          <h1>Add a plant</h1>
          <p className="sub">Copy what&rsquo;s on the back of the packet — the schedule is built from it. Photos of the packet can be added on the next page.</p>
        </div>
      </div>
      <section className="card">
        <SpeciesForm />
      </section>
    </>
  );
}
