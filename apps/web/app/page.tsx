import { Disclaimer } from "@/components/Disclaimer";
import { UploadForm } from "@/components/UploadForm";

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="mb-3 text-sm font-medium uppercase tracking-widest text-accent">
        Home-safety screening
      </p>
      <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">
        Spot possible trip and access hazards in a room photo.
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
        Upload a photo of a bathroom, bedroom or living room. AgeProof AI marks things that may be
        worth discussing with an occupational therapist, and explains why in plain language.
      </p>

      <div className="mt-10">
        <UploadForm />
      </div>

      <div className="mt-10 grid gap-4 text-sm text-muted sm:grid-cols-3">
        <p>
          <strong className="block text-ink">Private by design</strong>
          Location data is removed from photos, and results stay in this browser tab.
        </p>
        <p>
          <strong className="block text-ink">Grounded</strong>
          Every highlight comes from a detected region of the photo, never a guess.
        </p>
        <p>
          <strong className="block text-ink">Made for OT visits</strong>
          Bring the findings to an occupational therapist to talk through options.
        </p>
      </div>

      <Disclaimer className="mt-10" />
    </div>
  );
}
