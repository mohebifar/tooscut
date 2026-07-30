/// <reference types="vite/client" />
import { fromConfig } from 'fumadocs-mdx/runtime/vite';
import type * as Config from './source.config';

export const create = fromConfig<typeof Config>();

export const blog = create.doc("blog", "./content/blog", import.meta.glob(["./**/*.{mdx,md}"], {
  "base": "./content/blog",
  "query": {
    "collection": "blog"
  }
}));

export const docs = {
  doc: create.doc("docs", "./content/docs", import.meta.glob(["./**/*.{mdx,md}"], {
    "base": "./content/docs",
    "query": {
      "collection": "docs"
    }
  })),
  meta: create.meta("docs", "./content/docs", import.meta.glob(["./**/*.{json,yaml}"], {
    "import": "default",
    "base": "./content/docs",
    "query": {
      "collection": "docs"
    }
  }))
};