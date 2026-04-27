import { createServerFn } from "@tanstack/react-start";

import { getAuthenticatedUser } from "./auth";
import { db, dbRead } from "./db-client";

export interface ProjectRow {
  id: string;
  name: string;
  settings: Record<string, {}>;
  content: Record<string, {}>;
  thumbnail: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export const listActiveProjects = createServerFn({ method: "GET" }).handler(async () => {
  const { sub } = getAuthenticatedUser();

  const rows = await dbRead<ProjectRow[]>`
    SELECT id, name, settings, thumbnail, archived, created_at, updated_at
    FROM projects
    WHERE user_id = ${sub} AND archived = FALSE
    ORDER BY updated_at DESC
  `;

  return [...rows];
});

export const listArchivedProjects = createServerFn({ method: "GET" }).handler(async () => {
  const { sub } = getAuthenticatedUser();

  const rows = await dbRead<ProjectRow[]>`
    SELECT id, name, settings, thumbnail, archived, created_at, updated_at
    FROM projects
    WHERE user_id = ${sub} AND archived = TRUE
    ORDER BY updated_at DESC
  `;

  return [...rows];
});

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  return getAuthenticatedUser();
});

export const getProject = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { sub } = getAuthenticatedUser();
    const rows = await dbRead<ProjectRow[]>`
      SELECT *
      FROM projects
      WHERE id = ${id} AND user_id = ${sub}
      LIMIT 1
    `;

    return rows[0] ?? null;
  });

interface CreateProjectInput {
  id: string;
  name: string;
  settings: Record<string, {}>;
  content: Record<string, {}>;
}

export const createProject = createServerFn({ method: "POST" })
  .inputValidator((p: CreateProjectInput) => p)
  .handler(async ({ data }) => {
    const { sub } = getAuthenticatedUser();

    await db`
      INSERT INTO projects (id, user_id, name, settings, content)
      VALUES (${data.id}, ${sub}, ${data.name}, ${data.settings as never}, ${data.content as never})
    `;

    return { id: data.id };
  });

interface UpsertProjectInput {
  id: string;
  name?: string;
  settings?: Record<string, {}>;
  content?: Record<string, {}>;
  thumbnail?: string;
}

export const upsertProject = createServerFn({ method: "POST" })
  .inputValidator((p: UpsertProjectInput) => p)
  .handler(async ({ data }) => {
    const { sub } = getAuthenticatedUser();

    await db`
      UPDATE projects
      SET
        name       = COALESCE(${data.name ?? null}, name),
        settings   = COALESCE(${(data.settings as never) ?? null}, settings),
        content    = COALESCE(${(data.content as never) ?? null}, content),
        thumbnail  = COALESCE(${data.thumbnail ?? null}, thumbnail),
        updated_at = now()
      WHERE id = ${data.id} AND user_id = ${sub}
    `;
  });

interface ArchiveInput {
  id: string;
  archived: boolean;
}

export const setProjectArchived = createServerFn({ method: "POST" })
  .inputValidator((p: ArchiveInput) => p)
  .handler(async ({ data }) => {
    const { sub } = getAuthenticatedUser();

    await db`
      UPDATE projects
      SET archived = ${data.archived}, updated_at = now()
      WHERE id = ${data.id} AND user_id = ${sub}
    `;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { sub } = getAuthenticatedUser();

    await db`DELETE FROM projects WHERE id = ${id} AND user_id = ${sub}`;
  });
