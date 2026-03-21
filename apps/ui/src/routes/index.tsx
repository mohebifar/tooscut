import { createFileRoute } from "@tanstack/react-router";
import { Header } from "../components/header";
import { HeroSection } from "../components/hero";
import { FeatureSection } from "../components/feature-section";
import { Footer } from "../components/footer";

export const Route = createFileRoute("/")({ component: LandingPage });

function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1">
        <HeroSection />

        <section className="py-20 px-4">
          <div className="mx-auto max-w-5xl mb-12 text-center">
            <h2 className="font-semibold text-2xl md:text-3xl text-foreground">
              Everything you need to edit
            </h2>
            <p className="mt-2 text-muted-foreground text-sm md:text-base max-w-lg mx-auto">
              Built on WebGPU and Rust/WASM for performance that rivals native apps.
            </p>
          </div>
          <FeatureSection />
        </section>
      </main>

      <Footer />
    </div>
  );
}
