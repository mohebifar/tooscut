import { createFileRoute } from "@tanstack/react-router";

import { FaqsSection } from "../components/faqs-section";
import { FeatureSection } from "../components/feature-section";
import { Footer } from "../components/footer";
import { Header } from "../components/header";
import { HeroSection } from "../components/hero";

export const Route = createFileRoute("/")({ component: LandingPage });

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="flex-1">
        <HeroSection />

        <section className="px-4 py-20">
          <div className="mx-auto mb-12 max-w-5xl text-center">
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl">
              Everything you need to edit
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground md:text-base">
              Built on WebGPU and Rust/WASM for performance that rivals native apps.
            </p>
          </div>
          <FeatureSection />
        </section>

        <section className="px-4 py-20">
          <FaqsSection />
        </section>
      </main>

      <Footer />
    </div>
  );
}
