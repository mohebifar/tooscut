import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { db } from "../state/db";

/**
 * Open state for the project settings dialog. For a new project the dialog
 * opens on mount. Closing it sets `settingsConfirmed` on the project record
 * and clears the `new` search param. A later load of the same `?new=true` URL
 * then does not open it again.
 */
export function useNewProjectSettingsDialog(projectId: string, isNewProject = false) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNewProject) return;
    let cancelled = false;
    void db.projects.get(projectId).then((project) => {
      if (!cancelled && project && !project.settingsConfirmed) {
        setOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isNewProject, projectId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && isNewProject) {
        void db.projects.update(projectId, { settingsConfirmed: true });
        void navigate({
          to: "/editor/$projectId",
          params: { projectId },
          search: {} as any, // eslint-disable-line @typescript-eslint/no-unsafe-assignment
          replace: true,
        });
      }
    },
    [isNewProject, projectId, navigate],
  );

  return [open, handleOpenChange] as const;
}
