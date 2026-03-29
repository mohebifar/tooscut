import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FaqsSection() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-7 px-4">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold md:text-4xl">Frequently Asked Questions</h2>
        <p className="max-w-2xl text-muted-foreground">
          Common questions about Tooscut, its capabilities, and how it compares to traditional video
          editors.
        </p>
      </div>
      <Accordion className="rounded-lg border" collapsible type="single">
        {questions.map((item) => (
          <AccordionItem className="px-4" key={item.id} value={item.id}>
            <AccordionTrigger className="py-4 hover:no-underline focus-visible:underline focus-visible:ring-0">
              {item.title}
            </AccordionTrigger>
            <AccordionContent className="pb-4! text-muted-foreground">
              {item.content}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="text-muted-foreground">
        Have another question?{" "}
        <a
          className="text-primary hover:underline"
          href="https://github.com/nicepkg/tooscut/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open an issue on GitHub
        </a>
      </p>
    </div>
  );
}

const questions = [
  {
    id: "license",
    title: "Is Tooscut open source? Can I use it commercially?",
    content:
      "Tooscut is source-available under the ELv2 license. You can freely use it to produce commercial video content. The license only restricts embedding the editor itself into a competing hosted product. If you're editing videos for your business, YouTube channel, or clients, you're good to go.",
  },
  {
    id: "vs-native",
    title: "Why use a browser-based editor instead of DaVinci Resolve or Premiere?",
    content:
      "Tooscut is not trying to replace desktop NLEs for feature film work. It's built for fast, accessible editing: no install, no updates, works on any machine with Chrome. It's great for short-form content, social media clips, and teams that want a shareable editing environment without heavy desktop software.",
  },
  {
    id: "browser-support",
    title: "Which browsers are supported?",
    content:
      "Tooscut requires WebGPU for GPU-accelerated rendering, which currently means Chromium-based browsers (Chrome, Edge, Arc, Brave). Safari has partial WebGPU support but may have issues. Firefox does not yet support WebGPU. We're tracking browser adoption and will expand support as WebGPU rolls out more broadly.",
  },
  {
    id: "performance",
    title: "Can the browser actually handle professional video editing?",
    content:
      "Yes, for the workloads Tooscut targets. All compositing runs in Rust/WASM on the GPU via WebGPU, the same graphics API that native apps use. Video decoding and encoding use the browser's hardware-accelerated WebCodecs API. Export streams directly to disk via the File System Access API, keeping memory usage low even for long videos.",
  },
  {
    id: "memory",
    title: "Doesn't Chrome have a 4GB memory limit per tab?",
    content:
      "Chrome limits each tab's JavaScript heap to around 4GB, but Tooscut is designed to stay well within that. Heavy work like GPU compositing, video decoding, and audio mixing all run outside the JS heap in WebGPU, WebCodecs, and WASM workers. During export, video frames stream directly to disk rather than accumulating in memory, and audio uses a windowed buffer that only keeps about 30 seconds of decoded audio per source regardless of video length.",
  },
  {
    id: "export-speed",
    title: "How fast is export compared to native editors?",
    content:
      "In our benchmarks, exporting a 1080p video in Tooscut is only about 30% slower than DaVinci Resolve. The rendering pipeline uses hardware-accelerated H.264 encoding via WebCodecs, GPU compositing via WebGPU, and parallel frame decoding in Web Workers. For most short-to-medium length projects, the difference is a matter of seconds.",
  },
  {
    id: "features",
    title: "What editing features are currently supported?",
    content:
      "Multi-track video and audio timeline, frame-accurate trimming, cross-transitions, keyframe animation for all properties (position, scale, rotation, opacity, effects), text overlays with custom fonts and RTL support, shape layers, audio mixing with per-track volume and effects, and hardware-accelerated H.264 MP4 export.",
  },
  {
    id: "embedding",
    title: "Can I embed Tooscut into my own product?",
    content:
      "The ELv2 license permits self-hosting and internal use, but does not allow offering Tooscut as a managed service that competes with the hosted product. If you're interested in an OEM or embedding license for your SaaS, please reach out via GitHub to discuss options.",
  },
  {
    id: "mobile",
    title: "Does it work on mobile or tablets?",
    content:
      "The editor UI is currently designed for desktop screen sizes. The rendering pipeline works on any device with WebGPU support, but the timeline and panel layout are not yet optimized for touch or small screens. Mobile support is on the roadmap.",
  },
  {
    id: "collaboration",
    title: "Is real-time collaboration or cloud sync planned?",
    content:
      "Not yet, but the browser-native architecture makes this a natural next step. Projects are currently stored locally in your browser via IndexedDB. Cloud storage and collaborative editing are on the long-term roadmap.",
  },
];
