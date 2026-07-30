import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createClientLoader } from "fumadocs-mdx/runtime/vite";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { Suspense } from "react";

import { getMDXComponents } from "@/components/mdx";
import { baseOptions } from "@/lib/layout.shared";
import { getBlogSource } from "@/lib/source";

import { blog as blogCollection } from "../../../source.generated";

const clientLoader = createClientLoader(blogCollection, {
  id: "blog",
  component({ frontmatter, default: MDX }) {
    return (
      <article className="prose prose-invert max-w-none">
        <header className="not-prose mb-10">
          <time className="text-fd-muted-foreground text-xs tracking-wide uppercase">
            {new Date(frontmatter.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">{frontmatter.title}</h1>
          {frontmatter.description ? (
            <p className="text-fd-muted-foreground mt-3 text-lg">{frontmatter.description}</p>
          ) : null}
          <p className="text-fd-muted-foreground mt-4 text-sm">by {frontmatter.author}</p>
        </header>
        <MDX components={getMDXComponents()} />
      </article>
    );
  },
});

const serverLoader = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const blog = await getBlogSource();
    const page = blog.getPage([slug]);
    if (!page) throw notFound();
    return { path: page.path };
  });

export const Route = createFileRoute("/blog/$slug")({
  component: BlogPost,
  loader: async ({ params }) => {
    const data = await serverLoader({ data: params.slug });
    await clientLoader.preload(data.path);
    return data;
  },
});

function BlogPost() {
  const { path } = Route.useLoaderData();
  const MDXComponent = clientLoader.getComponent(path);

  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16">
        <Link
          to="/blog"
          className="text-fd-muted-foreground hover:text-fd-foreground mb-8 inline-flex items-center gap-1 text-sm"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-3.5 w-3.5" />
          Back to blog
        </Link>
        <Suspense>
          <MDXComponent />
        </Suspense>
      </main>
    </HomeLayout>
  );
}
